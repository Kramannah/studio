

"use client";

import type { CoverageEntry, Doctor, NonCallDay, TimeLog } from "@/lib/types";
import { useMemo, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getYear, isThisMonth, parseISO, format, isWithinInterval, differenceInMinutes, isValid } from "date-fns";
import { Target, Users, TrendingUp, CalendarDays, Home, Plane, AlertTriangle, Download, Calendar as CalendarIcon, Send, LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";

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

const dayTypeLabels: Record<NonCallDay['dayType'], string> = {
    'wholeday': 'Whole Day',
    'halfday-am': 'Half Day (AM)',
    'halfday-pm': 'Half Day (PM)',
};

export function CallSummary({ entries, doctors, nonCallDays, timeLogs }: { entries: CoverageEntry[], doctors: Doctor[], nonCallDays: NonCallDay[], timeLogs: TimeLog[]}) {
    const summaryRef = useRef<HTMLDivElement>(null);
    const [startDate, setStartDate] = useState<Date | undefined>();
    const [endDate, setEndDate] = useState<Date | undefined>();
    const [appliedRange, setAppliedRange] = useState<{ start?: Date; end?: Date }>({});

    const handleApplyRange = () => {
        setAppliedRange({ start: startDate, end: endDate });
    };

    const filteredEntriesForRange = useMemo(() => {
        if (!appliedRange.start || !appliedRange.end) {
            return entries.filter(e => {
                const submittedDate = typeof e.submittedAt === 'string' ? parseISO(e.submittedAt) : e.submittedAt;
                return isValid(submittedDate) && isThisMonth(submittedDate);
            });
        }
        const start = appliedRange.start;
        const end = appliedRange.end;
        return entries.filter(e => {
            const submittedDate = typeof e.submittedAt === 'string' ? parseISO(e.submittedAt) : e.submittedAt;
            return isValid(submittedDate) && isWithinInterval(submittedDate, { start, end });
        });
    }, [entries, appliedRange]);

    const insights = useMemo(() => {
        const filteredEntries = filteredEntriesForRange;
        
        if (filteredEntries.length === 0 && doctors.length === 0) {
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
            const submittedDate = typeof entry.submittedAt === 'string' ? parseISO(entry.submittedAt) : entry.submittedAt;
            if (!isValid(submittedDate)) return acc;
            const day = format(submittedDate, 'yyyy-MM-dd');
            acc[day] = (acc[day] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
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
    }, [filteredEntriesForRange, doctors, entries]);
    
    const filteredNonCallDays = useMemo(() => {
         if (!appliedRange.start || !appliedRange.end) {
            return nonCallDays.filter(day => {
                const dayDate = typeof day.date === 'string' ? parseISO(day.date) : day.date;
                return isValid(dayDate) && isThisMonth(dayDate);
            });
        }
        const start = appliedRange.start;
        const end = appliedRange.end;
        return nonCallDays.filter(day => {
            const dayDate = typeof day.date === 'string' ? parseISO(day.date) : day.date;
            return isValid(dayDate) && isWithinInterval(dayDate, { start, end });
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [nonCallDays, appliedRange]);

    const filteredTimeLogs = useMemo(() => {
        if (!appliedRange.start || !appliedRange.end) {
            return timeLogs.filter(log => {
                const logTimeIn = typeof log.timeIn === 'string' ? parseISO(log.timeIn) : log.timeIn;
                return isValid(logTimeIn) && isThisMonth(logTimeIn);
            });
        }
        const start = appliedRange.start;
        const end = appliedRange.end;
        return timeLogs.filter(log => {
            const timeInDate = typeof log.timeIn === 'string' ? parseISO(log.timeIn) : log.timeIn;
            return isValid(timeInDate) && isWithinInterval(timeInDate, { start, end });
        }).sort((a, b) => new Date(b.timeIn).getTime() - new Date(a.timeIn).getTime());
    }, [timeLogs, appliedRange]);

    const handleDownloadExcel = () => {
        const dataToExport = filteredEntriesForRange.map(entry => {
            const submittedAt = typeof entry.submittedAt === 'string' ? parseISO(entry.submittedAt) : entry.submittedAt;
            const coverageDate = typeof entry.coverageDate === 'string' ? parseISO(entry.coverageDate) : entry.coverageDate;

            return {
                "Doctor Name": `${entry.firstName} ${entry.lastName}`,
                "Specialty": entry.specialty,
                "Clinic": entry.clinic,
                "Coverage Date": isValid(coverageDate) ? format(coverageDate, "PPP") : "Invalid Date",
                "Submitted At": isValid(submittedAt) ? format(submittedAt, "Pp") : "Invalid Date",
                "Coverage Type": entry.coverageType,
                "Call Type": entry.callType,
                "Joint Call With": entry.jointCallWith || "N/A",
                "Topics Discussed": entry.topicsDiscussed,
                "Doctor's Issue": entry.doctorsIssue,
                "Plan of Action": entry.planOfAction,
            }
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Call Summary");
        XLSX.writeFile(workbook, `call_summary_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

    const handleDownloadPdf = () => {
        if (!summaryRef.current) return;
        html2canvas(summaryRef.current, { scale: 2 }).then((canvas) => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const ratio = canvasWidth / canvasHeight;
            const width = pdfWidth;
            const height = width / ratio;

            let position = 0;
            let heightLeft = height;

            pdf.addImage(imgData, 'PNG', 0, position, width, height);
            heightLeft -= pdfHeight;

            while (heightLeft > 0) {
                position = heightLeft - height;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, width, height);
                heightLeft -= pdfHeight;
            }

            pdf.save(`call_summary_${format(new Date(), 'yyyy-MM')}.pdf`);
        });
    };

    const handleSendEmail = () => {
        const subject = `Call Summary Report for ${appliedRange.start ? format(appliedRange.start, 'PPP') : ''} - ${appliedRange.end ? format(appliedRange.end, 'PPP') : ''}`;
        
        const body = `
Hi Team,

Please find the call summary report for the selected period.

Summary:
- Call Concentration (3x/4x): ${insights.completed3x.actual}/${insights.completed3x.total} (${insights.completed3x.percentage}%)
- Call Reach: ${insights.coverageReach.actual}/${insights.coverageReach.total} (${insights.coverageReach.percentage}%)
- Average Calls Per Day: ${insights.avgCallsPerDay}
- Total Working Days: ${insights.totalWorkingDays}
- In-base Days: ${insights.totalInbaseDays}
- Out-base Days: ${insights.totalOutbaseDays}

This is an auto-generated email.
        `.trim().replace(/\n/g, '%0D%0A');
        
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };
    

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
                                {appliedRange.start && appliedRange.end 
                                    ? `Summary for ${format(appliedRange.start, "PPP")} to ${format(appliedRange.end, "PPP")}`
                                    : "This Month's Summary"
                                }
                            </CardTitle>
                            <CardDescription>A quick overview of your performance for the selected period.</CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-4 md:mt-0">
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !startDate && "text-muted-foreground"
                                    )}
                                    >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {startDate ? format(startDate, "PPP") : <span>Start Date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                    mode="single"
                                    selected={startDate}
                                    onSelect={setStartDate}
                                    initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !endDate && "text-muted-foreground"
                                    )}
                                    >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {endDate ? format(endDate, "PPP") : <span>End Date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                    mode="single"
                                    selected={endDate}
                                    onSelect={setEndDate}
                                    initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                            <Button onClick={handleApplyRange} disabled={!startDate || !endDate}>Apply</Button>
                             <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline"><Download className="mr-2"/> Download</Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem onClick={handleDownloadExcel}>Download as Excel</DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleDownloadPdf}>Download as PDF</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <Button onClick={handleSendEmail}><Send className="mr-2"/> Send via Email</Button>
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

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                                            const duration = isValid(timeIn) && isValid(timeOut) ? `${differenceInMinutes(timeOut, timeIn)} mins` : 'Active';
                                            
                                            return (
                                            <TableRow key={log.id}>
                                                <TableCell className="font-medium">{isValid(timeIn) ? format(timeIn, "PPP") : 'Invalid Date'}</TableCell>
                                                <TableCell>{isValid(timeIn) ? format(timeIn, "p") : 'N/A'}</TableCell>
                                                <TableCell>{isValid(timeOut) ? format(timeOut, "p") : 'N/A'}</TableCell>
                                                <TableCell>{duration}</TableCell>
                                                <TableCell className="capitalize">{log.locationType}</TableCell>
                                            </TableRow>
                                        )})
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                No time logs for this period.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

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
                                                <TableCell className="font-medium">{isValid(dayDate) ? format(dayDate, "PPP") : "Invalid Date"}</TableCell>
                                                <TableCell>{dayTypeLabels[day.dayType] || 'N/A'}</TableCell>
                                                <TableCell>{day.reason}</TableCell>
                                                <TableCell>{day.remarks || 'N/A'}</TableCell>
                                            </TableRow>
                                        )
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">
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
    );
}
