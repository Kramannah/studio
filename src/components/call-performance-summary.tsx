'use client';

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
    format, 
    startOfMonth, 
    endOfMonth, 
    eachDayOfInterval, 
    parseISO, 
    isValid,
    isWeekend
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
import { PH_HOLIDAYS_2026, parseAnyDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CoverageEntry, NonCallDay, UserProfile, Doctor } from "@/lib/types";
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { MANAGER_TEAMS } from "@/lib/admins";
import { managers } from "@/lib/managers";

export function CallPerformanceSummary({ 
    userProfiles, 
    currentUserId, 
    isSuperAdmin 
}: { 
    userProfiles: Record<string, UserProfile>, 
    currentUserId?: string,
    isSuperAdmin: boolean 
}) {
    const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
    const [selectedManagerId, setSelectedManagerId] = useState<string>("all");
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
        if (!db) return;
        setLoading(true);
        
        try {
            const refDate = parseISO(selectedMonth + "-01");
            const start = startOfMonth(refDate).toISOString();
            const end = endOfMonth(refDate).toISOString();
            
            const allDays = eachDayOfInterval({ start: startOfMonth(refDate), end: endOfMonth(refDate) });
            const businessDays = allDays.filter(day => !isWeekend(day) && !PH_HOLIDAYS_2026[format(day, 'yyyy-MM-dd')]).length;

            // 1. Fetch ALL relevant data (Wide Scan for Audit)
            const [entriesSnap, ncdSnap, doctorsSnap] = await Promise.all([
                getDocs(query(collection(db, "coverageEntries"), where("coverageDate", ">=", start), where("coverageDate", "<=", end), limit(10000))),
                getDocs(query(collection(db, "nonCallDays"), where("date", ">=", start), where("date", "<=", end), where("status", "==", "approved"))),
                getDocs(query(collection(db, "doctors"), limit(10000)))
            ]);

            const allEntries = entriesSnap.docs.map(d => ({ id: d.id, ...d.data() } as CoverageEntry));
            const allNCDs = ncdSnap.docs.map(d => ({ id: d.id, ...d.data() } as NonCallDay));
            const allDoctors = doctorsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Doctor));

            // 2. Map Data by User
            const entriesByUser = new Map<string, CoverageEntry[]>();
            const ncdsByUser = new Map<string, NonCallDay[]>();
            const doctorsByUser = new Map<string, Doctor[]>();

            allEntries.forEach(e => {
                if (!e.userId) return;
                if (!entriesByUser.has(e.userId)) entriesByUser.set(e.userId, []);
                entriesByUser.get(e.userId)!.push(e);
            });

            allNCDs.forEach(n => {
                if (!n.userId) return;
                if (!ncdsByUser.has(n.userId)) ncdsByUser.set(n.userId, []);
                ncdsByUser.get(n.userId)?.push(n);
            });

            allDoctors.forEach(d => {
                if (!d.userId) return;
                if (!doctorsByUser.has(d.userId)) doctorsByUser.set(d.userId, []);
                doctorsByUser.get(d.userId)?.push(d);
            });

            // 3. Identify "Assigned PMRs"
            const assignedUserIds = new Set<string>();
            Object.values(MANAGER_TEAMS).forEach(team => team.forEach(uid => assignedUserIds.add(uid)));
            Object.values(userProfiles).forEach(p => {
                if (p.managerId && p.managerId !== 'none') assignedUserIds.add(p.userId);
            });

            let pmrList = Array.from(assignedUserIds)
                .map(uid => userProfiles[uid] || { userId: uid, firstName: "Unknown", lastName: "User", role: 'PMR' })
                .filter(p => p.role === 'PMR' || !p.role);

            // Filter by DSM if selected
            if (selectedManagerId !== "all") {
                pmrList = pmrList.filter(pmr => {
                    const managerUid = pmr.managerId || Object.keys(MANAGER_TEAMS).find(mId => (MANAGER_TEAMS[mId] || []).includes(pmr.userId));
                    return managerUid === selectedManagerId;
                });
            }

            // 4. Calculate Individual Performance
            const excelRows = pmrList.map(pmr => {
                const uEntries = entriesByUser.get(pmr.userId) || [];
                const uNCDs = ncdsByUser.get(pmr.userId) || [];
                const uDoctors = doctorsByUser.get(pmr.userId) || [];

                // ACTIVE DAYS LOGIC
                let leaveDeduction = 0;
                uNCDs.forEach(n => {
                    if (n.dayType === 'wholeday') leaveDeduction += 1;
                    else if (n.dayType.includes('halfday')) leaveDeduction += 0.5;
                });
                const activeDays = Math.max(0, businessDays - leaveDeduction);
                const targetCalls = Math.round(activeDays * 12);
                
                // CALL RATE
                const totalCalls = uEntries.length;
                const callRate = targetCalls > 0 ? Math.round((totalCalls / targetCalls) * 100) : 0;

                // REACH & CONCENTRATION
                const visitMap = new Map<string, number>();
                uEntries.forEach(e => {
                    const key = `${e.firstName}|${e.lastName}`.toLowerCase().trim();
                    visitMap.set(key, (visitMap.get(key) || 0) + 1);
                });

                const uniqueVisited = visitMap.size;
                const reach = uDoctors.length > 0 ? Math.round((uniqueVisited / uDoctors.length) * 100) : 0;

                const highFreqAchieved = Array.from(visitMap.values()).filter(count => count >= 3).length;
                const highFreqTarget = uDoctors.filter(d => parseInt(String(d.frequency || '1x').replace('x', ''), 10) >= 3).length;
                const concentration = highFreqTarget > 0 ? Math.round((highFreqAchieved / highFreqTarget) * 100) : 0;

                // MANAGER RESOLUTION
                let managerName = "Unassigned";
                const managerUid = pmr.managerId || Object.keys(MANAGER_TEAMS).find(mId => (MANAGER_TEAMS[mId] || []).includes(pmr.userId));
                if (managerUid && userProfiles[managerUid]) {
                    const m = userProfiles[managerUid];
                    managerName = `${m.lastName}, ${m.firstName}`;
                }

                return {
                    "District Manager": managerName,
                    "Employee Code": pmr.code || "PMR",
                    "Representative": `${pmr.lastName}, ${pmr.firstName}`,
                    "Call Rate (%)": Math.round(callRate),
                    "Call Concentration (%)": Math.round(concentration),
                    "Call Reach (%)": Math.round(reach),
                    "Actual Working Days": activeDays
                };
            }).sort((a, b) => a["District Manager"].localeCompare(b["District Manager"]) || b["Call Rate (%)"] - a["Call Rate (%)"]);

            // 5. Generate Excel
            if (excelRows.length === 0) {
                toast({ variant: "destructive", title: "No Records Found", description: "No PMRs found for the selected manager or filters." });
                return;
            }

            const ws = XLSX.utils.json_to_sheet(excelRows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Performance Audit");
            
            const fileName = `PMR_Performance_Audit_${selectedMonth}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
            XLSX.writeFile(wb, fileName);

            toast({ title: "Export Successful", description: `Compiled records for ${excelRows.length} representatives.` });

        } catch (error: any) {
            console.error("Report generation failed:", error);
            toast({ variant: "destructive", title: "Export Failed", description: error.message || "An unexpected error occurred." });
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
                        Configure audit parameters to extract KPI records for field personnel.
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
                                    <SelectValue placeholder="All Districts" />
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
                            disabled={loading} 
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
                            {loading ? "Aggregating metrics across selected territory..." : "Calculates rate, concentration, and reach for assigned staff"}
                        </p>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl w-full">
                <Card className="border-2 shadow-sm bg-muted/20">
                    <CardContent className="p-4 flex items-start gap-3">
                        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Inclusion Logic</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                This tool extracts PMRs mapped to a District Manager. HQ, HR, or Marketing roles are excluded from this specific KPI audit.
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-2 shadow-sm bg-muted/20">
                    <CardContent className="p-4 flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">KPI Standards</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Metrics are rounded to whole numbers. Call Rate is normalized against 12 daily calls minus approved leave deductions.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
