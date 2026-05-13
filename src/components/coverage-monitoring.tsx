
'use client';

import { useMemo, useState, useEffect, useCallback } from "react";
import { collection, query, getDocs, orderBy, limit, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO, isValid, startOfMonth, endOfMonth, isWithinInterval, subMonths } from "date-fns";
import { Activity, Users, Target, Pill, TrendingUp, Search, RefreshCw, ChevronLeft, ChevronRight, FileSpreadsheet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SubmittedList } from "./submitted-list";
import { CoverageEntry, Doctor, UserProfile } from "@/lib/types";
import * as XLSX from 'xlsx';

interface CoverageMonitoringProps {
    userProfiles: Record<string, UserProfile>;
    userMap: Record<string, { code: string; firstName: string; lastName: string; email: string }>;
}

export function CoverageMonitoring({ userProfiles, userMap }: CoverageMonitoringProps) {
    const [allEntries, setAllEntries] = useState<CoverageEntry[]>([]);
    const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);

    const fetchGlobalData = useCallback(async () => {
        if (!db) return;
        setLoading(true);
        try {
            // Fetch Global Masterlist
            const drSnap = await getDocs(collection(db, "doctors"));
            const doctors = drSnap.docs.map(d => ({ id: d.id, ...d.data() } as Doctor));
            setAllDoctors(doctors);

            // Fetch Global Activity (limit to recent 2000 to maintain performance)
            const q = query(
                collection(db, "coverageEntries"),
                orderBy("submittedAt", "desc"),
                limit(2000)
            );
            const entrySnap = await getDocs(q);
            const entries = entrySnap.docs.map(d => ({ id: d.id, ...d.data() } as CoverageEntry));
            setAllEntries(entries);
        } catch (error) {
            console.error("Global Monitoring fetch error:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setMounted(true);
        fetchGlobalData();
    }, [fetchGlobalData]);

    const stats = useMemo(() => {
        if (!mounted || allEntries.length === 0) return null;

        const totalCalls = allEntries.length;
        const uniquePMRs = new Set(allEntries.map(e => e.userId)).size;
        
        const visitedDocKeys = new Set(allEntries.map(e => `${e.firstName}|${e.lastName}`.toLowerCase()));
        const reachPercent = allDoctors.length > 0 ? Math.round((visitedDocKeys.size / allDoctors.length) * 100) : 0;

        const totalInventory = allEntries.reduce((acc, e) => {
            let count = Math.round(Number(e.primaryProductQty || 0)) + Math.round(Number(e.secondaryProductQty || 0));
            e.reminderProducts?.forEach(p => { count += Math.round(Number(p.quantity || 0)); });
            return acc + count;
        }, 0);

        // Daily Submission Trend
        const today = new Date();
        const start = subMonths(today, 1);
        const trendMap: Record<string, number> = {};
        
        allEntries.forEach(e => {
            const date = e.submittedAt ? parseISO(e.submittedAt) : null;
            if (date && isValid(date) && isWithinInterval(date, { start, end: today })) {
                const day = format(date, 'MMM d');
                trendMap[day] = (trendMap[day] || 0) + 1;
            }
        });
        const dailyTrend = Object.entries(trendMap)
            .map(([name, calls]) => ({ name, calls }))
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(-14);

        // DSM Performance
        const dsmPerformance: Record<string, number> = {};
        allEntries.forEach(e => {
            const profile = userProfiles[e.userId];
            if (profile?.managerId) {
                const manager = userMap[profile.managerId];
                const mgrName = manager ? `${manager.lastName}` : 'Other';
                dsmPerformance[mgrName] = (dsmPerformance[mgrName] || 0) + 1;
            } else {
                dsmPerformance['HQ/Unassigned'] = (dsmPerformance['HQ/Unassigned'] || 0) + 1;
            }
        });
        const managerStats = Object.entries(dsmPerformance)
            .map(([name, calls]) => ({ name, calls }))
            .sort((a, b) => b.calls - a.calls);

        return { totalCalls, uniquePMRs, reachPercent, totalInventory, dailyTrend, managerStats };
    }, [allEntries, allDoctors, userProfiles, userMap, mounted]);

    if (!mounted || loading) return (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
            <RefreshCw className="w-10 h-10 animate-spin text-primary" />
            <p className="font-headline font-black uppercase tracking-widest text-[10px] text-muted-foreground">Synchronizing Global Monitoring...</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MonitoringStat title="Global Activity" value={stats?.totalCalls || 0} subValue="Total Reports" icon={Activity} color="text-primary" bgColor="bg-primary/10" />
                <MonitoringStat title="Org. Reach" value={`${stats?.reachPercent || 0}%`} subValue="Masterlist Covered" icon={Target} color="text-teal-500" bgColor="bg-teal-500/10" />
                <MonitoringStat title="Field Force" value={stats?.uniquePMRs || 0} subValue="Active Reporters" icon={Users} color="text-blue-500" bgColor="bg-blue-500/10" />
                <MonitoringStat title="Sample Volume" value={stats?.totalInventory || 0} subValue="Units Issued" icon={Pill} color="text-orange-500" bgColor="bg-orange-500/10" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <Card className="border-2 shadow-lg xl:col-span-2 overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b">
                        <CardTitle className="font-black font-headline text-lg flex items-center gap-2">
                            <TrendingUp className="text-primary" /> Submission Trend
                        </CardTitle>
                        <CardDescription>Daily organization-wide report volume for the last 14 days.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] p-6">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats?.dailyTrend || []}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                <XAxis dataKey="name" fontSize={10} fontWeight="bold" />
                                <YAxis fontSize={10} fontWeight="bold" />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: '2px solid hsl(var(--border))' }} />
                                <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Reports" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="border-2 shadow-lg overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b">
                        <CardTitle className="font-black font-headline text-lg">District Activity</CardTitle>
                        <CardDescription>Total submissions by DSM team.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableBody>
                                {stats?.managerStats.map((mgr) => (
                                    <TableRow key={mgr.name} className="h-14">
                                        <TableCell className="font-bold text-sm pl-6">{mgr.name}</TableCell>
                                        <TableCell className="text-right pr-6">
                                            <Badge variant="secondary" className="font-mono font-black">{mgr.calls}</Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <h3 className="text-xl font-black font-headline text-primary flex items-center gap-2">
                        <Activity className="h-5 w-5" /> Recent Activity Feed
                    </h3>
                    <Button variant="outline" size="sm" onClick={fetchGlobalData} className="border-2 h-9 font-headline">
                        <RefreshCw className="h-4 w-4 mr-2" /> Refresh Feed
                    </Button>
                </div>
                <SubmittedList 
                    entries={allEntries} 
                    doctors={allDoctors} 
                    onDelete={() => {}} 
                    onEdit={() => {}} 
                    readOnly={true} 
                    isAdminView={true} 
                    userMap={userMap}
                />
            </div>
        </div>
    );
}

function MonitoringStat({ title, value, subValue, icon: Icon, color, bgColor }: { title: string, value: string | number, subValue: string, icon: any, color: string, bgColor: string }) {
    return (
        <Card className="border-2 shadow-sm">
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none">{title}</p>
                        <div className="flex items-baseline gap-2">
                            <span className={cn("text-3xl font-black font-headline", color)}>{value}</span>
                            <span className="text-xs font-bold text-muted-foreground">{subValue}</span>
                        </div>
                    </div>
                    <div className={cn("p-3 rounded-xl", bgColor)}>
                        <Icon className={cn("w-6 h-6", color)} />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
