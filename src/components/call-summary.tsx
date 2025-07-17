
"use client";

import type { CoverageEntry, Doctor } from "@/lib/types";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getYear, isThisMonth } from "date-fns";
import { Target, CheckCircle2, TrendingUp, CalendarDays, Home, Plane, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const StatCard = ({ title, value, description, icon: Icon, color }: { title: string, value: string | number, description: string, icon: React.ElementType, color: string }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="font-headline">{title}</CardDescription>
            <Icon className={cn("w-6 h-6 text-muted-foreground", color)} />
        </CardHeader>
        <CardContent>
            <CardTitle className="text-2xl font-bold font-headline">{value}</CardTitle>
            <p className="text-xs text-muted-foreground pt-1">{description}</p>
        </CardContent>
    </Card>
)

export function CallSummary({ entries, doctors }: { entries: CoverageEntry[], doctors: Doctor[] }) {
    const insights = useMemo(() => {
        if (entries.length === 0) {
            return {
                completed3x: { actual: 0, total: 0, percentage: 0 },
                completed2x: { actual: 0, total: 0, percentage: 0 },
                avgCallsPerDay: 0,
                totalWorkingDaysThisMonth: 0,
                totalInbaseDays: 0,
                totalOutbaseDays: 0,
                monthlyPerformance: [],
                absentProviders: []
            };
        }
        
        const thisMonthEntries = entries.filter(e => isThisMonth(new Date(e.submittedAt)));

        const providerVisits = thisMonthEntries.reduce((acc, entry) => {
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
        
        const target2xDoctors = doctors.filter(d => d.frequency === '2x');
        const total2xTarget = target2xDoctors.length;
        const actual2xCompleted = target2xDoctors.filter(d => {
            const visitCount = providerVisits[`${d.firstName.toLowerCase()} ${d.lastName.toLowerCase()}`] || 0;
            return visitCount >= 2;
        }).length;
        const percentage2x = total2xTarget > 0 ? Math.round((actual2xCompleted / total2xTarget) * 100) : 0;

        const callsByDay = thisMonthEntries.reduce((acc, entry) => {
            const day = new Date(entry.submittedAt).toISOString().split('T')[0];
            acc[day] = (acc[day] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const totalWorkingDaysThisMonth = Object.keys(callsByDay).length;
        const totalCalls = thisMonthEntries.length;
        const avgCallsPerDay = totalWorkingDaysThisMonth > 0 ? (totalCalls / totalWorkingDaysThisMonth).toFixed(2) : 0;
        
        const inbaseDays = new Set(thisMonthEntries.filter(e => e.coverageType === 'inbase').map(e => new Date(e.submittedAt).toISOString().split('T')[0]));
        const outbaseDays = new Set(thisMonthEntries.filter(e => e.coverageType === 'outbase').map(e => new Date(e.submittedAt).toISOString().split('T')[0]));
        
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
            completed2x: { actual: actual2xCompleted, total: total2xTarget, percentage: percentage2x },
            avgCallsPerDay,
            totalWorkingDaysThisMonth,
            totalInbaseDays: inbaseDays.size,
            totalOutbaseDays: outbaseDays.size,
            monthlyPerformance: monthlyPerformance.slice(-6), // last 6 months
            absentProviders: [] // Placeholder as 'absent' logic is not defined
        };
    }, [entries, doctors]);

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
        <div className="space-y-6">
             <Card>
                <CardHeader>
                    <CardTitle className="font-headline">This Month's Summary</CardTitle>
                    <CardDescription>A quick overview of your performance for the current month.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    <StatCard 
                        title="3x+ Frequency Completion" 
                        value={`${insights.completed3x.actual}/${insights.completed3x.total} (${insights.completed3x.percentage}%)`} 
                        description="Actual vs. Target for 3x/4x doctors." 
                        icon={Target}
                        color="text-primary"
                    />
                    <StatCard 
                        title="2x Frequency Completion" 
                        value={`${insights.completed2x.actual}/${insights.completed2x.total} (${insights.completed2x.percentage}%)`} 
                        description="Actual vs. Target for 2x doctors." 
                        icon={CheckCircle2}
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
                        value={insights.totalWorkingDaysThisMonth} 
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

            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Non-Call Day</CardTitle>
                    <CardDescription>This feature is not yet implemented. It will show a list of non-call days.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Provider</TableHead>
                                <TableHead>Reason for Absence</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                <TableCell colSpan={2} className="h-24 text-center">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <AlertTriangle className="w-8 h-8 text-muted-foreground" />
                                        <p>No absentee data available.</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
