
"use client";

import type { CoverageEntry, Doctor, NonCallDay, TimeLog } from "@/lib/types";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, parseISO, isWithinInterval, isValid, eachDayOfInterval, isWeekend, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import { Target, Users, TrendingUp, Calendar, Pill, ThumbsUp, Building, PlaneTakeoff, RefreshCw, Percent } from "lucide-react";
import { cn } from "@/lib/utils";

const StatCard = ({ title, value, description, icon: Icon, color, bgColor }: { title: string, value: string | number, description: string, icon: any, color: string, bgColor?: string }) => (
    <Card className={cn(bgColor)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="font-black text-[10px] uppercase tracking-widest">{title}</CardDescription>
            <Icon className={cn("w-6 h-6 text-muted-foreground", color)} />
        </CardHeader>
        <CardContent>
            <CardTitle className="text-2xl font-black font-headline">{value}</CardTitle>
            <p className="text-[10px] text-muted-foreground pt-1 font-medium">{description}</p>
        </CardContent>
    </Card>
)

export function CallSummary({ entries = [], doctors = [], nonCallDays = [], timeLogs = [] }: { entries: CoverageEntry[], doctors: Doctor[], nonCallDays: NonCallDay[], timeLogs: TimeLog[] }) {
    const insights = useMemo(() => {
        if (!entries) return null;
        const today = new Date();
        const start = startOfMonth(today);
        const end = endOfMonth(today);

        const filteredEntries = entries.filter(e => {
            try { const d = parseISO(e.submittedAt); return isValid(d) && isWithinInterval(d, { start, end }); } catch { return false; }
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
                const day = format(parseISO(entry.submittedAt), 'yyyy-MM-dd');
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
        const inbaseCalls = filteredEntries.filter(e => e.coverageType === 'inbase').length;
        const outbaseCalls = filteredEntries.filter(e => e.coverageType === 'outbase').length;
        
        const totalBusinessDaysInMonth = eachDayOfInterval({ start, end }).filter(day => !isWeekend(day)).length;
        const callRatePercentage = activeDaysActual > 0 ? Math.round((totalCalls / (activeDaysActual * 12)) * 100) : 0;

        return {
            completedHighFreq: { actual: actualHighFreqAchieved, total: totalHighFreqTarget, percentage: percentageHighFreq },
            coverageReach: { actual: actualVisitedCount, total: totalDoctorsInList, percentage: percentageReach },
            callRate: { percentage: callRatePercentage },
            avgCallsPerDay: activeDaysActual > 0 ? (totalCalls / activeDaysActual).toFixed(2) : 0,
            totalWorkingDays: { actual: activeDaysActual, total: totalBusinessDaysInMonth },
            inbaseCalls,
            outbaseCalls,
            topSamples: Object.entries(filteredEntries.reduce((acc, e) => {
                const process = (name?: string, qty?: number) => { if (name) acc[name] = (acc[name] || 0) + (qty || 0); };
                process(e.primarySampleName, e.primaryProductQty);
                process(e.secondarySampleName, e.secondaryProductQty);
                if (e.reminderProducts) e.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
                return acc;
            }, {} as Record<string, number>)).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
        };
    }, [entries, doctors, nonCallDays]);

    if (!insights) return <div className="flex items-center justify-center p-20"><RefreshCw className="animate-spin text-primary" /></div>;
    
    return (
        <div className="space-y-6">
             <Card><CardHeader><CardTitle className="font-headline text-2xl font-black text-primary">Performance Oversight</CardTitle><CardDescription>Real-time analytics for the current active month.</CardDescription></CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard title="Call Rate" value={`${insights.callRate.percentage}%`} description="Target achievement vs active days" icon={Percent} color="text-orange-500" bgColor="bg-orange-500/10" />
                        <StatCard title="Concentration (3x)" value={`${insights.completedHighFreq.actual}/${insights.completedHighFreq.total} (${insights.completedHighFreq.percentage}%)`} description="High frequency retention" icon={Target} color="text-primary" bgColor="bg-primary/10" />
                        <StatCard title="Call Reach" value={`${insights.coverageReach.actual}/${insights.coverageReach.total} (${insights.coverageReach.percentage}%)`} description="Territory penetration" icon={Users} color="text-teal-500" bgColor="bg-teal-500/10" />
                        <StatCard title="Efficiency" value={insights.avgCallsPerDay} description="Avg daily submissions" icon={TrendingUp} color="text-blue-500" bgColor="bg-blue-500/10" />
                    </div>
                    <div className="mt-8 border-t-2 pt-8">
                        <CardTitle className="font-headline font-black mb-4">Field Activity Statistics</CardTitle>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <StatCard title="Active Days" value={insights.totalWorkingDays.actual} description="Unique days with submissions" icon={Calendar} color="text-green-500" bgColor="bg-green-500/10" />
                            <StatCard title="Inbase Calls" value={insights.inbaseCalls} description="Metropolitan submissions" icon={Building} color="text-sky-500" bgColor="bg-sky-500/10" />
                            <StatCard title="Outbase Calls" value={insights.outbaseCalls} description="Provincial submissions" icon={PlaneTakeoff} color="text-rose-500" bgColor="bg-rose-500/10" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-2 shadow-sm overflow-hidden">
                <CardHeader className="bg-muted/30 border-b"><CardTitle className="font-black font-headline text-lg flex items-center gap-2"><ThumbsUp className="text-primary" /> Samples Distributed</CardTitle><CardDescription>Total quantities issued for primary, secondary, and reminder products.</CardDescription></CardHeader>
                <CardContent className="p-0">
                    <Table><TableHeader><TableRow className="bg-muted/20 h-12"><TableHead className="font-bold text-foreground pl-6">Sample Material</TableHead><TableHead className="text-right font-bold text-foreground pr-6">Qty Distributed</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {insights.topSamples.length > 0 ? (insights.topSamples.map((s, i) => (
                                    <TableRow key={i} className="h-14 hover:bg-muted/10 border-b last:border-0"><TableCell className="pl-6 font-bold text-sm">{s.name}</TableCell><TableCell className="text-right pr-6 font-mono font-black text-primary text-base">{s.count}</TableCell></TableRow>
                                ))) : (<TableRow><TableCell colSpan={2} className="h-40 text-center text-muted-foreground italic">No samples distributed for this period.</TableCell></TableRow>)}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
