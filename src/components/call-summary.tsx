"use client";

import type { CoverageEntry, Doctor, NonCallDay, TimeLog } from "@/lib/types";
import { useMemo, useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { parseISO, format, isWithinInterval, isValid, eachDayOfInterval, isWeekend, startOfMonth, endOfMonth, subMonths, isSameDay } from "date-fns";
import { Target, Users, TrendingUp, Calendar, Pill, ThumbsUp, Building, PlaneTakeoff, RefreshCw, Percent, Briefcase, Download } from "lucide-react";
import { cn, PH_HOLIDAYS_2026 } from "@/lib/utils";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const StatCard = ({ title, value, description, icon: Icon, color, bgColor }: { title: string, value: string | number, description: string, icon: React.ElementType, color: string, bgColor?: string }) => (
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

export function CallSummary({ 
    entries = [], 
    availableMonths = [],
    doctors = [], 
    nonCallDays = [], 
    timeLogs = [], 
    isAdminView = false,
    selectedMonth,
    onMonthChange
}: { 
    entries: CoverageEntry[], 
    availableMonths?: string[],
    doctors: Doctor[], 
    nonCallDays: NonCallDay[], 
    timeLogs: TimeLog[], 
    isAdminView?: boolean,
    selectedMonth: string,
    onMonthChange: (m: string) => void
}) {
    const summaryRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const monthOptions = useMemo(() => {
        const months: Record<string, string> = {};
        
        availableMonths.forEach(m => {
            months[m] = format(parseISO(m + "-01"), 'MMMM yyyy');
        });

        // Ensure current month is always an option
        const current = format(new Date(), 'yyyy-MM');
        if (!months[current]) {
            months[current] = format(new Date(), 'MMMM yyyy');
        }

        return Object.entries(months)
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => b.value.localeCompare(a.value));
    }, [availableMonths]);

    const insights = useMemo(() => {
        if (!mounted) return null;
        
        const referenceDate = parseISO(selectedMonth + "-01");
        const start = startOfMonth(referenceDate);
        const end = endOfMonth(referenceDate);

        // [QUERY_ON_DEMAND_LOGIC] - Filtered statistics for the selected month
        const filteredEntries = (entries || []).filter(e => {
            const dateStr = (e.coverageDate || e.submittedAt || "").toString();
            if (!dateStr) return false;
            const d = parseISO(dateStr);
            return isValid(d) && isWithinInterval(d, { start, end });
        });

        const monthlyTrendMap: Record<string, number> = {};
        filteredEntries.forEach(e => {
            const dateStr = (e.coverageDate || e.submittedAt || "").toString();
            if (!dateStr) return;
            const d = parseISO(dateStr);
            if (isValid(d)) {
                const monthKey = format(d, 'yyyy-MM');
                monthlyTrendMap[monthKey] = (monthlyTrendMap[monthKey] || 0) + 1;
            }
        });
        
        const monthlyPerformance = Object.entries(monthlyTrendMap)
            .map(([month, count]) => ({
                month,
                label: format(parseISO(month + "-01"), "MMM yyyy"),
                count
            }))
            .sort((a, b) => a.month.localeCompare(b.month));

        const providerVisits = filteredEntries.reduce((acc, entry) => {
            const first = String(entry.firstName || "").toLowerCase().trim();
            const last = String(entry.lastName || "").toLowerCase().trim();
            const providerName = `${first} ${last}`;
            acc[providerName] = (acc[providerName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const highFreqDoctors = (doctors || []).filter(d => {
            const freqStr = String(d.frequency || "1x").replace('x', '');
            const freq = parseInt(freqStr, 10) || 0;
            return freq >= 3;
        });
        
        const totalHighFreqTarget = highFreqDoctors.length;
        const actualHighFreqAchieved = highFreqDoctors.filter(d => {
            const first = String(d.firstName || "").toLowerCase().trim();
            const last = String(d.lastName || "").toLowerCase().trim();
            const key = `${first} ${last}`;
            const visitCount = providerVisits[key] || 0;
            return visitCount >= 3;
        }).length;
        
        const percentageHighFreq = totalHighFreqTarget > 0 ? Math.round((actualHighFreqAchieved / totalHighFreqTarget) * 100) : 0;
        
        const totalDoctorsInList = (doctors || []).length;
        const visitedDoctorNames = new Set(filteredEntries.map(e => {
            const first = String(e.firstName || "").toLowerCase().trim();
            const last = String(e.lastName || "").toLowerCase().trim();
            return `${first} ${last}`;
        }));
        
        const actualVisitedCount = Array.from(visitedDoctorNames).length;
        const percentageReach = totalDoctorsInList > 0 ? Math.round((actualVisitedCount / totalDoctorsInList) * 100) : 0;

        const callsByDay = filteredEntries.reduce((acc, entry) => {
            const dateStr = (entry.coverageDate || entry.submittedAt || "").toString();
            const d = dateStr ? parseISO(dateStr) : null;
            if (!isValid(d)) return acc;
            const day = format(d!, 'yyyy-MM-dd');
            if(!acc[day]) acc[day] = [];
            acc[day].push(entry);
            return acc;
        }, {} as Record<string, CoverageEntry[]>);
        
        // Revised Active Days calculation: Count as 0.5 if day has calls but is also marked as Half Day Approved Leave
        const activeDaysActual = Object.keys(callsByDay).reduce((sum, dayStr) => {
            const dayDate = parseISO(dayStr);
            const isHalfDayLeave = (nonCallDays || []).some(ncd => {
                const ncdDate = typeof ncd.date === 'string' ? parseISO(ncd.date) : ncd.date;
                return ncd.status === 'approved' && 
                       (ncd.dayType === 'halfday-am' || ncd.dayType === 'halfday-pm') &&
                       isValid(ncdDate) && 
                       isSameDay(ncdDate, dayDate);
            });
            return sum + (isHalfDayLeave ? 0.5 : 1.0);
        }, 0);

        const totalCalls = filteredEntries.length;
        
        const inbaseCalls = filteredEntries.filter(e => e.coverageType === 'inbase').length;
        const outbaseCalls = filteredEntries.filter(e => e.coverageType === 'outbase').length;

        const allDaysInMonth = eachDayOfInterval({ start, end });
        const totalBusinessDaysInMonth = allDaysInMonth.filter(day => {
            if (isWeekend(day)) return false;
            const dateStr = format(day, 'yyyy-MM-dd');
            return !PH_HOLIDAYS_2026[dateStr];
        }).length;
        
        // Denominator Calculation as requested: 12 x Active Days
        const dynamicTarget = Math.round(activeDaysActual * 12);
        const callRatePercentage = dynamicTarget > 0 ? Math.round((totalCalls / dynamicTarget) * 100) : 0;

        return {
            completedHighFreq: { actual: actualHighFreqAchieved, total: totalHighFreqTarget, percentage: percentageHighFreq },
            coverageReach: { actual: actualVisitedCount, total: totalDoctorsInList, percentage: percentageReach },
            callRate: { actual: totalCalls, total: dynamicTarget, percentage: callRatePercentage },
            avgCallsPerDay: activeDaysActual > 0 ? (totalCalls / activeDaysActual).toFixed(2) : 0,
            totalWorkingDays: { actual: activeDaysActual, total: totalBusinessDaysInMonth },
            inbaseCalls,
            outbaseCalls,
            monthlyPerformance,
            topProducts: Object.entries(filteredEntries.reduce((acc, e) => {
                if (e.primaryProduct) acc[e.primaryProduct] = (acc[e.primaryProduct] || 0) + 1;
                return acc;
            }, {} as Record<string, number>)).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
            topSpecialties: Object.entries(filteredEntries.reduce((acc, e) => {
                if (e.specialty) acc[e.specialty] = (acc[e.specialty] || 0) + 1;
                return acc;
            }, {} as Record<string, number>)).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
            topSamples: Object.entries(filteredEntries.reduce((acc, e) => {
                const process = (name?: string, qty?: number) => {
                    if (!name) return;
                    const cleanName = name.trim();
                    acc[cleanName] = (acc[cleanName] || 0) + (qty || 0);
                };
                process(e.primarySampleName, e.primaryProductQty);
                process(e.secondarySampleName, e.secondaryProductQty);
                if (e.reminderProducts) {
                    e.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
                }
                return acc;
            }, {} as Record<string, number>)).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
        };
    }, [entries, doctors, nonCallDays, mounted, selectedMonth]);

    if (!mounted) return null;

    if (!insights) return (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Aggregating Performance...</p>
        </div>
    );
    
    return (
        <div className="space-y-6" ref={summaryRef}>
             <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                        <div>
                            <CardTitle className="font-headline text-2xl font-black text-primary">Performance Oversight</CardTitle>
                            <CardDescription>Territory activity and productivity analytics for the selected period.</CardDescription>
                            <div className="mt-2">
                                <Select value={selectedMonth} onValueChange={onMonthChange}>
                                    <SelectTrigger className="w-[220px] h-10 border-2 font-headline bg-muted/50">
                                        <SelectValue placeholder="Select Month" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {monthOptions.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard 
                            title="Call Rate" 
                            value={`${insights.callRate.actual}/${insights.callRate.total} (${insights.callRate.percentage}%)`} 
                            description="Calculated as 12x Active Days" 
                            icon={Percent} 
                            color="text-orange-500" 
                            bgColor="bg-orange-500/10" 
                        />
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

            {insights.monthlyPerformance.length > 0 && (
                <Card className="border-2 shadow-lg overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b">
                        <CardTitle className="font-black font-headline text-lg flex items-center gap-2"><TrendingUp className="text-primary" /> Monthly Performance</CardTitle>
                        <CardDescription>Activity status trend over time.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-80 p-6">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={insights.monthlyPerformance}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                <XAxis dataKey="label" fontSize={10} fontWeight="bold" />
                                <YAxis fontSize={10} fontWeight="bold" />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: '2px solid hsl(var(--border))' }}
                                    cursor={{ fill: 'hsl(var(--muted)/0.2)' }}
                                />
                                <Legend verticalAlign="bottom" align="center" iconType="rect" />
                                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Total Calls" barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                 <Card className="border-2 shadow-sm overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b">
                        <CardTitle className="font-black font-headline text-lg flex items-center gap-2"><Pill className="text-primary" /> Top Products</CardTitle>
                    </CardHeader>
                    <CardContent className="h-80 p-6">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={insights.topProducts} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.2} />
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="name" width={140} fontSize={10} fontWeight="bold" />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: '2px solid hsl(var(--border))' }} />
                                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Mentions" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
                <Card className="border-2 shadow-sm overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b">
                        <CardTitle className="font-black font-headline text-lg flex items-center gap-2"><Briefcase className="text-primary" /> Specialty Reach</CardTitle>
                    </CardHeader>
                    <CardContent className="h-80 p-6">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={insights.topSpecialties} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.2} />
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="name" width={140} fontSize={10} fontWeight="bold" />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: '2px solid hsl(var(--border))' }} />
                                <Bar dataKey="count" fill="hsl(var(--chart-4))" radius={[0, 4, 4, 0]} name="Visits" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-2 shadow-sm overflow-hidden">
                <CardHeader className="bg-muted/30 border-b">
                    <CardTitle className="font-black font-headline text-lg flex items-center gap-2"><ThumbsUp className="text-primary" /> Samples Distributed</CardTitle>
                    <CardDescription>Total quantities issued for primary, secondary, and reminder products.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/20 h-12">
                                <TableHead className="font-bold text-foreground pl-6">Sample Material</TableHead>
                                <TableHead className="text-right font-bold text-foreground pr-6">Qty Distributed</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {insights.topSamples.length > 0 ? (
                                insights.topSamples.map((s, i) => (
                                    <TableRow key={i} className="h-14 hover:bg-muted/10 border-b last:border-0">
                                        <TableCell className="pl-6 font-bold text-sm">{s.name}</TableCell>
                                        <TableCell className="text-right pr-6 font-mono font-black text-primary text-base">
                                            {s.count}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={2} className="h-40 text-center text-muted-foreground italic">
                                        No samples distributed for this period.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}