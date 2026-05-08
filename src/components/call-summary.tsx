"use client";

import type { CoverageEntry, Doctor, NonCallDay, TimeLog } from "@/lib/types";
import { useMemo, useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getYear, parseISO, format, isWithinInterval, differenceInMinutes, isValid, getDaysInMonth, eachDayOfInterval, isWeekend, startOfMonth, endOfMonth, parse } from "date-fns";
import { Target, Users, TrendingUp, CalendarDays, Home, Plane, AlertTriangle, Download, Send, LogIn, LogOut, Percent, Briefcase, Pill, ThumbsUp, Building, PlaneTakeoff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import * as XLSX from 'xlsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { USER_DATA_MAP } from "@/lib/user-data";

const StatCard = ({ title, value, description, icon: Icon, color, bgColor }: { title: string, value: string | number, description: string, icon: React.ElementType, color: string, bgColor?: string }) => (
    <Card className={cn(bgColor)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="font-headline text-base">{title}</CardDescription>
            <Icon className={cn("w-6 h-6 text-muted-foreground", color)} />
        </CardHeader>
        <CardContent>
            <CardTitle className="text-2xl font-bold font-headline">{value}</CardTitle>
            <p className="text-xs text-muted-foreground pt-1">{description}</p>
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
        const monthSet = new Set<string>();
        entries.forEach(entry => {
            const submittedDate = typeof entry.submittedAt === 'string' ? parseISO(entry.submittedAt) : entry.submittedAt;
            if (isValid(submittedDate)) {
                monthSet.add(format(submittedDate, 'yyyy-MM'));
            }
        });
        // Add current month (safe because it's in useMemo)
        monthSet.add(format(new Date(), 'yyyy-MM'));

        return Array.from(monthSet).sort((a, b) => b.localeCompare(a)); 
    }, [entries]);
    
    useEffect(() => {
        if (!selectedMonth) return;
        try {
            const monthDate = parse(selectedMonth, 'yyyy-MM', new Date());
            if (isValid(monthDate)) {
                const start = startOfMonth(monthDate);
                const end = endOfMonth(monthDate);
                setAppliedRange({ start, end });
            }
        } catch (e) {}
    }, [selectedMonth]);

    const getUserName = (userId: string) => {
        const user = USER_DATA_MAP[userId];
        return user ? `${user.firstName} ${user.lastName}` : userId;
    }


    const filteredEntriesForRange = useMemo(() => {
        if (!appliedRange.start || !appliedRange.end) return [];
        const start = appliedRange.start;
        const end = appliedRange.end;
        return entries.filter(e => {
            const submittedDate = typeof e.submittedAt === 'string' ? parseISO(e.submittedAt) : e.submittedAt;
            return isValid(submittedDate) && isWithinInterval(submittedDate, { start, end });
        });
    }, [entries, appliedRange]);
    
    const filteredNonCallDays = useMemo(() => {
         if (!appliedRange.start || !appliedRange.end) return [];
        const start = appliedRange.start;
        const end = appliedRange.end;
        return nonCallDays.filter(day => {
            const dayDate = typeof day.date === 'string' ? parseISO(day.date) : day.date;
            return isValid(dayDate) && isWithinInterval(dayDate, { start, end });
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [nonCallDays, appliedRange]);


    const insights = useMemo(() => {
        const filteredEntries = filteredEntriesForRange;
        
        if (filteredEntries.length === 0 && doctors.length === 0) {
            return {
                completedHighFreq: { actual: 0, total: 0, percentage: 0 },
                coverageReach: { actual: 0, total: 0, percentage: 0 },
                callRate: { actual: 0, total: 0, percentage: 0 },
                avgCallsPerDay: 0,
                totalWorkingDays: 0,
                totalInbaseDays: 0,
                totalOutbaseDays: 0,
                incentiveDays: { total: 0, inBase: 0, outBase: 0 },
                monthlyPerformance: [],
                topProducts: [],
                topSpecialties: [],
                isDataAvailable: false,
            };
        }
        
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
        
        const inbaseDays = new Set(filteredEntries.filter(e => e.coverageType === 'inbase').map(e => {
            const submittedDate = typeof e.submittedAt === 'string' ? parseISO(e.submittedAt) : e.submittedAt;
            return isValid(submittedDate) ? format(submittedDate, 'yyyy-MM-dd') : null;
        }).filter(Boolean));

        const outbaseDays = new Set(filteredEntries.filter(e => e.coverageType === 'outbase').map(e => {
            const submittedDate = typeof e.submittedAt === 'string' ? parseISO(e.submittedAt) : e.submittedAt;
            return isValid(submittedDate) ? format(submittedDate, 'yyyy-MM-dd') : null;
        }).filter(Boolean));
        
        const monthlyPerformance = entries.reduce((acc, entry) => {
            const date = typeof entry.submittedAt === 'string' ? parseISO(entry.submittedAt) : entry.submittedAt;
            if (!isValid(date)) return acc;

            const month = date.toLocaleString('default', { month: 'short' });
            const year = getYear(date);
            const monthKey = `${month} ${year}`;

            const existing = acc.find(d => d.name === monthKey);
            if(existing) {
                existing.calls += 1;
            } else {
                acc.push({ name: monthKey, calls: 1, date });
            }
            return acc;
        }, [] as {name: string, calls: number, date: Date}[]);

        monthlyPerformance.sort((a,b) => a.date.getTime() - b.date.getTime());

        const originalMonthlyTarget = doctors.reduce((acc, doc) => {
            const freqStr = String(doc.frequency || "1x").replace('x', '');
            const frequency = parseInt(freqStr, 10) || 0;
            return acc + frequency;
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
                if (ncd.dayType === 'halfday-am' || ncd.dayType === 'halfday-pm') return acc + 0.5;
                return acc;
            }, 0);
        
        const effectiveWorkingDays = totalBusinessDaysInMonth - approvedNonCallDaysCount;
        const adjustedTarget = effectiveWorkingDays * dailyTarget;
        
        const callRatePercentage = adjustedTarget > 0 ? Math.round((totalCalls / adjustedTarget) * 100) : 0;

        const productCounts = filteredEntries.reduce((acc, entry) => {
            if (entry.primaryProduct) acc[entry.primaryProduct] = (acc[entry.primaryProduct] || 0) + 1;
            if (entry.secondaryProduct) acc[entry.secondaryProduct] = (acc[entry.secondaryProduct] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const topProducts = Object.entries(productCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const specialtyCounts = filteredEntries.reduce((acc, entry) => {
            if (entry.specialty) acc[entry.specialty] = (acc[entry.specialty] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const topSpecialties = Object.entries(specialtyCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const nonCallDayMap = filteredNonCallDays.reduce((acc, day) => {
            const dayDate = typeof day.date === 'string' ? parseISO(day.date) : day.date;
            if (isValid(dayDate)) {
                acc[format(dayDate, 'yyyy-MM-dd')] = day;
            }
            return acc;
        }, {} as Record<string, NonCallDay>);

        let incentiveDays = { total: 0, inBase: 0, outBase: 0 };
        const validIncentiveDays = new Set<string>();

        Object.entries(callsByDay).forEach(([day, dayEntries]) => {
            const callCount = dayEntries.length;
            const hasNonCallDay = !!nonCallDayMap[day];

            if (callCount >= 10 || (callCount < 10 && hasNonCallDay)) {
                validIncentiveDays.add(day);
                const isInBase = dayEntries.some(e => e.coverageType === 'inbase');
                const isOutBase = dayEntries.some(e => e.coverageType === 'outbase');

                if (isInBase) incentiveDays.inBase++;
                if (isOutBase) incentiveDays.outBase++;
            }
        });
        
        Object.keys(nonCallDayMap).forEach(day => {
            if (nonCallDayMap[day].dayType === 'wholeday') {
                validIncentiveDays.add(day);
            }
        });

        incentiveDays.total = validIncentiveDays.size;

        return {
            completedHighFreq: { actual: actualHighFreqAchieved, total: totalHighFreqTarget, percentage: percentageHighFreq },
            coverageReach: { actual: actualVisitedCount, total: totalDoctorsInList, percentage: percentageReach },
            callRate: { actual: totalCalls, total: Math.round(adjustedTarget), percentage: callRatePercentage },
            avgCallsPerDay,
            totalWorkingDays,
            totalInbaseDays: inbaseDays.size,
            totalOutbaseDays: outbaseDays.size,
            incentiveDays,
            monthlyPerformance: monthlyPerformance.slice(-6), 
            topProducts,
            topSpecialties,
            isDataAvailable: true,
        };
    }, [filteredEntriesForRange, doctors, entries, filteredNonCallDays, appliedRange.start]);
    
    const filteredTimeLogs = useMemo(() => {
        if (timeLogs.length === 0) return [];
        if (!appliedRange.start || !appliedRange.end) return [];
        const start = appliedRange.start;
        const end = appliedRange.end;
        return timeLogs.filter(log => {
            const timeInDate = typeof log.timeIn === 'string' ? parseISO(log.timeIn) : log.timeIn;
            return isValid(timeInDate) && isWithinInterval(timeInDate, { start, end });
        }).sort((a, b) => new Date(b.timeIn).getTime() - new Date(a.timeIn).getTime());
    }, [timeLogs, appliedRange]);

    const createEmailFile = (subject: string, body: string): string => {
        const emlContent = `Subject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
        return `data:message/rfc822;base64,${btoa(emlContent)}`;
    };

    const handleSendEmail = () => {
        const dateRangeString = (appliedRange.start && appliedRange.end)
            ? `${format(appliedRange.start, "MMMM yyyy")}`
            : "for This Month";

        const subject = `Call Summary Report ${dateRangeString}`;

        const body = `
Hi Team,

Please find the call summary report for the selected period.

Summary:
- Call Concentration (3x): ${insights.completedHighFreq.actual}/${insights.completedHighFreq.total} (${insights.completedHighFreq.percentage}%)
- Call Reach: ${insights.coverageReach.actual}/${insights.coverageReach.total} (${insights.coverageReach.percentage}%)
- Call Rate: ${insights.callRate.actual}/${insights.callRate.total} (${insights.callRate.percentage}%)
- Average Calls Per Day: ${insights.avgCallsPerDay}
- Total Working Days: ${insights.totalWorkingDays}
- In-base Days: ${insights.totalInbaseDays}
- Out-base Days: ${insights.totalOutbaseDays}
- Total Incentive Days: ${insights.incentiveDays.total}
- In-Base Incentive Days: ${insights.incentiveDays.inBase}
- Out-Base Incentive Days: ${insights.incentiveDays.outBase}
        `.trim();

        const emailFile = createEmailFile(subject, body);

        const a = document.createElement('a');
        a.href = emailFile;
        a.download = `call_summary_${format(new Date(), 'yyyy-MM-dd')}.eml`;
        a.click();
    };

    const handleDownloadExcel = () => {
        const summaryData = [
            { Category: "Call Performance", Metric: "Call Rate", Result: `${insights.callRate.actual}/${insights.callRate.total}`, Percentage: `${insights.callRate.percentage}%` },
            { Category: "Call Performance", Metric: "Call Concentration (3x)", Result: `${insights.completedHighFreq.actual}/${insights.completedHighFreq.total}`, Percentage: `${insights.completedHighFreq.percentage}%` },
            { Category: "Call Performance", Metric: "Call Reach", Result: `${insights.coverageReach.actual}/${insights.coverageReach.total}`, Percentage: `${insights.coverageReach.percentage}%` },
            { Category: "Daily Activity", Metric: "Avg Calls / Day", Result: insights.avgCallsPerDay, Percentage: "" },
            { Category: "Daily Activity", Metric: "Total Working Days", Result: insights.totalWorkingDays, Percentage: "" },
            { Category: "Daily Activity", Metric: "Inbase Days", Result: insights.totalInbaseDays, Percentage: "" },
            { Category: "Daily Activity", Metric: "Outbase Days", Result: insights.totalOutbaseDays, Percentage: "" },
            { Category: "HR Attendance", Metric: "Total Incentive Days", Result: insights.incentiveDays.total, Percentage: "" },
            { Category: "HR Attendance", Metric: "In-Base Incentive Days", Result: insights.incentiveDays.inBase, Percentage: "" },
            { Category: "HR Attendance", Metric: "Out-Base Incentive Days", Result: insights.incentiveDays.outBase, Percentage: "" },
        ];

        const productsData = insights.topProducts.map(p => ({ Product: p.name, Mentions: p.count }));
        const specialtiesData = insights.topSpecialties.map(s => ({ Specialty: s.name, Visits: s.count }));

        const workbook = XLSX.utils.book_new();
        
        const summarySheet = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary Metrics");

        const productsSheet = XLSX.utils.json_to_sheet(productsData);
        XLSX.utils.book_append_sheet(workbook, productsSheet, "Top Products");

        const specialtiesSheet = XLSX.utils.json_to_sheet(specialtiesData);
        XLSX.utils.book_append_sheet(workbook, specialtiesSheet, "Top Specialties");

        XLSX.writeFile(workbook, `call_summary_${selectedMonth || 'current'}_report.xlsx`);
    };


    if (!mounted) return null;

    if (entries.length === 0 && doctors.length === 0) {
        return (
            <Card>
                <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground">No data available to generate a call summary. Synced entries and a doctor masterlist are required.</p>
                </CardContent>
            </Card>
        );
    }
    
    return (
        <div className="space-y-6" ref={summaryRef}>
             <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                        <div>
                            <CardTitle className="font-headline">
                                {appliedRange.start 
                                    ? `Summary for ${format(appliedRange.start, "MMMM yyyy")}`
                                    : "This Month's Summary"
                                }
                            </CardTitle>
                            <CardDescription>A quick overview of your performance for the selected period.</CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-4 md:mt-0">
                             <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select a month" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableMonths.map(month => {
                                        try {
                                            const label = format(parse(month, 'yyyy-MM', new Date()), 'MMMM yyyy');
                                            return <SelectItem key={month} value={month}>{label}</SelectItem>
                                        } catch (e) {
                                            return null;
                                        }
                                    })}
                                </SelectContent>
                            </Select>
                            <Button variant="outline" onClick={handleDownloadExcel}><Download className="mr-2"/> Download Excel</Button>
                            <Button onClick={handleSendEmail}><Send className="mr-2"/> Send via Email</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard 
                            title="Call Rate" 
                            value={`${insights.callRate.actual}/${insights.callRate.total} (${insights.callRate.percentage}%)`} 
                            description="Actual calls vs. adjusted monthly target." 
                            icon={Percent}
                            color="text-orange-500"
                            bgColor="bg-orange-500/10"
                        />
                        <StatCard 
                            title="Call Concentration (3x)" 
                            value={`${insights.completedHighFreq.actual}/${insights.completedHighFreq.total} (${insights.completedHighFreq.percentage}%)`} 
                            description="Doctors with 3x+ target who reached at least 3 visits." 
                            icon={Target}
                            color="text-primary"
                            bgColor="bg-primary/10"
                        />
                        <StatCard 
                            title="Call Reach" 
                            value={`${insights.coverageReach.actual}/${insights.coverageReach.total} (${insights.coverageReach.percentage}%)`} 
                            description="Doctors visited at least once."
                            icon={Users}
                            color="text-teal-500"
                            bgColor="bg-teal-500/10"
                        />
                        <StatCard 
                            title="Avg Calls / Day" 
                            value={insights.avgCallsPerDay} 
                            description="Average on working days." 
                            icon={TrendingUp}
                            color="text-blue-500"
                            bgColor="bg-blue-500/10"
                        />
                        <StatCard 
                            title="Total Working Days" 
                            value={insights.totalWorkingDays} 
                            description="Unique days with coverage." 
                            icon={CalendarDays}
                            color="text-yellow-500"
                            bgColor="bg-yellow-500/10"
                        />
                        <StatCard 
                            title="Inbase Days" 
                            value={insights.totalInbaseDays} 
                            description="Unique days with inbase calls."
                            icon={Home}
                            color="text-indigo-500"
                            bgColor="bg-indigo-500/10"
                         />
                        <StatCard 
                            title="Outbase Days" 
                            value={insights.totalOutbaseDays} 
                            description="Unique days with outbase calls." 
                            icon={Plane}
                            color="text-pink-500"
                            bgColor="bg-pink-500/10"
                        />
                    </div>

                    <div className="mt-6 border-t pt-6">
                        <CardTitle className="font-headline mb-2">Attendance Allowance Summary</CardTitle>
                        <CardDescription className="mb-4">Summary for HR allowance computation.</CardDescription>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <StatCard 
                                title="Total Incentive Days" 
                                value={insights.incentiveDays.total} 
                                description="Days with >=10 calls or with valid leave." 
                                icon={ThumbsUp}
                                color="text-green-500"
                                bgColor="bg-green-500/10"
                            />
                            <StatCard 
                                title="In-Base Incentive Days" 
                                value={insights.incentiveDays.inBase} 
                                description="Incentive days with in-base activity."
                                icon={Building}
                                color="text-sky-500"
                                bgColor="bg-sky-500/10"
                            />
                            <StatCard 
                                title="Out-Base Incentive Days" 
                                value={insights.incentiveDays.outBase} 
                                description="Incentive days with out-base activity." 
                                icon={PlaneTakeoff}
                                color="text-rose-500"
                                bgColor="bg-rose-500/10"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                 <Card>
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2"><Pill />Top Products Discussed</CardTitle>
                        <CardDescription>Top 5 products mentioned in calls for the selected period.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={insights.topProducts} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" allowDecimals={false} />
                                <YAxis type="category" dataKey="name" width={150} interval={0} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "hsl(var(--background))",
                                        borderColor: "hsl(var(--border))"
                                    }}
                                />
                                <Bar dataKey="count" fill="hsl(var(--chart-2))" name="Mentions" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2"><Briefcase />Top Specialties Visited</CardTitle>
                        <CardDescription>Top 5 doctor specialties visited for the selected period.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={insights.topSpecialties} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" allowDecimals={false} />
                                <YAxis type="category" dataKey="name" width={120} interval={0} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "hsl(var(--background))",
                                        borderColor: "hsl(var(--border))"
                                    }}
                                />
                                <Bar dataKey="count" fill="hsl(var(--chart-4))" name="Visits" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="font-headline">Monthly Performance</CardTitle>
                        <CardDescription>Total calls over the last few months.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={insights.monthlyPerformance}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis allowDecimals={false} />
                                <Tooltip 
                                    contentStyle={{
                                        backgroundColor: "hsl(var(--background))",
                                        borderColor: "hsl(var(--border))"
                                    }}
                                />
                                <Legend />
                                <Bar dataKey="calls" fill="hsl(var(--primary))" name="Total Calls" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline">Time Log Summary</CardTitle>
                        <CardDescription>A record of your time-in and time-out activity.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {isAdminView && <TableHead>User</TableHead>}
                                        <TableHead>Date</TableHead>
                                        <TableHead><LogIn className="inline-block mr-1"/>Time In</TableHead>
                                        <TableHead><LogOut className="inline-block mr-1"/>Time Out</TableHead>
                                        <TableHead>Duration</TableHead>
                                        <TableHead>Location</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredTimeLogs.length > 0 ? (
                                        filteredTimeLogs.map((log) => {
                                            const timeIn = typeof log.timeIn === 'string' ? parseISO(log.timeIn) : log.timeIn;
                                            const timeOut = log.timeOut ? (typeof log.timeOut === 'string' ? parseISO(log.timeOut) : log.timeOut) : null;
                                            const duration = isValid(timeIn) && timeOut && isValid(timeOut) ? `${differenceInMinutes(timeOut, timeIn)} mins` : 'Active';
                                            
                                            return (
                                            <TableRow key={log.id}>
                                                {isAdminView && (
                                                    <TableCell>
                                                        <Badge variant="secondary" className="font-sans">{getUserName(log.userId)}</Badge>
                                                    </TableCell>
                                                )}
                                                <TableCell className="font-medium">{isValid(timeIn) ? format(timeIn, "PPP") : 'Invalid Date'}</TableCell>
                                                <TableCell>{isValid(timeIn) ? format(timeIn, "p") : 'N/A'}</TableCell>
                                                <TableCell>{timeOut && isValid(timeOut) ? format(timeOut, "p") : 'N/A'}</TableCell>
                                                <TableCell>{duration}</TableCell>
                                                <TableCell className="capitalize">{log.locationType}</TableCell>
                                            </TableRow>
                                        )})
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={isAdminView ? 6 : 5} className="h-24 text-center">
                                                No time logs for this period.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle className="font-headline">Non-Call Day</CardTitle>
                        <CardDescription>A log of all submitted non-call days in the selected period.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {isAdminView && <TableHead>User</TableHead>}
                                        <TableHead>Date</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Remarks</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredNonCallDays.length > 0 ? (
                                        filteredNonCallDays.map((day) => {
                                            const dayDate = typeof day.date === 'string' ? parseISO(day.date) : day.date;
                                            return (
                                                <TableRow key={day.id}>
                                                    {isAdminView && (
                                                        <TableCell>
                                                            <Badge variant="secondary" className="font-sans">{getUserName(day.userId)}</Badge>
                                                        </TableCell>
                                                    )}
                                                    <TableCell className="font-medium">{isValid(dayDate) ? format(dayDate, "PPP") : "Invalid Date"}</TableCell>
                                                    <TableCell>{dayTypeLabels[day.dayType] || 'N/A'}</TableCell>
                                                    <TableCell>{day.reason}</TableCell>
                                                    <TableCell>{day.remarks || 'N/A'}</TableCell>
                                                </TableRow>
                                            )
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={isAdminView ? 5 : 4} className="h-24 text-center">
                                                <div className="flex flex-col items-center justify-center gap-2">
                                                    <AlertTriangle className="w-8 h-8 text-muted-foreground" />
                                                    <p>No non-call days have been logged for this period.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}