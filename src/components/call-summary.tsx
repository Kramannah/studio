
"use client";

import type { CoverageEntry } from "@/lib/types";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getMonth, getYear, isThisMonth } from "date-fns";

const StatCard = ({ title, value, description }: { title: string, value: string | number, description: string }) => (
    <Card>
        <CardHeader>
            <CardDescription className="font-headline">{title}</CardDescription>
            <CardTitle className="font-headline">{value}</CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
    </Card>
)

export function CallSummary({ entries }: { entries: CoverageEntry[] }) {
    const insights = useMemo(() => {
        if (entries.length === 0) {
            return {
                completed3x: 0,
                completed2x: 0,
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
            const providerName = `${entry.firstName} ${entry.lastName}`;
            acc[providerName] = (acc[providerName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const completed3x = Object.values(providerVisits).filter(count => count >= 3).length;
        const completed2x = Object.values(providerVisits).filter(count => count >= 2).length;

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
            completed3x,
            completed2x,
            avgCallsPerDay,
            totalWorkingDaysThisMonth,
            totalInbaseDays: inbaseDays.size,
            totalOutbaseDays: outbaseDays.size,
            monthlyPerformance: monthlyPerformance.slice(-6), // last 6 months
            absentProviders: [] // Placeholder as 'absent' logic is not defined
        };
    }, [entries]);

    if (entries.length === 0) {
        return (
            <Card>
                <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground">No data available to generate a call summary. Synced entries will appear here.</p>
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
                    <StatCard title="Completed 3x Frequency" value={insights.completed3x} description="Providers visited 3+ times." />
                    <StatCard title="Completed 2x Frequency" value={insights.completed2x} description="Providers visited 2+ times." />
                    <StatCard title="Avg Calls / Day" value={insights.avgCallsPerDay} description="Average on working days." />
                    <StatCard title="Total Working Days" value={insights.totalWorkingDaysThisMonth} description="Unique days with coverage." />
                    <StatCard title="Inbase Days" value={insights.totalInbaseDays} description="Unique days with inbase calls." />
                    <StatCard title="Outbase Days" value={insights.totalOutbaseDays} description="Unique days with outbase calls." />
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
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="calls" fill="hsl(var(--primary))" name="Total Calls" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Absentee List</CardTitle>
                    <CardDescription>This feature is not yet implemented. It will show a list of absent providers.</CardDescription>
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
                                    No absentee data available.
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
