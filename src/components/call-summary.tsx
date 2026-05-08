"use client";

import type { CoverageEntry, Doctor, NonCallDay, TimeLog } from "@/lib/types";
import { useMemo, useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getYear, parseISO, format, isWithinInterval, differenceInMinutes, isValid, getDaysInMonth, eachDayOfInterval, isWeekend, startOfMonth, endOfMonth, parse } from "date-fns";
import { Target, Users, TrendingUp, CalendarDays, Home, Plane, AlertTriangle, Download, Send, LogIn, LogOut, Percent, Briefcase, Pill, ThumbsUp, Building, PlaneTakeoff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import * as XLSX from 'xlsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { USER_DATA_MAP } from "@/lib/user-data";

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

const dayTypeLabels: Record<NonCallDay['dayType'], string> = {
    'wholeday': 'Whole Day',
    'halfday-am': 'Half Day (AM)',
    'halfday-pm': 'Half Day (PM)',
};

export function CallSummary({ entries, doctors, nonCallDays, timeLogs, isAdminView = false }: { entries: CoverageEntry[], doctors: Doctor[], nonCallDays: NonCallDay[], timeLogs: TimeLog[], isAdminView?: boolean }) {
    const summaryRef = useRef<HTMLDivElement>(null);
    const [selectedMonth, setSelectedMonth] = useState<string>("");
    const [appliedRange, setAppliedRange] = useState<{ start?: Date; end?: Date }>({});
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const initialMonth = format(new Date(), 'yyyy-MM');
        setSelectedMonth(initialMonth);
        setMounted(true);
    }, []);

    const availableMonths = useMemo(() => {
        if (!mounted) return [];
        const monthSet = new Set<string>();
        entries.forEach(entry => {
            const submittedDate = typeof entry.submittedAt === 'string' ? parseISO(entry.submittedAt) : entry.submittedAt;
            if (isValid(submittedDate)) {
                monthSet.add(format(submittedDate, 'yyyy-MM'));
            }
        });
        monthSet.add(format(new Date(), 'yyyy-MM'));
        return Array.from(monthSet).sort((a, b) => b.localeCompare(a)); 
    }, [entries, mounted]);
    
    useEffect(() => {
        if (!selectedMonth || !mounted) return;
        try {
            const monthDate = parse(selectedMonth, 'yyyy-MM', new Date());
            if (isValid(monthDate)) {
                const start = startOfMonth(monthDate);
                const end = endOfMonth(monthDate);
                setAppliedRange({ start, end });
            }
        } catch (e) {}
    }, [selectedMonth, mounted]);

    const getUserName = (userId: string) => {
        const user = USER_DATA_MAP[userId];
        return user ? `${user.firstName} ${user.lastName}` : userId;
    }

    const filteredEntriesForRange = useMemo(() => {
        if (!mounted || !appliedRange.start || !appliedRange.end) return [];
        const start = appliedRange.start;
        const end = appliedRange.end;
        return entries.filter(e => {
            const submittedDate = typeof e.submittedAt === 'string' ? parseISO(e.submittedAt) : e.submittedAt;
            return isValid(submittedDate) && isWithinInterval(submittedDate, { start, end });
        });
    }, [entries, appliedRange, mounted]);
    
    const filteredNonCallDays = useMemo(() => {
         if (!mounted || !appliedRange.start || !appliedRange.end) return [];
        const start = appliedRange.start;
        const end = appliedRange.end;
        return nonCallDays.filter(day => {
            const dayDate = typeof day.date === 'string' ? parseISO(day.date) : day.date;
            return isValid(dayDate) && isWithinInterval(dayDate, { start, end });
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [nonCallDays, appliedRange, mounted]);

    const insights = useMemo(() => {
        if (!mounted) return null;
        const filteredEntries = filteredEntriesForRange;
        
        const providerVisits = filteredEntries.reduce((acc, entry) => {
            const providerName = `${String(entry.firstName || "").toLowerCase()} ${String(entry.lastName || "").toLowerCase()}`.trim();
            acc[providerName] = (acc[providerName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const highFreqDoctors = doctors.filter(d => {
            const freqStr = String(d.frequency || "1x").replace('x', '');
            const freq = parseInt(freqStr, 10) || 0;
            return freq >= 3;
        });
        
        const totalHighFreqTarget = highFreqDoctors.length;
        const actualHighFreqAchieved = highFreqDoctors.filter(d => {
            const key = `${String(d.firstName || "").toLowerCase()} ${String(d.lastName || "").toLowerCase()}`.trim();
            const visitCount = providerVisits[key] || 0;
            return visitCount >= 3;
        }).length;
        
        const percentageHighFreq = totalHighFreqTarget > 0 ? Math.round((actualHighFreqAchieved / totalHighFreqTarget) * 100) : 0;
        
        const totalDoctorsInList = doctors.length;
        const visitedDoctorNames = new Set(filteredEntries.map(e => `${String(e.firstName || "").toLowerCase()} ${String(e.lastName || "").toLowerCase()}`.trim()));
        const actualVisitedCount = Array.from(visitedDoctorNames).filter(name => 
            doctors.some(d => `${String(d.firstName || "").toLowerCase()} ${String(d.lastName || "").toLowerCase()}`.trim() === name)
        ).length;
        const percentageReach = totalDoctorsInList > 0 ? Math.round((actualVisitedCount / totalDoctorsInList) * 100) : 0;

        const callsByDay = filteredEntries.reduce((acc, entry) => {
            const submittedDate = typeof entry.submittedAt === 'string' ? parseISO(entry.submittedAt) : entry.submittedAt;
            if (!isValid(submittedDate)) return acc;
            const day = format(submittedDate, 'yyyy-MM-dd');
            if(!acc[day]) acc[day] = [];
            acc[day].push(entry);
            return acc;
        }, {} as Record<string, CoverageEntry[]>);
        
        const totalWorkingDays = Object.keys(callsByDay).length;
        const totalCalls = filteredEntries.length;
        const avgCallsPerDay = totalWorkingDays > 0 ? (totalCalls / totalWorkingDays).toFixed(2) : 0;
        
        const monthlyPerformance = entries.reduce((acc, entry) => {
            const date = typeof entry.submittedAt === 'string' ? parseISO(entry.submittedAt) : entry.submittedAt;
            if (!isValid(date)) return acc;
            const monthKey = format(date, 'MMM yyyy');
            const existing = acc.find(d => d.name === monthKey);
            if(existing) existing.calls += 1;
            else acc.push({ name: monthKey, calls: 1, date });
            return acc;
        }, [] as {name: string, calls: number, date: Date}[]).sort((a,b) => a.date.getTime() - b.date.getTime());

        const originalMonthlyTarget = doctors.reduce((acc, doc) => {
            const freqStr = String(doc.frequency || "1x").replace('x', '');
            return acc + (parseInt(freqStr, 10) || 0);
        }, 0);
        
        const refDate = appliedRange.start || new Date();
        const daysInMonth = getDaysInMonth(refDate);
        const allDaysInMonth = eachDayOfInterval({ start: new Date(refDate.getFullYear(), refDate.getMonth(), 1), end: new Date(refDate.getFullYear(), refDate.getMonth(), daysInMonth) });
        const totalBusinessDaysInMonth = allDaysInMonth.filter(day => !isWeekend(day)).length;
        const dailyTarget = totalBusinessDaysInMonth > 0 ? originalMonthlyTarget / totalBusinessDaysInMonth : 0;
        
        const approvedNonCallDaysCount = filteredNonCallDays
            .filter(ncd => ncd.status === 'approved')
            .reduce((acc, ncd) => {
                if (ncd.dayType === 'wholeday') return acc + 1;
                return acc + 0.5;
            }, 0);
        
        const adjustedTarget = (totalBusinessDaysInMonth - approvedNonCallDaysCount) * dailyTarget;
        const callRatePercentage = adjustedTarget > 0 ? Math.round((totalCalls / adjustedTarget) * 100) : 0;

        const topProducts = Object.entries(filteredEntries.reduce((acc, e) => {
            if (e.primaryProduct) acc[e.primaryProduct] = (acc[e.primaryProduct] || 0) + 1;
            if (e.secondaryProduct) acc[e.secondaryProduct] = (acc[e.secondaryProduct] || 0) + 1;
            return acc;
        }, {} as Record<string, number>)).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);

        const topSpecialties = Object.entries(filteredEntries.reduce((acc, e) => {
            if (e.specialty) acc[e.specialty] = (acc[e.specialty] || 0) + 1;
            return acc;
        }, {} as Record<string, number>)).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);

        let incentiveDays = { total: 0, inBase: 0, outBase: 0 };
        const nonCallDayMap = filteredNonCallDays.reduce((acc, d) => {
            const dayDate = typeof d.date === 'string' ? parseISO(d.date) : d.date;
            if (isValid(dayDate)) acc[format(dayDate, 'yyyy-MM-dd')] = d;
            return acc;
        }, {} as Record<string, NonCallDay>);

        Object.entries(callsByDay).forEach(([day, dayEntries]) => {
            if (dayEntries.length >= 10 || !!nonCallDayMap[day]) {
                incentiveDays.total++;
                if (dayEntries.some(e => e.coverageType === 'inbase')) incentiveDays.inBase++;
                if (dayEntries.some(e => e.coverageType === 'outbase')) incentiveDays.outBase++;
            }
        });
        Object.keys(nonCallDayMap).forEach(day => { if (nonCallDayMap[day].dayType === 'wholeday' && !callsByDay[day]) incentiveDays.total++; });

        return {
            completedHighFreq: { actual: actualHighFreqAchieved, total: totalHighFreqTarget, percentage: percentageHighFreq },
            coverageReach: { actual: actualVisitedCount, total: totalDoctorsInList, percentage: percentageReach },
            callRate: { actual: totalCalls, total: Math.round(adjustedTarget), percentage: callRatePercentage },
            avgCallsPerDay,
            totalWorkingDays,
            totalInbaseDays: new Set(filteredEntries.filter(e => e.coverageType === 'inbase').map(e => format(parseISO(String(e.submittedAt)), 'yyyy-MM-dd'))).size,
            totalOutbaseDays: new Set(filteredEntries.filter(e => e.coverageType === 'outbase').map(e => format(parseISO(String(e.submittedAt)), 'yyyy-MM-dd'))).size,
            incentiveDays,
            monthlyPerformance: monthlyPerformance.slice(-6), 
            topProducts,
            topSpecialties,
        };
    }, [filteredEntriesForRange, doctors, entries, filteredNonCallDays, appliedRange.start, mounted]);
    
    const filteredTimeLogs = useMemo(() => {
        if (!mounted || !appliedRange.start || !appliedRange.end) return [];
        return timeLogs.filter(log => {
            const timeInDate = typeof log.timeIn === 'string' ? parseISO(log.timeIn) : log.timeIn;
            return isValid(timeInDate) && isWithinInterval(timeInDate, { start: appliedRange.start!, end: appliedRange.end! });
        }).sort((a, b) => new Date(b.timeIn).getTime() - new Date(a.timeIn).getTime());
    }, [timeLogs, appliedRange, mounted]);

    const handleDownloadExcel = () => {
        if (!insights) return;
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
            { Category: "Call Rate", Result: `${insights.callRate.actual}/${insights.callRate.total}`, Percentage: `${insights.callRate.percentage}%` },
            { Category: "Call Reach", Result: `${insights.coverageReach.actual}/${insights.coverageReach.total}`, Percentage: `${insights.coverageReach.percentage}%` }
        ]), "Summary");
        XLSX.writeFile(workbook, `call_summary_${selectedMonth}.xlsx`);
    };

    if (!mounted) return (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Aggregating Monthly Performance...</p>
        </div>
    );

    if (!insights) return null;
    
    return (
        <div className="space-y-6" ref={summaryRef}>
             <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                        <div>
                            <CardTitle className="font-headline text-2xl font-black text-primary">Performance Oversight</CardTitle>
                            <CardDescription>Territory activity and productivity analytics.</CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-4 md:mt-0">
                             <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                <SelectTrigger className="w-[200px] border-2 h-11 font-headline">
                                    <SelectValue placeholder="Select month" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableMonths.map(month => {
                                        try {
                                            const label = format(parse(month, 'yyyy-MM', new Date()), 'MMMM yyyy');
                                            return <SelectItem key={month} value={month}>{label}</SelectItem>
                                        } catch (e) { return null; }
                                    })}
                                </SelectContent>
                            </Select>
                            <Button variant="outline" onClick={handleDownloadExcel} className="border-2 h-11 font-headline"><Download className="mr-2 h-4 w-4"/> Excel</Button>
                        </div>
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
                        <CardTitle className="font-headline font-black mb-4">Attendance Credits</CardTitle>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <StatCard title="Incentive Days" value={insights.incentiveDays.total} description="Qualified working days" icon={ThumbsUp} color="text-green-500" bgColor="bg-green-500/10" />
                            <StatCard title="In-Base Credits" value={insights.incentiveDays.inBase} description="Metropolitan activity" icon={Building} color="text-sky-500" bgColor="bg-sky-500/10" />
                            <StatCard title="Out-Base Credits" value={insights.incentiveDays.outBase} description="Provincial activity" icon={PlaneTakeoff} color="text-rose-500" bgColor="bg-rose-500/10" />
                        </div>
                    </div>
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
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
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
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="name" width={140} fontSize={10} fontWeight="bold" />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: '2px solid hsl(var(--border))' }} />
                                <Bar dataKey="count" fill="hsl(var(--chart-4))" radius={[0, 4, 4, 0]} name="Visits" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
