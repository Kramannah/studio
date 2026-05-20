"use client";

import type { CoverageEntry, Doctor, NonCallDay, TimeLog } from "@/lib/types";
import { useMemo, useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getYear, parseISO, format, isWithinInterval, differenceInMinutes, isValid, getDaysInMonth, eachDayOfInterval, isWeekend, startOfMonth, endOfMonth } from "date-fns";
import { Target, Users, TrendingUp, CalendarDays, Home, Plane, AlertTriangle, Download, Send, LogIn, LogOut, Percent, Briefcase, Pill, ThumbsUp, Building, PlaneTakeoff, Loader2, Calendar, RefreshCw } from "lucide-react";
import { cn, PH_HOLIDAYS_2026 } from "@/lib/utils";
import { Button } from "./ui/button";
import * as XLSX from 'xlsx';
import { Badge } from "./ui/badge";

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
    doctors = [], 
    nonCallDays = [], 
    timeLogs = [], 
    isAdminView = false
}: { 
    entries: CoverageEntry[], 
    doctors: Doctor[], 
    nonCallDays: NonCallDay[], 
    timeLogs: TimeLog[], 
    isAdminView?: boolean
}) {
    const summaryRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const insights = useMemo(() => {
        if (!mounted) return null;
        
        const now = new Date();
        const start = startOfMonth(now);
        const end = endOfMonth(now);

        const filteredEntries = (entries || []).filter(e => {
            const dateStr = (e.coverageDate || e.submittedAt || "").toString();
            if (!dateStr) return false;
            const d = parseISO(dateStr);
            return isValid(d) && isWithinInterval(d, { start, end });
        });

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
        
        const totalWorkingDays = Object.keys(callsByDay).length;
        const totalCalls = filteredEntries.length;
        const avgCallsPerDay = totalWorkingDays > 0 ? (totalCalls / totalWorkingDays).toFixed(2) : 0;
        
        const monthlyPerformance = (entries || []).reduce((acc, entry) => {
            const dateStr = (entry.coverageDate || entry.submittedAt || "").toString();
            const date = dateStr ? parseISO(dateStr) : null;
            if (!isValid(date)) return acc;
            const monthKey = format(date!, 'MMM yyyy');
            const existing = acc.find(d => d.name === monthKey);
            if(existing) existing.calls += 1;
            else acc.push({ name: monthKey, calls: 1, date: date! });
            return acc;
        }, [] as {name: string, calls: number, date: Date}[]).sort((a,b) => a.date.getTime() - b.date.getTime()).slice(-6);

        const inbaseCalls = filteredEntries.filter(e => e.coverageType === 'inbase').length;
        const outbaseCalls = filteredEntries.filter(e => e.coverageType === 'outbase').length;

        const originalMonthlyTarget = (doctors || []).reduce((acc, doc) => {
            const freqStr = String(doc.frequency || "1x").replace('x', '');
            return acc + (parseInt(freqStr, 10) || 0);
        }, 0);
        
        const allDaysInMonth = eachDayOfInterval({ start, end });
        
        const totalBusinessDaysInMonth = allDaysInMonth.filter(day => {
            if (isWeekend(day)) return false;
            const dateStr = format(day, 'yyyy-MM-dd');
            return !PH_HOLIDAYS_2026[dateStr];
        }).length;
        
        const dailyTarget = totalBusinessDaysInMonth > 0 ? originalMonthlyTarget / totalBusinessDaysInMonth : 0;
        
        const approvedNonCallDaysCount = (nonCallDays || [])
            .filter(ncd => {
                const d = typeof ncd.date === 'string' ? parseISO(ncd.date) : ncd.date;
                return ncd.status === 'approved' && isWithinInterval(d, { start, end });
            })
            .reduce((acc, ncd) => ncd.dayType === 'wholeday' ? acc + 1 : acc + 0.5, 0);
        
        const adjustedTarget = (totalBusinessDaysInMonth - approvedNonCallDaysCount) * dailyTarget;
        const callRatePercentage = adjustedTarget > 0 ? Math.round((totalCalls / adjustedTarget) * 100) : 0;

        return {
            completedHighFreq: { actual: actualHighFreqAchieved, total: totalHighFreqTarget, percentage: percentageHighFreq },
            coverageReach: { actual: actualVisitedCount, total: totalDoctorsInList, percentage: percentageReach },
            callRate: { actual: totalCalls, total: Math.round(adjustedTarget), percentage: callRatePercentage },
            avgCallsPerDay,
            totalWorkingDays: { actual: totalWorkingDays, total: totalBusinessDaysInMonth },
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
    }, [entries, doctors, nonCallDays, mounted]);

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
                            <CardDescription>Territory activity and productivity analytics for {format(new Date(), 'MMMM yyyy')}.</CardDescription>
                        </div>
                        <Button variant="outline" onClick={() => {}} className="border-2 h-11 font-headline mt-4 md:mt-0"><Download className="mr-2 h-4 w-4"/> Excel</Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard title="Call Rate" value={`${insights.callRate.actual}/${insights.callRate.total} (${insights.callRate.percentage}%)`} description="Monthly activity target" icon={Percent} color="text-orange-500" bgColor="bg-orange-500/10" />
                        <StatCard title="Concentration (3x)" value={`${insights.completedHighFreq.actual}/${insights.completedHighFreq.total} (${insights.completedHighFreq.percentage}%)`} description="High frequency retention" icon={Target} color="text-primary" bgColor="bg-primary/10" />
                        <StatCard title="Call Reach" value={`${insights.coverageReach.actual}/${insights.coverageReach.total} (${insights.coverageReach.percentage}%)`} description="Territory penetration" icon={Users} color="text-teal-500" bgColor="bg-teal-500/10" />
                        <StatCard title="Efficiency" value={insights.avgCallsPerDay} description="Avg daily submissions" icon={TrendingUp} color="text-blue-500" bgColor="bg-blue-500/10" />
                    </div>

                    <div className="mt-8 border-t-2 pt-8">
                        <CardTitle className="font-headline font-black mb-4">Field Activity Statistics</CardTitle>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <StatCard title="Working Days" value={`${insights.totalWorkingDays.actual}/${insights.totalWorkingDays.total}`} description="Active vs Business Days" icon={Calendar} color="text-green-500" bgColor="bg-green-500/10" />
                            <StatCard title="Inbase Calls" value={insights.inbaseCalls} description="Metropolitan submissions" icon={Building} color="text-sky-500" bgColor="bg-sky-500/10" />
                            <StatCard title="Outbase Calls" value={insights.outbaseCalls} description="Provincial submissions" icon={PlaneTakeoff} color="text-rose-500" bgColor="bg-rose-500/10" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-2 shadow-lg overflow-hidden">
                <CardHeader className="bg-muted/30 border-b">
                    <CardTitle className="text-xl font-black font-headline">Monthly Performance</CardTitle>
                    <CardDescription>Total calls over the last 6 months.</CardDescription>
                </CardHeader>
                <CardContent className="p-6 h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={insights.monthlyPerformance} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground) / 0.2)" />
                            <XAxis 
                                dataKey="name" 
                                fontSize={12} 
                                fontWeight="bold" 
                                tickLine={false} 
                                axisLine={false} 
                                dy={10}
                            />
                            <YAxis 
                                fontSize={12} 
                                fontWeight="bold" 
                                tickLine={false} 
                                axisLine={false} 
                                tickFormatter={(val) => `${val}`}
                            />
                            <Tooltip 
                                cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                                contentStyle={{ borderRadius: '12px', border: '2px solid hsl(var(--border))', fontWeight: 'bold' }}
                            />
                            <Legend verticalAlign="bottom" height={36}/>
                            <Bar 
                                dataKey="calls" 
                                fill="hsl(var(--primary))" 
                                radius={[4, 4, 0, 0]} 
                                name="Total Calls"
                                barSize={60}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

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