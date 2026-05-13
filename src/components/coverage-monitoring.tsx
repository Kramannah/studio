'use client';

import { useMemo, useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
    format, 
    startOfMonth, 
    endOfMonth, 
    eachDayOfInterval, 
    isSameDay, 
    parseISO, 
    isValid, 
    getDaysInMonth, 
    isWeekend,
    addMonths,
    subMonths
} from "date-fns";
import { 
    Activity, 
    Calendar as CalendarIcon, 
    ChevronLeft, 
    ChevronRight, 
    RefreshCw, 
    Filter,
    Download,
    Info,
    Search
} from "lucide-react";
import { collection, query, where, getDocs, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { CoverageEntry, NonCallDay, UserProfile } from "@/lib/types";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MonitoringCell {
    calls: number;
    nonCallReason?: string;
    isApproved?: boolean;
}

export function CoverageMonitoring({ userProfiles, userMap }: { userProfiles: Record<string, UserProfile>, userMap: any }) {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [entries, setEntries] = useState<CoverageEntry[]>([]);
    const [nonCallDays, setNonCallDays] = useState<NonCallDay[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const days = useMemo(() => {
        const start = startOfMonth(selectedDate);
        const end = endOfMonth(selectedDate);
        return eachDayOfInterval({ start, end });
    }, [selectedDate]);

    const fetchData = useCallback(async () => {
        if (!db || !mounted) return;
        setLoading(true);
        try {
            const startStr = startOfMonth(selectedDate).toISOString();
            const endStr = endOfMonth(selectedDate).toISOString();

            // Fetch global entries for the month
            // We use high limits since this is an admin oversight tool
            const entriesQuery = query(
                collection(db, "coverageEntries"),
                where("coverageDate", ">=", startStr),
                where("coverageDate", "<=", endStr),
                limit(5000)
            );

            const ncdQuery = query(
                collection(db, "nonCallDays"),
                where("date", ">=", startStr),
                where("date", "<=", endStr)
            );

            const [entriesSnap, ncdSnap] = await Promise.all([
                getDocs(entriesQuery),
                getDocs(ncdQuery)
            ]);

            setEntries(entriesSnap.docs.map(d => ({ id: d.id, ...d.data() } as CoverageEntry)));
            setNonCallDays(ncdSnap.docs.map(d => ({ id: d.id, ...d.data() } as NonCallDay)));
        } catch (error) {
            console.error("Monitoring fetch error:", error);
        } finally {
            setLoading(false);
        }
    }, [selectedDate, mounted]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const pmrList = useMemo(() => {
        const list = Object.values(userProfiles)
            .filter(p => p.role === 'PMR' || !p.role) // Default to PMR if no role set
            .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));

        if (!search) return list;
        const q = search.toLowerCase();
        return list.filter(p => 
            `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || 
            (p.code || "").toLowerCase().includes(q)
        );
    }, [userProfiles, search]);

    const dataMatrix = useMemo(() => {
        const matrix = new Map<string, Map<string, MonitoringCell>>();

        pmrList.forEach(p => {
            matrix.set(p.userId, new Map());
        });

        // Populate with coverage counts
        entries.forEach(e => {
            if (!e.userId || !matrix.has(e.userId)) return;
            const dateStr = format(parseISO(e.coverageDate || e.submittedAt), 'yyyy-MM-dd');
            const userMatrix = matrix.get(e.userId)!;
            const current = userMatrix.get(dateStr) || { calls: 0 };
            userMatrix.set(dateStr, { ...current, calls: current.calls + 1 });
        });

        // Populate with Non-Call Days
        nonCallDays.forEach(n => {
            if (!n.userId || !matrix.has(n.userId)) return;
            const dateStr = format(parseISO(n.date), 'yyyy-MM-dd');
            const userMatrix = matrix.get(n.userId)!;
            const current = userMatrix.get(dateStr) || { calls: 0 };
            userMatrix.set(dateStr, { 
                ...current, 
                nonCallReason: n.reason, 
                isApproved: n.status === 'approved' 
            });
        });

        return matrix;
    }, [pmrList, entries, nonCallDays]);

    const getCellColor = (data: MonitoringCell | undefined, date: Date) => {
        if (isWeekend(date)) return "bg-muted/30 opacity-50";
        if (!data) return "bg-background";

        if (data.nonCallReason && data.isApproved) {
            if (data.nonCallReason.toLowerCase().includes('holiday')) return "bg-yellow-500/20 text-yellow-600 font-bold border-yellow-500/30";
            if (data.nonCallReason.toLowerCase().includes('meeting')) return "bg-orange-500/20 text-orange-600 font-bold border-orange-500/30";
            return "bg-orange-100 text-orange-700 font-bold border-orange-200"; // General VL/SL
        }

        if (data.calls >= 10) return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
        if (data.calls > 0) return "bg-rose-500/10 text-rose-700 border-rose-500/20";
        
        return "bg-background";
    };

    const getDistrict = (pmr: UserProfile) => {
        if (pmr.managerId) {
            const manager = userProfiles[pmr.managerId];
            if (manager) {
                // Return simple code if possible or name
                return manager.lastName === 'Ignacio' ? 'VIS' : 
                       manager.lastName === 'Ligutom' ? 'MIN' : 
                       manager.lastName === 'Nonato' ? 'CL' : 
                       manager.lastName === 'Gonzales' ? 'GMAS' : 
                       manager.lastName === 'Langit' ? 'CL' :
                       manager.lastName === 'Daquioag' ? 'NL' : 'HQ';
            }
        }
        return "N/A";
    };

    if (!mounted) return null;

    return (
        <div className="space-y-6 w-full animate-in fade-in duration-500">
            <Card className="border-2 shadow-sm">
                <CardHeader className="pb-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <CardTitle className="text-2xl font-black font-headline text-primary flex items-center gap-2">
                                <Activity className="w-6 h-6" /> Organization Coverage
                            </CardTitle>
                            <CardDescription>Consolidated field audit for all representative territories.</CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input 
                                    placeholder="Search PMR..." 
                                    className="pl-9 h-11 border-2 focus-visible:ring-primary rounded-xl"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border-2">
                                <Button variant="ghost" size="icon" onClick={() => setSelectedDate(subMonths(selectedDate, 1))} className="h-9 w-9"><ChevronLeft className="h-4 w-4"/></Button>
                                <span className="px-4 font-black font-headline text-sm uppercase tracking-widest">{format(selectedDate, 'MMMM yyyy')}</span>
                                <Button variant="ghost" size="icon" onClick={() => setSelectedDate(addMonths(selectedDate, 1))} className="h-9 w-9"><ChevronRight className="h-4 w-4"/></Button>
                            </div>
                            <Button variant="outline" size="icon" onClick={fetchData} disabled={loading} className="h-11 w-11 border-2 rounded-xl">
                                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                            </Button>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-4 pt-4 border-t mt-4">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            <div className="w-3 h-3 rounded-sm bg-emerald-500/20 border border-emerald-500/40" /> Target Met (10+)
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            <div className="w-3 h-3 rounded-sm bg-rose-500/20 border border-rose-500/40" /> Low Volume
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            <div className="w-3 h-3 rounded-sm bg-orange-100 border border-orange-200" /> Approved Leave
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            <div className="w-3 h-3 rounded-sm bg-yellow-500/10 border border-yellow-500/40" /> Holiday
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <ScrollArea className="w-full">
                        <div className="w-full overflow-x-auto">
                            <table className="w-full border-collapse text-xs">
                                <thead>
                                    <tr className="bg-muted/50 h-12 border-b">
                                        <th className="sticky left-0 z-20 bg-muted/95 backdrop-blur px-4 text-left font-black uppercase tracking-widest border-r">District</th>
                                        <th className="sticky left-[80px] z-20 bg-muted/95 backdrop-blur px-4 text-left font-black uppercase tracking-widest border-r">Code</th>
                                        <th className="sticky left-[160px] z-20 bg-muted/95 backdrop-blur px-4 text-left font-black uppercase tracking-widest border-r shadow-[2px_0_5px_rgba(0,0,0,0.05)] min-w-[200px]">Representative Name</th>
                                        {days.map(day => (
                                            <th key={day.toISOString()} className={cn(
                                                "px-2 text-center font-black border-r min-w-[60px]",
                                                isWeekend(day) && "bg-muted/20"
                                            )}>
                                                <div className="flex flex-col items-center">
                                                    <span className="text-[10px] opacity-60">{format(day, 'EEE')}</span>
                                                    <span className="text-sm">{format(day, 'd')}</span>
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pmrList.map((pmr) => (
                                        <tr key={pmr.userId} className="h-10 hover:bg-muted/10 border-b group">
                                            <td className="sticky left-0 z-10 bg-background group-hover:bg-muted/5 px-4 font-bold text-muted-foreground border-r">{getDistrict(pmr)}</td>
                                            <td className="sticky left-[80px] z-10 bg-background group-hover:bg-muted/5 px-4 font-mono font-bold text-primary border-r">{pmr.code || 'PMR'}</td>
                                            <td className="sticky left-[160px] z-10 bg-background group-hover:bg-muted/5 px-4 font-black border-r shadow-[2px_0_5px_rgba(0,0,0,0.05)] truncate">
                                                {pmr.lastName}, {pmr.firstName}
                                            </td>
                                            {days.map(day => {
                                                const dateKey = format(day, 'yyyy-MM-dd');
                                                const cellData = dataMatrix.get(pmr.userId)?.get(dateKey);
                                                const colorClass = getCellColor(cellData, day);
                                                
                                                return (
                                                    <td 
                                                        key={dateKey} 
                                                        className={cn(
                                                            "text-center border-r transition-colors p-0",
                                                            colorClass
                                                        )}
                                                    >
                                                        {cellData && (
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger className="w-full h-full flex items-center justify-center p-2 outline-none">
                                                                        {cellData.nonCallReason && cellData.isApproved ? (
                                                                            <span className="text-[9px] font-black uppercase tracking-tighter leading-tight">
                                                                                {cellData.nonCallReason === 'Vacation Leave' ? 'VL' : 
                                                                                 cellData.nonCallReason === 'Sick Leave' ? 'SL' : 
                                                                                 cellData.nonCallReason.substring(0, 8)}
                                                                            </span>
                                                                        ) : cellData.calls > 0 ? (
                                                                            <span className="font-mono font-black text-xs">{cellData.calls}</span>
                                                                        ) : null}
                                                                    </TooltipTrigger>
                                                                    <TooltipContent className="font-bold border-2">
                                                                        <div className="space-y-1">
                                                                            <p>{format(day, 'MMMM d')}</p>
                                                                            {cellData.calls > 0 && <p className="text-emerald-500">{cellData.calls} Reports Submitted</p>}
                                                                            {cellData.nonCallReason && <p className="text-orange-500">Activity: {cellData.nonCallReason}</p>}
                                                                        </div>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                    {pmrList.length === 0 && (
                                        <tr>
                                            <td colSpan={days.length + 3} className="h-64 text-center text-muted-foreground italic text-lg">
                                                No representative records match your filter.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-2 shadow-sm bg-muted/20">
                    <CardHeader className="py-4">
                        <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                            <Info className="w-4 h-4 text-primary" /> Audit Insight
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground leading-relaxed">
                        The grid above calculates daily coverage based on submitted <strong>coverageDate</strong> in logs. Approved <strong>Non-Call Days</strong> are automatically identified and labeled. Weekends are shaded to facilitate quick review of weekly work cycles.
                    </CardContent>
                </Card>
                <div className="flex items-end justify-end">
                    <Button variant="outline" className="border-2 font-headline h-11 shadow-sm">
                        <Download className="mr-2 h-4 w-4" /> Export Monthly Audit (Excel)
                    </Button>
                </div>
            </div>
        </div>
    );
}
