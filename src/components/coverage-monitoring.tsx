
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
    isWeekend,
    addMonths,
    subMonths
} from "date-fns";
import { 
    Activity, 
    ChevronLeft, 
    ChevronRight, 
    RefreshCw, 
    Search,
    Info,
    Download
} from "lucide-react";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

    const getDistrictLabel = useCallback((pmr: UserProfile) => {
        if (pmr.managerId) {
            const manager = userProfiles[pmr.managerId];
            if (manager) {
                const name = manager.lastName;
                if (name === 'Ignacio') return 'VIS';
                if (name === 'Ligutom') return 'MIN';
                if (name === 'Nonato') return 'CL';
                if (name === 'Gonzales') return 'GMAS';
                if (name === 'Langit') return 'CL';
                if (name === 'Daquioag') return 'NL';
                if (name === 'Cabangon') return 'LSL';
                return 'HQ';
            }
        }
        return pmr.code?.split('-')[0] || "N/A";
    }, [userProfiles]);

    const pmrList = useMemo(() => {
        const list = Object.values(userProfiles)
            .filter(p => p.role === 'PMR' || !p.role)
            .sort((a, b) => {
                const districtA = getDistrictLabel(a);
                const districtB = getDistrictLabel(b);
                if (districtA !== districtB) return districtA.localeCompare(districtB);
                return (a.lastName || "").localeCompare(b.lastName || "");
            });

        if (!search) return list;
        const q = search.toLowerCase();
        return list.filter(p => 
            `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || 
            (p.code || "").toLowerCase().includes(q) ||
            getDistrictLabel(p).toLowerCase().includes(q)
        );
    }, [userProfiles, search, getDistrictLabel]);

    const dataMatrix = useMemo(() => {
        const matrix = new Map<string, Map<string, MonitoringCell>>();

        pmrList.forEach(p => {
            matrix.set(p.userId, new Map());
        });

        entries.forEach(e => {
            if (!e.userId || !matrix.has(e.userId)) return;
            const dateStr = format(parseISO(e.coverageDate || e.submittedAt), 'yyyy-MM-dd');
            const userMatrix = matrix.get(e.userId)!;
            const current = userMatrix.get(dateStr) || { calls: 0 };
            userMatrix.set(dateStr, { ...current, calls: current.calls + 1 });
        });

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

    const getCellStyles = (data: MonitoringCell | undefined, date: Date) => {
        if (!data) {
            if (isWeekend(date)) return "bg-muted/10 opacity-30";
            return "bg-background";
        }

        if (data.nonCallReason && data.isApproved) {
            const reason = data.nonCallReason.toLowerCase();
            if (reason.includes('holiday') || reason.includes('holy week')) {
                return "bg-yellow-100 text-yellow-800 font-bold border-yellow-200 text-[10px]";
            }
            if (reason.includes('meeting') || reason.includes('training') || reason.includes('marketing')) {
                return "bg-orange-100 text-orange-800 font-bold border-orange-200 text-[9px]";
            }
            return "bg-orange-100 text-orange-800 font-bold border-orange-200 text-[10px]";
        }

        if (data.calls >= 10) {
            return "bg-emerald-100 text-emerald-800 font-bold border-emerald-200 text-xs";
        }
        
        if (data.calls > 0) {
            return "bg-rose-100 text-rose-800 font-bold border-rose-200 text-xs";
        }
        
        if (isWeekend(date)) return "bg-muted/10 opacity-30";
        return "bg-background";
    };

    const getCellContent = (data: MonitoringCell | undefined) => {
        if (!data) return null;
        if (data.nonCallReason && data.isApproved) {
            const r = data.nonCallReason.toLowerCase();
            if (r.includes('holy week')) return "Holy week";
            if (r.includes('holiday')) return "Holiday";
            if (r.includes('vacation')) return "VL";
            if (r.includes('sick')) return "SL";
            if (r.includes('meeting')) return "Meeting";
            if (r.includes('training')) return "Training";
            return data.nonCallReason.substring(0, 8);
        }
        if (data.calls > 0) return data.calls.toString();
        return null;
    };

    if (!mounted) return null;

    return (
        <div className="space-y-6 w-full animate-in fade-in duration-500">
            <Card className="border-2 shadow-sm">
                <CardHeader className="pb-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <CardTitle className="text-2xl font-black font-headline text-primary flex items-center gap-2">
                                <Activity className="w-6 h-6" /> Organization Coverage Grid
                            </CardTitle>
                            <CardDescription>Consolidated field activity audit for all representative territories.</CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input 
                                    placeholder="Search District/PMR..." 
                                    className="pl-9 h-11 border-2 focus-visible:ring-primary rounded-xl"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border-2">
                                <Button variant="ghost" size="icon" onClick={() => setSelectedDate(subMonths(selectedDate, 1))} className="h-9 w-9"><ChevronLeft className="h-4 w-4"/></Button>
                                <span className="px-4 font-black font-headline text-sm uppercase tracking-widest">{format(selectedDate, 'MMM yyyy')}</span>
                                <Button variant="ghost" size="icon" onClick={() => setSelectedDate(addMonths(selectedDate, 1))} className="h-9 w-9"><ChevronRight className="h-4 w-4"/></Button>
                            </div>
                            <Button variant="outline" size="icon" onClick={fetchData} disabled={loading} className="h-11 w-11 border-2 rounded-xl">
                                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                            </Button>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-4 pt-4 border-t mt-4">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            <div className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-300" /> 10+ Calls
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            <div className="w-3 h-3 rounded-sm bg-rose-100 border border-rose-300" /> &lt; 10 Calls
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            <div className="w-3 h-3 rounded-sm bg-orange-100 border border-orange-300" /> Leave/Activity
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            <div className="w-3 h-3 rounded-sm bg-yellow-100 border border-yellow-300" /> Holiday
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <ScrollArea className="w-full">
                        <div className="w-full overflow-x-auto">
                            <table className="w-full border-collapse border-spacing-0">
                                <thead>
                                    <tr className="bg-muted/80 h-12 border-b">
                                        <th className="sticky left-0 z-30 bg-muted px-4 text-left font-black uppercase tracking-widest border-r text-[10px] min-w-[70px]">District</th>
                                        <th className="sticky left-[70px] z-30 bg-muted px-4 text-left font-black uppercase tracking-widest border-r text-[10px] min-w-[80px]">CODE</th>
                                        <th className="sticky left-[150px] z-30 bg-muted px-4 text-left font-black uppercase tracking-widest border-r shadow-[2px_0_5px_rgba(0,0,0,0.1)] text-[10px] min-w-[180px]">NAME</th>
                                        {days.map(day => (
                                            <th key={day.toISOString()} className={cn(
                                                "px-1 text-center font-black border-r min-w-[65px] text-[10px] whitespace-nowrap",
                                                isWeekend(day) && "bg-muted/20"
                                            )}>
                                                <div className="flex flex-col items-center">
                                                    <span>{format(day, 'd-MMM')}</span>
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pmrList.map((pmr) => (
                                        <tr key={pmr.userId} className="h-10 hover:bg-muted/5 border-b group">
                                            <td className="sticky left-0 z-20 bg-background group-hover:bg-muted/10 px-4 font-bold text-muted-foreground border-r text-[11px]">{getDistrictLabel(pmr)}</td>
                                            <td className="sticky left-[70px] z-20 bg-background group-hover:bg-muted/10 px-4 font-mono font-bold text-primary border-r text-[11px]">{pmr.code || 'PMR'}</td>
                                            <td className="sticky left-[150px] z-20 bg-background group-hover:bg-muted/10 px-4 font-bold border-r shadow-[2px_0_5px_rgba(0,0,0,0.05)] truncate text-[11px]">
                                                {pmr.lastName}, {pmr.firstName}
                                            </td>
                                            {days.map(day => {
                                                const dateKey = format(day, 'yyyy-MM-dd');
                                                const cellData = dataMatrix.get(pmr.userId)?.get(dateKey);
                                                const styleClass = getCellStyles(cellData, day);
                                                
                                                return (
                                                    <td 
                                                        key={dateKey} 
                                                        className={cn(
                                                            "text-center border-r transition-all p-0 h-10",
                                                            styleClass
                                                        )}
                                                    >
                                                        {cellData ? (
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <div className="w-full h-full flex items-center justify-center p-1 outline-none text-center leading-tight cursor-default">
                                                                            {getCellContent(cellData)}
                                                                        </div>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent className="font-bold border-2 bg-background p-3 shadow-xl">
                                                                        <div className="space-y-1">
                                                                            <p className="text-sm text-primary">{format(day, 'MMMM d, yyyy')}</p>
                                                                            {cellData.calls > 0 && <p className="text-xs">{cellData.calls} Reports Submitted</p>}
                                                                            {cellData.nonCallReason && <p className="text-xs text-orange-600">Activity: {cellData.nonCallReason}</p>}
                                                                            {!cellData.nonCallReason && cellData.calls === 0 && <p className="text-xs text-muted-foreground italic">No submissions</p>}
                                                                        </div>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                        ) : null}
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
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                            <Info className="w-4 h-4 text-primary" /> Audit Methodology
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-[11px] text-muted-foreground leading-relaxed">
                        Data is aggregated daily based on the <strong>coverageDate</strong> in logs. Green cells indicate technical target compliance (10+). Approved <strong>Non-Call Days</strong> (VL, SL, Meetings) are cross-referenced from leave requests. Weekend periods are visually shaded to distinguish standard reporting cycles.
                    </CardContent>
                </Card>
                <div className="flex items-center justify-end gap-3">
                    <Button variant="outline" className="border-2 font-headline h-11 shadow-sm">
                        <Download className="mr-2 h-4 w-4" /> Export Report (Excel)
                    </Button>
                </div>
            </div>
        </div>
    );
}
