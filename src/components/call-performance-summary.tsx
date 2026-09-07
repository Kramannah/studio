
'use client';

import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
    format, 
    startOfMonth, 
    endOfMonth, 
    parseISO, 
    isValid,
    isSameMonth,
    subDays,
    addDays,
    startOfDay
} from "date-fns";
import { 
    Loader2, 
    FileSpreadsheet,
    Trophy,
    CheckCircle2,
    Info,
    Users
} from "lucide-react";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { parseAnyDate, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CoverageEntry, NonCallDay, UserProfile } from "@/lib/types";
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { MANAGER_TEAMS } from "@/lib/admins";
import { managers } from "@/lib/managers";
import { USER_DATA_MAP } from "@/lib/user-data";

export function CallPerformanceSummary({ 
    userProfiles 
}: { 
    userProfiles: Record<string, UserProfile>, 
    currentUserId?: string,
    isSuperAdmin: boolean 
}) {
    const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
    const [selectedManagerId, setSelectedManagerId] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const months = useMemo(() => {
        const list = [];
        const currentYear = new Date().getFullYear();
        for (let i = -6; i <= 3; i++) {
            const date = new Date(currentYear, new Date().getMonth() + i, 1);
            list.push({
                value: format(date, 'yyyy-MM'),
                label: format(date, 'MMMM yyyy')
            });
        }
        return list;
    }, []);

    const handleGenerateReport = async () => {
        if (!db || !selectedManagerId) {
            toast({ variant: "destructive", title: "Selection Required", description: "Please select a territory first." });
            return;
        }
        setLoading(true);
        
        try {
            const refDate = parseISO(selectedMonth + "-01");
            const monthStart = startOfMonth(refDate);
            const monthEnd = endOfMonth(refDate);

            // TIMEZONE BUFFER: Expand query by 24h to capture Manila (UTC+8) records safely
            const queryStart = subDays(monthStart, 1).toISOString();
            const queryEnd = addDays(monthEnd, 1).toISOString();

            // Identify Target PMRs
            const allAssignedIds = new Set<string>();
            if (selectedManagerId === "all") {
                Object.values(MANAGER_TEAMS).forEach(team => team.forEach(id => allAssignedIds.add(id)));
                Object.values(userProfiles).forEach(p => {
                    if (p.managerId && p.managerId !== 'none' && (p.role === 'PMR' || !p.role)) allAssignedIds.add(p.userId);
                });
                Object.keys(USER_DATA_MAP).forEach(uid => {
                    const isAssigned = Object.values(MANAGER_TEAMS).some(team => team.includes(uid));
                    if (isAssigned) allAssignedIds.add(uid);
                });
            } else {
                const teamIds = MANAGER_TEAMS[selectedManagerId] || [];
                const dynamicIds = Object.values(userProfiles)
                    .filter(p => p.managerId === selectedManagerId)
                    .map(p => p.userId);
                teamIds.forEach(id => allAssignedIds.add(id));
                dynamicIds.forEach(id => allAssignedIds.add(id));
            }

            const targetUserIds = Array.from(allAssignedIds);
            if (targetUserIds.length === 0) {
                toast({ variant: "destructive", title: "No PMRs Found", description: "No representatives assigned to the selected territory." });
                setLoading(false);
                return;
            }

            const excelRows: any[] = [];

            // Process each user individually for stability and index efficiency
            for (const uid of targetUserIds) {
                const [entriesSnap, ncdSnap] = await Promise.all([
                    getDocs(query(collection(db!, "coverageEntries"), where("userId", "==", uid), where("coverageDate", ">=", queryStart), where("coverageDate", "<=", queryEnd), limit(1000))),
                    getDocs(query(collection(db!, "nonCallDays"), where("userId", "==", uid), where("date", ">=", queryStart), where("date", "<=", queryEnd), limit(200)))
                ]);

                // Filter specifically for the target month in-memory to handle timezone buffer
                const uEntries = entriesSnap.docs.map(d => d.data() as CoverageEntry).filter(e => {
                    const d = parseAnyDate(e.coverageDate || e.submittedAt);
                    return d && d >= monthStart && d <= monthEnd;
                });
                const uNCDs = ncdSnap.docs.map(d => d.data() as NonCallDay).filter(n => {
                    const d = parseAnyDate(n.date);
                    return d && d >= monthStart && d <= monthEnd;
                });

                // 1. Calculate Active Days (Sum of weighted days where calls happened)
                // This logic strictly matches CallSummary.tsx for reporting consistency
                const uNcdMap = new Map<string, string>();
                uNCDs.forEach(n => {
                    if (n.status === 'approved' && n.date) {
                        const d = parseAnyDate(n.date);
                        if (d) uNcdMap.set(format(d, 'yyyy-MM-dd'), n.dayType);
                    }
                });

                const daysWithCalls = new Set<string>();
                uEntries.forEach(e => {
                    const d = parseAnyDate(e.coverageDate || e.submittedAt);
                    if (d) daysWithCalls.add(format(d, 'yyyy-MM-dd'));
                });

                let activeDaysCount = 0;
                daysWithCalls.forEach(dateStr => {
                    const leaveType = uNcdMap.get(dateStr);
                    if (leaveType === 'wholeday') {
                        activeDaysCount += 0;
                    } else if (leaveType === 'halfday-am' || leaveType === 'halfday-pm') {
                        activeDaysCount += 0.5;
                    } else {
                        activeDaysCount += 1.0;
                    }
                });

                // 2. Metrics (Numerators Only)
                const totalCallsCount = uEntries.length;

                const visitMap = new Map<string, number>();
                uEntries.forEach(e => {
                    const key = `${(e.firstName || "").toLowerCase().trim()}|${(e.lastName || "").toLowerCase().trim()}`;
                    visitMap.set(key, (visitMap.get(key) || 0) + 1);
                });

                const uniqueVisitedCount = visitMap.size;
                const highFreqAchievedCount = Array.from(visitMap.values()).filter(count => count >= 3).length;

                // 3. Metadata resolution
                const profile = userProfiles[uid];
                const meta = USER_DATA_MAP[uid];
                const mUid = profile?.managerId || Object.keys(MANAGER_TEAMS).find(mId => (MANAGER_TEAMS[mId] || []).includes(uid));
                
                let managerName = "Unassigned";
                if (mUid) {
                    const mProfile = userProfiles[mUid];
                    const mMeta = USER_DATA_MAP[mUid];
                    managerName = mProfile ? `${mProfile.lastName}, ${mProfile.firstName}` : mMeta ? `${mMeta.lastName}, ${mMeta.firstName}` : "District Manager";
                }

                excelRows.push({
                    "District Manager": managerName,
                    "Employee Code": profile?.code || meta?.code || "PMR",
                    "Representative": profile ? `${profile.lastName}, ${profile.firstName}` : meta ? `${meta.lastName}, ${meta.firstName}` : "Unknown User",
                    "Call Rate": totalCallsCount,
                    "Call Concentration": highFreqAchievedCount,
                    "Call Reach": uniqueVisitedCount,
                    "Active days": activeDaysCount
                });
            }

            excelRows.sort((a, b) => a["District Manager"].localeCompare(b["District Manager"]) || a["Representative"].localeCompare(b["Representative"]));

            const ws = XLSX.utils.json_to_sheet(excelRows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Performance Audit");
            
            const fileName = `Performance_Audit_${selectedMonth}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
            XLSX.writeFile(wb, fileName);

            toast({ title: "Audit Exported", description: `Calculated metrics for ${excelRows.length} representatives.` });

        } catch (error: any) {
            console.error("Audit Engine Error:", error);
            toast({ variant: "destructive", title: "Export Failed", description: "The server timed out or data is unavailable. Please try again." });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] w-full animate-in fade-in duration-500 space-y-8">
            <Card className="max-w-2xl w-full border-2 shadow-lg rounded-2xl overflow-hidden">
                <CardHeader className="bg-primary/5 border-b-2 text-center py-10">
                    <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                        <Trophy className="w-8 h-8 text-primary" />
                    </div>
                    <CardTitle className="text-3xl font-black font-headline text-primary tracking-tight">
                        Performance Audit Engine
                    </CardTitle>
                    <CardDescription className="text-base mt-2">
                        Extract KPI records for field personnel based on monthly activity.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-10 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <Users className="w-3 h-3" /> Select Territory
                            </p>
                            <Select value={selectedManagerId} onValueChange={setSelectedManagerId}>
                                <SelectTrigger className="h-12 font-headline border-2 rounded-xl bg-muted/30">
                                    <SelectValue placeholder="Select Territory" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Districts (Global)</SelectItem>
                                    {managers.map(m => (
                                        <SelectItem key={m.uid} value={m.uid}>
                                            {m.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Select Audit Period</p>
                            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                <SelectTrigger className="h-12 font-headline border-2 rounded-xl bg-muted/30">
                                    <SelectValue placeholder="Select Period" />
                                </SelectTrigger>
                                <SelectContent>
                                    {months.map(m => (
                                        <SelectItem key={m.value} value={m.value}>
                                            {m.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4">
                        <Button 
                            onClick={handleGenerateReport} 
                            disabled={loading || !selectedManagerId} 
                            size="lg"
                            className="w-full h-20 text-xl font-black font-headline rounded-2xl shadow-xl transition-all active:scale-95 group"
                        >
                            {loading ? (
                                <><Loader2 className="mr-3 h-6 w-6 animate-spin" /> Compiling Records...</>
                            ) : (
                                <><FileSpreadsheet className="mr-3 h-6 w-6 group-hover:scale-110 transition-transform" /> Generate Audit Report (.xlsx)</>
                            )}
                        </Button>
                        <p className="text-center text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                            {loading ? "Optimizing queries and calculating metrics..." : "Calculates raw counts and active reporting days for assigned staff"}
                        </p>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl w-full">
                <Card className="border-2 shadow-sm bg-muted/20">
                    <CardContent className="p-4 flex items-start gap-3">
                        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Calculation Consistency</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Active Days match the PMR Dashboard logic: sum of weighted days where reports were logged (adjusting for partial leaves).
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-2 shadow-sm bg-muted/20">
                    <CardContent className="p-4 flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Raw Numerators</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                KPI columns export raw counts (Total Calls, High Freq Providers, and Unique Reach) for manual target assessment.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
