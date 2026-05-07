"use client";

import { useMemo, useState, useEffect } from "react";
import type { TeamSummaryData } from "@/hooks/use-admin-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format, parseISO, isValid, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { Users, Target, Pill, Activity, TrendingUp, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

interface TeamSummaryProps {
    data: TeamSummaryData | null;
    loading?: boolean;
}

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#06b6d4'];

const SummaryStat = ({ title, value, subValue, icon: Icon, color }: { title: string, value: string | number, subValue?: string, icon: any, color: string }) => (
    <Card className="border-2 shadow-sm">
        <CardContent className="p-6">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">{title}</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black font-headline">{value}</span>
                        {subValue && <span className="text-sm font-bold text-muted-foreground">{subValue}</span>}
                    </div>
                </div>
                <div className={cn("p-3 rounded-xl bg-opacity-10", color.replace('text-', 'bg-').replace('500', '500/10'))}>
                    <Icon className={cn("w-6 h-6", color)} />
                </div>
            </div>
        </CardContent>
    </Card>
);

export function TeamSummary({ data, loading }: TeamSummaryProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const stats = useMemo(() => {
        if (!data || !data.entries || !mounted) return null;

        const totalCalls = data.entries.length;
        const totalPMRs = new Set(data.entries.map(e => e.userId)).size;
        
        // Coverage Reach: Percentage of masterlist visited
        const totalDoctors = data.doctors.length;
        const visitedDoctors = new Set(data.entries.map(e => `${e.firstName}|${e.lastName}`.toLowerCase())).size;
        const reachPercent = totalDoctors > 0 ? Math.round((visitedDoctors / totalDoctors) * 100) : 0;

        // Top Specialties
        const specialtyMap: Record<string, number> = {};
        data.entries.forEach(e => {
            if (e.specialty) specialtyMap[e.specialty] = (specialtyMap[e.specialty] || 0) + 1;
        });
        const topSpecialties = Object.entries(specialtyMap)
            .map(([name, count]) => ({ name, value: count }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        // Daily Activity Trend
        const today = new Date();
        const start = startOfMonth(today);
        const end = endOfMonth(today);
        const dailyTrendMap: Record<string, number> = {};
        
        data.entries.forEach(e => {
            const date = e.submittedAt ? parseISO(e.submittedAt) : null;
            if (date && isValid(date) && isWithinInterval(date, { start, end })) {
                const day = format(date, 'MMM d');
                dailyTrendMap[day] = (dailyTrendMap[day] || 0) + 1;
            }
        });
        const dailyTrend = Object.entries(dailyTrendMap)
            .map(([name, calls]) => ({ name, calls }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return {
            totalCalls,
            totalPMRs,
            reachPercent,
            topSpecialties,
            dailyTrend,
            totalInventoryUsed: Object.values(data.usedQuantities).reduce((a, b) => a + b, 0)
        };
    }, [data, mounted]);

    if (!mounted || loading) {
        return (
            <div className="flex flex-col items-center justify-center h-80 gap-4">
                <RefreshCw className="w-10 h-10 animate-spin text-primary" />
                <p className="text-muted-foreground font-black uppercase tracking-widest text-[10px]">Aggregating District Data...</p>
            </div>
        );
    }

    if (!stats || stats.totalCalls === 0) {
        return (
            <Alert className="border-2 py-10 flex flex-col items-center text-center">
                <AlertTriangle className="w-10 h-10 text-orange-500 mb-4" />
                <AlertTitle className="text-xl font-black font-headline">No District Data Found</AlertTitle>
                <AlertDescription className="text-muted-foreground text-lg">
                    This district hasn't submitted any coverage reports for the current period yet.
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <SummaryStat title="Total Calls" value={stats.totalCalls} subValue="Submitted" icon={Activity} color="text-primary" />
                <SummaryStat title="District Reach" value={`${stats.reachPercent}%`} subValue="Providers" icon={Target} color="text-teal-500" />
                <SummaryStat title="Active PMRs" value={stats.totalPMRs} subValue="Reporting" icon={Users} color="text-blue-500" />
                <SummaryStat title="Sample Issues" value={stats.totalInventoryUsed} subValue="Units" icon={Pill} color="text-orange-500" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                <Card className="border-2 shadow-lg overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b">
                        <CardTitle className="font-black font-headline flex items-center gap-2">
                            <TrendingUp className="text-primary" /> District Activity Trend
                        </CardTitle>
                        <CardDescription>Daily report submission volume for the current month.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.dailyTrend}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                <XAxis dataKey="name" fontSize={10} />
                                <YAxis fontSize={10} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: '2px solid hsl(var(--border))', fontWeight: 'bold' }}
                                />
                                <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Reports" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="border-2 shadow-lg overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b">
                        <CardTitle className="font-black font-headline flex items-center gap-2">
                            <CheckCircle2 className="text-primary" /> Provider Specialties
                        </CardTitle>
                        <CardDescription>Top 5 medical specialties reached by the district team.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 h-[350px] flex items-center">
                        <div className="flex-1 h-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.topSpecialties}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {stats.topSpecialties.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend verticalAlign="bottom" align="center" />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}