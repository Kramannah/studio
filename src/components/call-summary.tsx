
"use client";

import type { CoverageEntry, Doctor, NonCallDay, TimeLog } from "@/lib/types";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isWithinInterval, isValid, eachDayOfInterval, isWeekend, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import { Target, Users, TrendingUp, Calendar, ThumbsUp, RefreshCw, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const StatCard = ({ title, value, description, icon: Icon, color, bgColor }: { title: string, value: string | number, description: string, icon: any, color: string, bgColor?: string }) => (
    <Card className={cn("border-none relative overflow-hidden", bgColor)}>
        <CardContent className="p-6">
            <div className="flex flex-col space-y-4">
                <div className="flex justify-between items-start">
                    <p className="font-black text-[10px] uppercase tracking-widest text-white/50">{title}</p>
                    <Icon className={cn("w-5 h-5", color)} />
                </div>
                <div className="space-y-1">
                    <h4 className="text-2xl font-black font-headline text-white tracking-tight">{value}</h4>
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-tight">{description}</p>
                </div>
            </div>
        </CardContent>
    </Card>
)

export function CallSummary({ 
    entries = [], 
    doctors = [], 
    nonCallDays = [], 
    timeLogs = [],
    selectedMonth,
    onMonthChange 
}: { 
    entries: CoverageEntry[], 
    doctors: Doctor[], 
    nonCallDays: NonCallDay[], 
    timeLogs: TimeLog[],
    selectedMonth?: string,
    onMonthChange?: (m: string) => void
}) {
    const months = useMemo(() => {
        const list = [];
        for (let i = 0; i < 12; i++) {
            const date = new Date(2026, i, 1);
            list.push({
                value: format(date, 'yyyy-MM'),
                label: format(date, 'MMMM yyyy')
            });
        }
        return list;
    }, []);

    const insights = useMemo(() => {
        if (!entries) return null;
        const referenceDate = selectedMonth ? parseISO(selectedMonth + "-01") : new Date();
        const start = startOfMonth(referenceDate);
        const end = endOfMonth(referenceDate);

        const filteredEntries = entries.filter(e => {
            try { 
                const d = parseISO(e.coverageDate || e.submittedAt); 
                return isValid(d) && isWithinInterval(d, { start, end }); 
            } catch { return false; }
        });

        const providerVisits = filteredEntries.reduce((acc, entry) => {
            const providerName = `${entry.firstName} ${entry.lastName}`.toLowerCase();
            acc[providerName] = (acc[providerName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const totalHighFreqTarget = doctors.filter(d => parseInt(String(d.frequency || "1x").replace('x', ''), 10) >= 3).length;
        const actualHighFreqAchieved = doctors.filter(d => {
            const freq = parseInt(String(d.frequency || "1x").replace('x', ''), 10);
            if (freq < 3) return false;
            return (providerVisits[`${d.firstName} ${d.lastName}`.toLowerCase()] || 0) >= 3;
        }).length;
        
        const percentageHighFreq = totalHighFreqTarget > 0 ? Math.round((actualHighFreqAchieved / totalHighFreqTarget) * 100) : 0;
        const totalDoctorsInList = doctors.length;
        const actualVisitedCount = Object.keys(providerVisits).length;
        const percentageReach = totalDoctorsInList > 0 ? Math.round((actualVisitedCount / totalDoctorsInList) * 100) : 0;

        const callsByDay = filteredEntries.reduce((acc, entry) => {
            try {
                const day = format(parseISO(entry.coverageDate || entry.submittedAt), 'yyyy-MM-dd');
                if(!acc[day]) acc[day] = [];
                acc[day].push(entry);
            } catch (e) {}
            return acc;
        }, {} as Record<string, CoverageEntry[]>);
        
        const activeDaysActual = Object.keys(callsByDay).reduce((sum, dayStr) => {
            const isHalfDayLeave = nonCallDays.some(ncd => ncd.status === 'approved' && (ncd.dayType === 'halfday-am' || ncd.dayType === 'halfday-pm') && isSameDay(parseISO(ncd.date), parseISO(dayStr)));
            return sum + (isHalfDayLeave ? 0.5 : 1.0);
        }, 0);

        const totalCalls = filteredEntries.length;
        const targetCalls = Math.round((activeDaysActual || 0) * 12);
        const callRatePercentage = targetCalls > 0 ? Math.round((totalCalls / targetCalls) * 100) : 0;

        return {
            completedHighFreq: { actual: actualHighFreqAchieved, total: totalHighFreqTarget, percentage: percentageHighFreq },
            coverageReach: { actual: actualVisitedCount, total: totalDoctorsInList, percentage: percentageReach },
            callRate: { actual: totalCalls, target: targetCalls, percentage: callRatePercentage },
            avgCallsPerDay: activeDaysActual > 0 ? (totalCalls / activeDaysActual).toFixed(2) : "0.00",
            totalWorkingDays: activeDaysActual,
            topSamples: Object.entries(filteredEntries.reduce((acc, e) => {
                const process = (name?: string, qty?: number) => { if (name) acc[name] = (acc[name] || 0) + (qty || 0); };
                process(e.primarySampleName, e.primaryProductQty);
                process(e.secondarySampleName, e.secondaryProductQty);
                if (e.reminderProducts) e.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
                return acc;
            }, {} as Record<string, number>)).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
        };
    }, [entries, doctors, nonCallDays, selectedMonth]);

    if (!insights) return <div className="flex items-center justify-center p-20"><RefreshCw className="animate-spin text-primary" /></div>;
    
    return (
        <div className="space-y-8">
             <div className="space-y-1">
                <h3 className="text-2xl font-black font-headline text-[#10b981]">Performance Oversight</h3>
                <p className="text-white/50 text-xs font-bold uppercase tracking-widest">Territory activity and productivity analytics for the selected period.</p>
            </div>

            <div className="w-[240px]">
                <Select value={selectedMonth} onValueChange={onMonthChange}>
                    <SelectTrigger className="bg-[#0a0c14] border-white/10 h-10 font-headline">
                        <SelectValue placeholder="Select Month" />
                    </SelectTrigger>
                    <SelectContent>
                        {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard 
                    title="CALL RATE" 
                    value={`${insights.callRate.actual}/${insights.callRate.target} (${insights.callRate.percentage}%)`} 
                    description="Calculated as 12x Active Days" 
                    icon={Percent} 
                    color="text-[#f59e0b]" 
                    bgColor="bg-[#241a12]" 
                />
                <StatCard 
                    title="CONCENTRATION (3X)" 
                    value={`${insights.completedHighFreq.actual}/${insights.completedHighFreq.total} (${insights.completedHighFreq.percentage}%)`} 
                    description="High frequency retention" 
                    icon={Target} 
                    color="text-[#10b981]" 
                    bgColor="bg-[#0d1e18]" 
                />
                <StatCard 
                    title="CALL REACH" 
                    value={`${insights.coverageReach.actual}/${insights.coverageReach.total} (${insights.coverageReach.percentage}%)`} 
                    description="Territory penetration" 
                    icon={Users} 
                    color="text-[#06b6d4]" 
                    bgColor="bg-[#0e1d21]" 
                />
                <StatCard 
                    title="EFFICIENCY" 
                    value={insights.avgCallsPerDay} 
                    description="Avg daily submissions" 
                    icon={TrendingUp} 
                    color="text-[#3b82f6]" 
                    bgColor="bg-[#0f172a]" 
                />
            </div>

            <div className="space-y-6">
                <h3 className="text-2xl font-black font-headline text-white">Field Activity Statistics</h3>
                
                <Card className="border border-white/5 shadow-xl overflow-hidden bg-[#0a0c14]">
                    <CardHeader className="bg-white/[0.02] border-b border-white/5">
                        <CardTitle className="font-black font-headline text-sm flex items-center gap-2 text-[#10b981]">
                            <ThumbsUp size={16} /> SAMPLE DISTRIBUTION LOG
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-white/[0.01] h-12 border-white/5">
                                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-white/50 pl-6">Sample Material</TableHead>
                                    <TableHead className="text-right font-black text-[10px] uppercase tracking-widest text-white/50 pr-6">Qty Distributed</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {insights.topSamples.length > 0 ? (
                                    insights.topSamples.map((s, i) => (
                                        <TableRow key={i} className="h-14 hover:bg-white/[0.02] border-white/5 last:border-0">
                                            <TableCell className="pl-6 font-bold text-sm text-white/90">{s.name}</TableCell>
                                            <TableCell className="text-right pr-6 font-mono font-black text-[#10b981] text-base">{s.count}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={2} className="h-40 text-center text-white/30 italic text-sm">No samples recorded for this period.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
