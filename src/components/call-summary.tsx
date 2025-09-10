

"use client";

import type { CoverageEntry, Doctor, NonCallDay, TimeLog } from "@/lib/types";
import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getYear, isThisMonth, parseISO, format, isWithinInterval, startOfDay, endOfDay, differenceInMinutes, isValid } from "date-fns";
import { Target, CheckCircle2, TrendingUp, CalendarDays, Home, Plane, AlertTriangle, Users, Download, Calendar as CalendarIcon, Trash2, Clock, User, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import * as XLSX from 'xlsx';
import { DateRange } from "react-day-picker";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const StatCard = ({ title, value, description, icon: Icon, color }: { title: string, value: string | number, description: string, icon: React.ElementType, color: string }) => (
    <Card>
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

export function CallSummary({ entries, doctors, nonCallDays, timeLogs, clearTimeLogs }: { entries: CoverageEntry[], doctors: Doctor[], nonCallDays: NonCallDay[], timeLogs: TimeLog[], clearTimeLogs: () => void }) {
    const [filterRange, setFilterRange] = useState<DateRange | undefined>();
    const [selectedRange, setSelectedRange] = useState<DateRange | undefined>();


    const insights = useMemo(() => {
        if (entries.length === 0 && doctors.length === 0) {
            return {
                completed3x: { actual: 0, total: 0, percentage: 0 },
                coverageReach: { actual: 0, total: 0, percentage: 0 },
                avgCallsPerDay: 0,
                totalWorkingDays: 0,
                totalInbaseDays: 0,
                totalOutbaseDays: 0,
                monthlyPerformance: [],
                isDataAvailable: false,
            };
        }

        const filteredEntries = entries.filter(e => {
            if (!filterRange || !filterRange.from) {
                return isThisMonth(new Date(e.submittedAt));
            }
            const from = startOfDay(filterRange.from);
            const to = filterRange.to ? endOfDay(filterRange.to) : endOfDay(from);
            return isWithinInterval(new Date(e.submittedAt), { start: from, end: to });
        });
        
        const providerVisits = filteredEntries.reduce((acc, entry) => {
            const providerName = `${entry.firstName.toLowerCase()} ${entry.lastName.toLowerCase()}`;
            acc[providerName] = (acc[providerName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const target3xPlusDoctors = doctors.filter(d => d.frequency === '3x' || d.frequency === '4x');
        const total3xPlusTarget = target3xPlusDoctors.length;
        const actual3xPlusCompleted = target3xPlusDoctors.filter(d => {
            const visitCount = providerVisits[`${d.firstName.toLowerCase()} ${d.lastName.toLowerCase()}`] || 0;
            return visitCount >= 3;
        }).length;
        const percentage3x = total3xPlusTarget > 0 ? Math.round((actual3xPlusCompleted / total3xPlusTarget) * 100) : 0;
        
        const totalDoctors = doctors.length;
        const visitedDoctorNames = new Set(filteredEntries.map(e => `${e.firstName.toLowerCase()} ${e.lastName.toLowerCase()}`));
        const actualVisitedCount = visitedDoctorNames.size;
        const percentageReach = totalDoctors > 0 ? Math.round((actualVisitedCount / totalDoctors) * 100) : 0;

        const callsByDay = filteredEntries.reduce((acc, entry) => {
            const day = new Date(entry.submittedAt).toISOString().split('T')[0];
            acc[day] = (acc[day] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const totalWorkingDays = Object.keys(callsByDay).length;
        const totalCalls = filteredEntries.length;
        const avgCallsPerDay = totalWorkingDays > 0 ? (totalCalls / totalWorkingDays).toFixed(2) : 0;
        
        const inbaseDays = new Set(filteredEntries.filter(e => e.coverageType === 'inbase').map(e => new Date(e.submittedAt).toISOString().split('T')[0]));
        const outbaseDays = new Set(filteredEntries.filter(e => e.coverageType === 'outbase').map(e => new Date(e.submittedAt).toISOString().split('T')[0]));
        
        const monthlyPerformance = entries.reduce((acc, entry) => {
            const date = new Date(entry.submittedAt);
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
        
        return {
            completed3x: { actual: actual3xPlusCompleted, total: total3xPlusTarget, percentage: percentage3x },
            coverageReach: { actual: actualVisitedCount, total: totalDoctors, percentage: percentageReach },
            avgCallsPerDay,
            totalWorkingDays,
            totalInbaseDays: inbaseDays.size,
            totalOutbaseDays: outbaseDays.size,
            monthlyPerformance: monthlyPerformance.slice(-6), // last 6 months
            isDataAvailable: true,
        };
    }, [entries, doctors, filterRange]);
    
    const filteredNonCallDays = useMemo(() => {
        const sorted = [...nonCallDays].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        if (!filterRange || !filterRange.from) {
            return sorted.filter(day => isThisMonth(parseISO(day.date)));
        }
        const from = startOfDay(filterRange.from);
        const to = filterRange.to ? endOfDay(filterRange.to) : endOfDay(from);
        return sorted.filter(day => isWithinInterval(parseISO(day.date), { start: from, end: to }));
    }, [nonCallDays, filterRange]);

    const filteredTimeLogs = useMemo(() => {
        const sorted = [...timeLogs].sort((a,b) => new Date(b.timeIn).getTime() - new Date(a.timeIn).getTime());
        if (!filterRange || !filterRange.from) {
             return sorted.filter(log => isThisMonth(parseISO(log.timeIn)));
        }
        const from = startOfDay(filterRange.from);
        const to = filterRange.to ? endOfDay(filterRange.to) : endOfDay(from);
        return sorted.filter(log => isWithinInterval(parseISO(log.timeIn), { start: from, end: to }));
    }, [timeLogs, filterRange]);

    const handleDownloadSummary = () => {
        if (!filterRange || !filterRange.from) return;

        // Create a new workbook
        const workbook = XLSX.utils.book_new();

        // Call Summary Worksheet
        const header = [
            "Call Concentration", null, null,
            "Call Reach", null, null,
            "Avg Calls/Day"
        ];
        const subHeader = [
            "Target", "Actual", "Achieved",
            "Target", "Actual", "Achieved",
            null
        ];
        const data = [
            insights.completed3x.total,
            insights.completed3x.actual,
            `${insights.completed3x.percentage}%`,
            insights.coverageReach.total,
            insights.coverageReach.actual,
            `${insights.coverageReach.percentage}%`,
            insights.avgCallsPerDay
        ];
        const aoa = [header, subHeader, data];
        const worksheet = XLSX.utils.aoa_to_sheet(aoa);
        worksheet['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }, 
            { s: { r: 0, c: 3 }, e: { r: 0, c: 5 } }
        ];
        worksheet['!cols'] = [
            { wch: 15 }, { wch: 15 }, { wch: 15 },
            { wch: 15 }, { wch: 15 }, { wch: 15 },
            { wch: 15 }
        ];
        XLSX.utils.book_append_sheet(workbook, worksheet, "Call Summary");

        // Time Logs Worksheet
        if(filteredTimeLogs.length > 0) {
            const timeLogData = filteredTimeLogs.map(log => ({
                "User ID": log.userId,
                "Date": format(parseISO(log.timeIn), "PPP"),
                "Time In": format(parseISO(log.timeIn), "p"),
                "Time Out": log.timeOut ? format(parseISO(log.timeOut), "p") : 'N/A',
                "Duration (minutes)": log.timeOut ? differenceInMinutes(parseISO(log.timeOut), parseISO(log.timeIn)) : 'N/A',
                "Location Type": log.locationType
            }));
            const timeLogWorksheet = XLSX.utils.json_to_sheet(timeLogData);
            timeLogWorksheet['!cols'] = [
                { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }
            ];
            XLSX.utils.book_append_sheet(workbook, timeLogWorksheet, "Time Logs");
        }


        const fileName = `call_summary_${format(filterRange.from, 'yyyy-MM-dd')}_to_${format(filterRange.to || filterRange.from, 'yyyy-MM-dd')}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };

    const handleSendEmail = () => {
        if (!filterRange || !filterRange.from) return;
    
        const subject = `Call Summary Report: ${format(filterRange.from, 'PPP')} to ${filterRange.to ? format(filterRange.to, 'PPP') : format(filterRange.from, 'PPP')}`;
        
        let body = `Call Summary Report\n`;
        body += `Period: ${format(filterRange.from, 'PPP')} to ${filterRange.to ? format(filterRange.to, 'PPP') : format(filterRange.from, 'PPP')}\n\n`;

        body += `--- KEY METRICS ---\n`;
        body += `Call Concentration: ${insights.completed3x.actual}/${insights.completed3x.total} (${insights.completed3x.percentage}%)\n`;
        body += `Call Reach: ${insights.coverageReach.actual}/${insights.coverageReach.total} (${insights.coverageReach.percentage}%)\n`;
        body += `Avg Calls / Day: ${insights.avgCallsPerDay}\n`;
        body += `Total Working Days: ${insights.totalWorkingDays}\n`;
        body += `Inbase Days: ${insights.totalInbaseDays}\n`;
        body += `Outbase Days: ${insights.totalOutbaseDays}\n\n`;

        if (filteredTimeLogs.length > 0) {
            body += `--- TIME LOGS ---\n`;
            body += `User ID, Date, Time In, Time Out, Duration (min), Location\n`;
            filteredTimeLogs.forEach(log => {
                const duration = log.timeOut ? differenceInMinutes(parseISO(log.timeOut), parseISO(log.timeIn)) : 'N/A';
                body += `${log.userId}, ${format(parseISO(log.timeIn), "yyyy-MM-dd")}, ${format(parseISO(log.timeIn), "p")}, ${log.timeOut ? format(parseISO(log.timeOut), "p") : 'N/A'}, ${duration}, ${log.locationType}\n`;
            });
            body += '\n';
        }

        if (filteredNonCallDays.length > 0) {
            body += `--- NON-CALL DAYS ---\n`;
            body += `Date, Reason, Remarks\n`;
            filteredNonCallDays.forEach(day => {
                body += `${format(parseISO(day.date), "yyyy-MM-dd")}, ${day.reason}, ${day.remarks || 'N/A'}\n`;
            });
            body += '\n';
        }
    
        const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoLink;
    };

    const handleDateInputChange = (field: 'from' | 'to', value: string) => {
        const date = new Date(value);
        if (isValid(date)) {
            setSelectedRange(prev => ({ ...prev, [field]: date }));
        }
    };
    
    const handleApplyFilter = () => {
        setFilterRange(selectedRange);
    };


    if (!insights.isDataAvailable && nonCallDays.length === 0 && timeLogs.length === 0) {
        return (
            <Card>
                <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground">No data available to generate a call summary. Synced entries and a doctor masterlist are required.</p>
                </CardContent>
            </Card>
        );
    }
    
    return (
        <div className="space-y-6">
             <Card>
                <CardHeader>
                    <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <CardTitle className="font-headline">
                                {filterRange?.from ? "Summary for Selected Period" : "This Month's Summary"}
                            </CardTitle>
                            <CardDescription>
                                {filterRange?.from ? `Showing data from ${format(filterRange.from, "PPP")} to ${filterRange.to ? format(filterRange.to, "PPP") : format(filterRange.from, "PPP")}` : "A quick overview of your performance for the current month."}
                            </CardDescription>
                        </div>
                        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
                            <div className="flex gap-2">
                                <div className="space-y-2">
                                    <Label htmlFor="start-date">Start Date</Label>
                                    <Input 
                                        id="start-date"
                                        type="date"
                                        value={selectedRange?.from ? format(selectedRange.from, 'yyyy-MM-dd') : ''}
                                        onChange={(e) => handleDateInputChange('from', e.target.value)}
                                        className="w-full"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="end-date">End Date</Label>
                                    <Input
                                        id="end-date"
                                        type="date"
                                        value={selectedRange?.to ? format(selectedRange.to, 'yyyy-MM-dd') : ''}
                                        onChange={(e) => handleDateInputChange('to', e.target.value)}
                                        className="w-full"
                                    />
                                </div>
                            </div>
                            <Button onClick={handleApplyFilter} disabled={!selectedRange?.from}>Apply</Button>
                            <Button onClick={handleDownloadSummary} variant="outline" disabled={!filterRange || !filterRange.from}>
                                <Download className="mr-2"/>
                                Download
                            </Button>
                             <Button onClick={handleSendEmail} variant="outline" disabled={!filterRange || !filterRange.from}>
                                <Send className="mr-2"/>
                                Send via Email
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    <StatCard 
                        title="Call Concentration" 
                        value={`${insights.completed3x.actual}/${insights.completed3x.total} (${insights.completed3x.percentage}%)`} 
                        description="Actual vs. Target for 3x/4x doctors." 
                        icon={Target}
                        color="text-primary"
                    />
                    <StatCard 
                        title="Call Reach" 
                        value={`${insights.coverageReach.actual}/${insights.coverageReach.total} (${insights.coverageReach.percentage}%)`} 
                        description="Doctors visited at least once."
                        icon={Users}
                        color="text-teal-500"
                    />
                    <StatCard 
                        title="Avg Calls / Day" 
                        value={insights.avgCallsPerDay} 
                        description="Average on working days." 
                        icon={TrendingUp}
                        color="text-blue-500"
                    />
                    <StatCard 
                        title="Total Working Days" 
                        value={insights.totalWorkingDays} 
                        description="Unique days with coverage." 
                        icon={CalendarDays}
                        color="text-yellow-500"
                    />
                    <StatCard 
                        title="Inbase Days" 
                        value={insights.totalInbaseDays} 
                        description="Unique days with inbase calls."
                        icon={Home}
                        color="text-indigo-500"
                     />
                    <StatCard 
                        title="Outbase Days" 
                        value={insights.totalOutbaseDays} 
                        description="Unique days with outbase calls." 
                        icon={Plane}
                        color="text-pink-500"
                    />
                </CardContent>
            </Card>

            <Card>
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

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="font-headline">Time Log</CardTitle>
                                <CardDescription>A log of all time-in and time-out events.</CardDescription>
                            </div>
                            <Button variant="destructive" size="sm" onClick={clearTimeLogs} disabled={timeLogs.length === 0}>
                                <Trash2 className="mr-2"/> Clear History
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User ID</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Time In</TableHead>
                                        <TableHead>Time Out</TableHead>
                                        <TableHead>Location</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredTimeLogs.length > 0 ? (
                                        filteredTimeLogs.map((log) => (
                                            <TableRow key={log.id}>
                                                <TableCell className="font-mono text-xs">{log.userId}</TableCell>
                                                <TableCell className="font-medium">{format(parseISO(log.timeIn), "PPP")}</TableCell>
                                                <TableCell>{format(parseISO(log.timeIn), "p")}</TableCell>
                                                <TableCell>{log.timeOut ? format(parseISO(log.timeOut), "p") : 'N/A'}</TableCell>
                                                <TableCell className="capitalize">{log.locationType}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                <div className="flex flex-col items-center justify-center gap-2">
                                                    <Clock className="w-8 h-8 text-muted-foreground" />
                                                    <p>No time logs have been recorded for the selected period.</p>
                                                </div>
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
                        <CardDescription>A log of all submitted non-call days.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Remarks</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredNonCallDays.length > 0 ? (
                                        filteredNonCallDays.map((day) => (
                                            <TableRow key={day.id}>
                                                <TableCell className="font-medium">{format(parseISO(day.date), "PPP")}</TableCell>
                                                <TableCell>{day.reason}</TableCell>
                                                <TableCell>{day.remarks || 'N/A'}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="h-24 text-center">
                                                <div className="flex flex-col items-center justify-center gap-2">
                                                    <AlertTriangle className="w-8 h-8 text-muted-foreground" />
                                                    <p>No non-call days have been logged for the selected period.</p>
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

    




