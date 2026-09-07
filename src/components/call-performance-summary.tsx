'use client';

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    Download,
    Trophy,
    TrendingUp,
    Users,
    Target,
    Activity,
    Search,
    RefreshCw,
    AlertCircle
} from "lucide-react";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cn, PH_HOLIDAYS_2026, parseAnyDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { CoverageEntry, NonCallDay, UserProfile, Doctor } from "@/lib/types";
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { managers } from "@/lib/managers";

interface PMRPerformance {
    userId: string;
    code: string;
    name: string;
    district: string;
    managerId?: string;
    callRate: number;
    totalCalls: number;
    targetCalls: number;
    concentration: number; // 3X visits
    reach: number; // Reach against masterlist
    activeDays: number;
}

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
    const [selectedDSMId, setSelectedDSMId] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [performanceData, setPerformanceData] = useState<PMRPerformance[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
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

    const fetchPerformance = async () => {
        if (!db) return;
        
        // If super admin and no DSM selected, don't fetch anything
        if (isSuperAdmin && !selectedDSMId) {
            setPerformanceData([]);
            return;
        }

        setLoading(true);
        
        try {
            const refDate = parseISO(selectedMonth + "-01");
            const start = startOfMonth(refDate).toISOString();
            const end = endOfMonth(refDate).toISOString();
            
            const allDays = eachDayOfInterval({ start: startOfMonth(refDate), end: endOfMonth(refDate) });
            const businessDays = allDays.filter(day => !isWeekend(day) && !PH_HOLIDAYS_2026[format(day, 'yyyy-MM-dd')]).length;

            // 1. Fetch relevant data collections (Strict limit of 10,000 for Firestore compliance)
            const [entriesSnap, ncdSnap, doctorsSnap] = await Promise.all([
                getDocs(query(collection(db, "coverageEntries"), where("coverageDate", ">=", start), where("coverageDate", "<=", end), limit(10000))),
                getDocs(query(collection(db, "nonCallDays"), where("date", ">=", start), where("date", "<=", end), where("status", "==", "approved"))),
                getDocs(query(collection(db, "doctors"), limit(10000)))
            ]);

            const allEntries = entriesSnap.docs.map(d => ({ id: d.id, ...d.data() } as CoverageEntry));
            const allNCDs = ncdSnap.docs.map(d => ({ id: d.id, ...d.data() } as NonCallDay));
            const allDoctors = doctorsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Doctor));

            // 2. Filter PMRs based on authorization
            const pmrProfiles = Object.values(userProfiles).filter(p => {
                const isPmr = p.role === 'PMR' || !p.role;
                if (!isPmr) return false;
                if (isSuperAdmin) {
                    // Only show PMRs belonging to the selected DSM
                    return p.managerId === selectedDSMId;
                }
                // If DSM, only show their team
                return p.managerId === currentUserId;
            });

            // 3. Map Data by User for calculation
            const entriesByUser = new Map<string, CoverageEntry[]>();
            const ncdsByUser = new Map<string, NonCallDay[]>();
            const doctorsByUser = new Map<string, Doctor[]>();

            allEntries.forEach(e => {
                if (!entriesByUser.has(e.userId)) entriesByUser.set(e.userId, []);
                entriesByUser.get(e.userId)!.push(e);
            });

            allNCDs.forEach(n => {
                if (!n.userId || !ncdsByUser.has(n.userId)) ncdsByUser.set(n.userId, []);
                ncdsByUser.get(n.userId)?.push(n);
            });

            allDoctors.forEach(d => {
                if (!d.userId || !doctorsByUser.has(d.userId)) doctorsByUser.set(d.userId, []);
                doctorsByUser.get(d.userId)?.push(d);
            });

            // 4. Calculate Individual Performance
            const calculated: PMRPerformance[] = pmrProfiles.map(pmr => {
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
                
                // PERFORMANCE LOGIC
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

                const manager = pmr.managerId ? userProfiles[pmr.managerId] : null;
                const districtName = manager ? manager.lastName : "N/A";

                return {
                    userId: pmr.userId,
                    code: pmr.code || "PMR",
                    name: `${pmr.lastName}, ${pmr.firstName}`,
                    district: districtName,
                    managerId: pmr.managerId,
                    callRate,
                    totalCalls,
                    targetCalls,
                    concentration,
                    reach,
                    activeDays
                };
            });

            setPerformanceData(calculated.sort((a, b) => b.callRate - a.callRate));

        } catch (error) {
            console.error("Performance compilation failed:", error);
            toast({ variant: "destructive", title: "Refresh Failed", description: "Database fetch limit reached or network error." });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPerformance();
    }, [selectedMonth, selectedDSMId]);

    const filteredData = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return performanceData;
        return performanceData.filter(d => 
            d.name.toLowerCase().includes(q) || 
            d.code.toLowerCase().includes(q) || 
            d.district.toLowerCase().includes(q)
        );
    }, [performanceData, searchQuery]);

    const handleExport = () => {
        const rows = filteredData.map(d => ({
            "District": d.district,
            "Employee Code": d.code,
            "Representative": d.name,
            "Call Rate (%)": d.callRate,
            "Call Concentration (%)": d.concentration,
            "Call Reach (%)": d.reach,
            "Active Reporting Days": d.activeDays
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Performance Summary");
        
        const fileName = `PMR_Performance_${selectedMonth}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h3 className="text-2xl font-black font-headline text-primary flex items-center gap-2">
                        <Trophy className="text-yellow-500" /> Organization Rankings
                    </h3>
                    <p className="text-muted-foreground text-sm font-medium uppercase tracking-widest">Consolidated performance metrics for the selected period.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {isSuperAdmin && (
                        <div className="w-[220px]">
                            <Select value={selectedDSMId} onValueChange={setSelectedDSMId}>
                                <SelectTrigger className="h-11 font-headline border-2 rounded-xl">
                                    <SelectValue placeholder="Select District..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {managers.map(m => (
                                        <SelectItem key={m.uid} value={m.uid}>{m.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="w-[200px]">
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger className="h-11 font-headline border-2 rounded-xl">
                                <SelectValue placeholder="Period" />
                            </SelectTrigger>
                            <SelectContent>
                                {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button 
                        variant="outline" 
                        onClick={handleExport} 
                        disabled={loading || filteredData.length === 0}
                        className="h-11 font-headline border-2 rounded-xl gap-2"
                    >
                        <Download size={16} /> Export Summary
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={fetchPerformance} 
                        disabled={loading}
                        className="h-11 w-11 rounded-xl border-2"
                    >
                        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    </Button>
                </div>
            </div>

            {isSuperAdmin && !selectedDSMId ? (
                <div className="flex flex-col items-center justify-center p-20 border-2 border-dashed rounded-2xl bg-muted/5">
                    <AlertCircle className="w-10 h-10 text-muted-foreground mb-4" />
                    <p className="font-headline font-bold text-muted-foreground uppercase tracking-widest text-sm">Territory Selection Required</p>
                    <p className="text-xs text-muted-foreground mt-2">Please select a District Manager from the dropdown to load the performance rankings.</p>
                </div>
            ) : (
                <Card className="border-2 shadow-sm">
                    <CardHeader className="bg-muted/30 border-b pb-6">
                        <div className="relative max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="Filter by name or code..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 h-11 border-2 rounded-xl"
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/20">
                                    <TableRow className="h-12 hover:bg-transparent">
                                        <TableHead className="font-bold text-foreground pl-6">Rep Name</TableHead>
                                        <TableHead className="font-bold text-foreground">District</TableHead>
                                        <TableHead className="text-center font-bold text-foreground">Call Rate</TableHead>
                                        <TableHead className="text-center font-bold text-foreground">3X Conc.</TableHead>
                                        <TableHead className="text-center font-bold text-foreground">Reach</TableHead>
                                        <TableHead className="text-right pr-6 font-bold text-foreground">Active Days</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow><TableCell colSpan={6} className="h-64 text-center"><Loader2 className="animate-spin mx-auto text-primary" /></TableCell></TableRow>
                                    ) : filteredData.length > 0 ? (
                                        filteredData.map((d) => (
                                            <TableRow key={d.userId} className="h-16 hover:bg-muted/30 border-b">
                                                <TableCell className="pl-6">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-sm">{d.name}</span>
                                                        <span className="text-[10px] font-black text-primary/70 uppercase">{d.code}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-medium text-xs text-muted-foreground">{d.district}</TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex flex-col items-center">
                                                        <span className={cn("font-black font-headline text-lg", d.callRate >= 100 ? "text-[#10b981]" : "text-foreground")}>
                                                            {d.callRate}%
                                                        </span>
                                                        <div className="w-16 h-1 bg-muted rounded-full mt-1 overflow-hidden">
                                                            <div className={cn("h-full", d.callRate >= 100 ? "bg-[#10b981]" : "bg-primary")} style={{ width: `${Math.min(100, d.callRate)}%` }} />
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="secondary" className="font-mono font-bold h-7 px-3 bg-[#06b6d4]/10 text-[#06b6d4]">
                                                        {d.concentration}%
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="secondary" className="font-mono font-bold h-7 px-3 bg-[#8b5cf6]/10 text-[#8b5cf6]">
                                                        {d.reach}%
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <span className="font-mono font-bold text-sm">{d.activeDays}</span>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={6} className="h-64 text-center text-muted-foreground italic">No performance data found for this selection.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <MetricHelpCard title="Call Rate" icon={Activity} color="text-primary" desc="Measured against 12 calls per active business day." />
                <MetricHelpCard title="Concentration" icon={Target} color="text-[#06b6d4]" desc="Percentage of high-frequency (3x/4x) doctors visited 3+ times." />
                <MetricHelpCard title="Call Reach" icon={Users} color="text-[#8b5cf6]" desc="Unique doctors visited vs. total doctors in masterlist." />
            </div>
        </div>
    );
}

function MetricHelpCard({ title, icon: Icon, color, desc }: { title: string, icon: any, color: string, desc: string }) {
    return (
        <Card className="border-2 bg-muted/10">
            <CardContent className="p-4 flex gap-4 items-start">
                <div className={cn("p-2 rounded-lg bg-background border-2", color)}>
                    <Icon size={18} />
                </div>
                <div className="space-y-0.5">
                    <p className="font-bold text-sm">{title}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{desc}</p>
                </div>
            </CardContent>
        </Card>
    );
}