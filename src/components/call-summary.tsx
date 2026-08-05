
"use client";

import type { CoverageEntry, Doctor, NonCallDay, TimeLog } from "@/lib/types";
import { useMemo, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { format, parseISO, isWithinInterval, isValid, startOfMonth, endOfMonth, eachDayOfInterval, subMonths, isSameMonth } from "date-fns";
import { Target, Users, TrendingUp, RefreshCw, Percent, Calendar as CalendarIcon, MapPin, Building2, Briefcase, Pill, PackageCheck, CheckCircle2, UserCheck, Search, Stethoscope, Activity, BarChart as ChartIcon } from "lucide-react";
import { cn, parseAnyDate, PH_HOLIDAYS_2026 } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { ScrollArea } from "./ui/scroll-area";
import { Input } from "./ui/input";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const StatCard = ({ title, value, subValue, description, icon: Icon, color, bgColor, footer }: { title: string, value: React.ReactNode, subValue?: string, description: string, icon: any, color: string, bgColor?: string, footer?: string }) => (
    <Card className={cn("border-none relative overflow-hidden transition-all hover:brightness-110", bgColor || "bg-[#111827]")}>
        <CardContent className="p-6">
            <div className="flex flex-col space-y-4">
                <div className="flex justify-between items-start">
                    <p className="font-black text-[10px] uppercase tracking-widest text-white/50">{title}</p>
                    <Icon className={cn("w-5 h-5", color)} />
                </div>
                <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                        <h4 className="text-2xl font-black font-headline text-white tracking-tight">{value}</h4>
                        {subValue && <span className="text-xs font-bold text-white/60">{subValue}</span>}
                    </div>
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-tight">{description}</p>
                </div>
            </div>
        </CardContent>
        {footer && (
             <div className="px-6 py-2 bg-black/20 border-t border-white/5">
                <p className="text-[9px] font-medium text-white/30 italic">{footer}</p>
             </div>
        )}
    </Card>
)

const SmallStatCard = ({ title, value, description, icon: Icon, color, iconBg }: { title: string, value: string | number, description: string, icon: any, color: string, iconBg: string }) => (
    <Card className="bg-[#0a0c14] border border-white/5 shadow-xl">
        <CardContent className="p-5 flex items-center gap-4">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
                <Icon className={cn("w-6 h-6", color)} />
            </div>
            <div className="space-y-0.5">
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{title}</p>
                <h4 className="text-xl font-black font-headline text-white">{value}</h4>
                <p className="text-[10px] text-white/30 font-medium leading-tight">{description}</p>
            </div>
        </CardContent>
    </Card>
)

export function CallSummary({ 
    entries = [], 
    doctors = [], 
    nonCallDays = [], 
    timeLogs = [],
    selectedMonth,
    onMonthChange 
}: { 
    entries: CoverageEntry[], 
    doctors: Doctor[], 
    nonCallDays: NonCallDay[], 
    timeLogs: TimeLog[],
    selectedMonth?: string,
    onMonthChange?: (m: string) => void
}) {
    const [doctorSearch, setDoctorSearch] = useState("");

    const months = useMemo(() => {
        const list = [];
        const currentYear = new Date().getFullYear();
        for (let i = -6; i <= 6; i++) {
            const date = new Date(currentYear, new Date().getMonth() + i, 1);
            list.push({
                value: format(date, 'yyyy-MM'),
                label: format(date, 'MMMM yyyy')
            });
        }
        return list;
    }, []);

    const insights = useMemo(() => {
        const referenceDate = selectedMonth ? parseISO(selectedMonth + "-01") : new Date();
        const start = startOfMonth(referenceDate);
        const end = endOfMonth(referenceDate);

        const allDaysInMonth = eachDayOfInterval({ start, end });
        const workingDays = allDaysInMonth.filter(day => {
            const dayOfWeek = day.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            if (isWeekend) return false;
            
            const dateStr = format(day, 'yyyy-MM-dd');
            return !PH_HOLIDAYS_2026[dateStr];
        }).length;

        // ID-LEVEL DEDUPLICATION: Ensures data doesn't shift due to sync artifacts
        const safeEntriesMap = new Map<string, CoverageEntry>();
        (entries || []).forEach(e => { if (e.id) safeEntriesMap.set(e.id, e); });
        const safeEntries = Array.from(safeEntriesMap.values());
        
        const safeDoctors = Array.isArray(doctors) ? doctors : [];
        const safeNCDs = Array.isArray(nonCallDays) ? nonCallDays : [];

        // TREND DATA (3 MONTHS)
        const m0 = referenceDate;
        const m1 = subMonths(referenceDate, 1);
        const m2 = subMonths(referenceDate, 2);

        const trendData = [m2, m1, m0].map(m => {
            const count = safeEntries.filter(e => {
                const d = parseAnyDate(e.coverageDate) || parseAnyDate(e.submittedAt);
                return d && isValid(d) && isSameMonth(d, m);
            }).length;
            return {
                name: format(m, 'MMM'),
                calls: count,
                fullDate: format(m, 'MMMM yyyy')
            };
        });

        // MONTHLY FILTERED DATA
        const filteredEntries = safeEntries.filter(e => {
            const d = parseAnyDate(e.coverageDate) || parseAnyDate(e.submittedAt);
            return d && isValid(d) && isWithinInterval(d, { start, end });
        });

        const approvedNCDs = safeNCDs.filter(n => {
            const d = parseAnyDate(n.date);
            return n.status === 'approved' && d && isValid(d) && isWithinInterval(d, { start, end });
        });

        const ncdMap = new Map<string, string>();
        approvedNCDs.forEach(n => {
            const d = parseAnyDate(n.date);
            if (d) ncdMap.set(format(d, 'yyyy-MM-dd'), n.dayType);
        });

        const activeDaysSet = new Set(filteredEntries.map(e => {
            const d = parseAnyDate(e.coverageDate) || parseAnyDate(e.submittedAt);
            return d ? format(d, 'yyyy-MM-dd') : "";
        }).filter(Boolean));
        
        let activeDays = 0;
        activeDaysSet.forEach(dateStr => {
            const leaveType = ncdMap.get(dateStr);
            if (leaveType === 'halfday-am' || leaveType === 'halfday-pm') activeDays += 0.5;
            else if (leaveType === 'wholeday') activeDays += 0;
            else activeDays += 1.0;
        });

        const inbaseCalls = filteredEntries.filter(e => e.coverageType === 'inbase').length;
        const outbaseCalls = filteredEntries.filter(e => e.coverageType === 'outbase').length;

        // IDENTITY NORMALIZATION HELPER
        const normalizeStr = (s?: string) => (s ?? "").toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');

        // STABLE PROVIDER GROUPING
        const providerVisits = filteredEntries.reduce((acc, entry) => {
            const providerName = `${entry.firstName || ""} ${entry.lastName || ""}`.toLowerCase().trim().replace(/\s+/g, ' ');
            const specialty = normalizeStr(entry.specialty);
            const clinic = normalizeStr(entry.clinic);
            // Composite key ensures stability even if masterlist changes
            const compositeKey = `${providerName}|${specialty}|${clinic}`;
            
            if (!acc[compositeKey]) {
                acc[compositeKey] = {
                    count: 0,
                    firstName: entry.firstName || "",
                    lastName: entry.lastName || "",
                    specialty: entry.specialty || "—",
                    clinic: entry.clinic || "—"
                };
            }
            acc[compositeKey].count += 1;
            return acc;
        }, {} as Record<string, { count: number, firstName: string, lastName: string, specialty: string, clinic: string }>);
        
        const actualHighFreqAchieved = Object.values(providerVisits).filter(v => v.count >= 3).length;
        const targetHighFreqFromList = safeDoctors.filter(d => {
            const freqVal = parseInt(String(d.frequency || "1x").replace('x', ''), 10) || 1;
            return freqVal >= 3;
        }).length;
        
        const totalHighFreqTarget = Math.max(targetHighFreqFromList, actualHighFreqAchieved);
        const percentageHighFreq = totalHighFreqTarget > 0 ? Math.round((actualHighFreqAchieved / totalHighFreqTarget) * 100) : 0;
        
        const actualUniqueVisited = Object.keys(providerVisits).length;
        const totalDoctorsInUniverse = Math.max(safeDoctors.length, actualUniqueVisited);
        const percentageReach = totalDoctorsInUniverse > 0 ? Math.round((actualUniqueVisited / totalDoctorsInUniverse) * 100) : 0;

        const totalCalls = filteredEntries.length;
        const targetCalls = activeDays * 12;
        const callRatePercentage = targetCalls > 0 ? Math.round((totalCalls / targetCalls) * 100) : 0;
        const avgCallsPerDay = activeDays > 0 ? (totalCalls / activeDays).toFixed(2) : "0.00";

        // AGGREGATE STAT BREAKDOWNS
        const productUsage = filteredEntries.reduce((acc, entry) => {
            const process = (name?: string, qty?: number) => {
                const key = (name ?? "").trim();
                if (!key) return;
                const q = Math.round(Number(qty || 0));
                if (!isNaN(q) && q !== 0) acc[key] = (acc[key] || 0) + q;
            };
            process(entry.primarySampleName, entry.primaryProductQty);
            process(entry.secondarySampleName, entry.secondaryProductQty);
            entry.reminderProducts?.forEach(rp => process(rp.sampleName, rp.quantity));
            return acc;
        }, {} as Record<string, number>);

        const specialtyCounts = filteredEntries.reduce((acc, entry) => {
            const specialty = (entry.specialty || "Unspecified").trim();
            acc[specialty] = (acc[specialty] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const sortedProductUsage = Object.entries(productUsage).map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity);
        const totalSamplesIssued = Object.values(productUsage).reduce((a, b) => a + b, 0);
        const sortedSpecialties = Object.entries(specialtyCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

        // TRACKING TABLE LOGIC
        const visitedDoctorListMap = new Map<string, any>();
        safeDoctors.forEach(doctor => {
            const providerName = `${doctor.firstName || ""} ${doctor.lastName || ""}`.toLowerCase().trim().replace(/\s+/g, ' ');
            const specialty = normalizeStr(doctor.specialty);
            const clinic = normalizeStr(doctor.clinic);
            const compositeKey = `${providerName}|${specialty}|${clinic}`;
            
            const visitData = providerVisits[compositeKey];
            const actual = visitData?.count || 0;
            const target = parseInt(String(doctor.frequency || "1x").replace('x', ''), 10) || 1;
            
            visitedDoctorListMap.set(compositeKey, {
                name: `${doctor.firstName} ${doctor.lastName}`,
                specialty: doctor.specialty || "—",
                clinic: doctor.clinic || "—",
                target,
                actual,
                isMet: actual >= target,
                inMasterlist: true
            });
        });

        Object.entries(providerVisits).forEach(([key, data]) => {
            if (!visitedDoctorListMap.has(key)) {
                visitedDoctorListMap.set(key, {
                    name: `${data.firstName} ${data.lastName}`,
                    specialty: data.specialty,
                    clinic: data.clinic,
                    target: 0,
                    actual: data.count,
                    isMet: true,
                    inMasterlist: false
                });
            }
        });

        return {
            workingDays,
            activeDays,
            inbaseCalls,
            outbaseCalls,
            totalCalls,
            targetCalls,
            callRatePercentage,
            completedHighFreq: { actual: actualHighFreqAchieved, total: totalHighFreqTarget, percentage: percentageHighFreq },
            coverageReach: { actual: actualUniqueVisited, total: totalDoctorsInUniverse, percentage: percentageReach },
            avgCallsPerDay,
            productUsage: sortedProductUsage,
            totalSamplesIssued,
            visitedDoctorList: Array.from(visitedDoctorListMap.values()).sort((a, b) => b.actual - a.actual || a.name.localeCompare(b.name)),
            specialtyDistribution: sortedSpecialties,
            trendData
        };
    }, [entries, doctors, nonCallDays, selectedMonth]);

    const filteredVisitedDoctorList = useMemo(() => {
        const q = (doctorSearch || "").toLowerCase().trim();
        if (!q) return insights.visitedDoctorList;
        return insights.visitedDoctorList.filter(doc => 
            doc.name.toLowerCase().includes(q) || doc.specialty.toLowerCase().includes(q) || doc.clinic.toLowerCase().includes(q)
        );
    }, [insights.visitedDoctorList, doctorSearch]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h3 className="text-2xl font-black font-headline text-[#10b981]">Performance Oversight</h3>
                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Historical analytics and real-time field activity metrics.</p>
                </div>
                <div className="w-[240px] shrink-0">
                    <Select value={selectedMonth} onValueChange={onMonthChange}>
                        <SelectTrigger className="bg-[#0a0c14] border-white/10 h-11 font-headline rounded-xl text-white">
                            <SelectValue placeholder="Select Month" />
                        </SelectTrigger>
                        <SelectContent>
                            {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard 
                    title="CALL RATE" 
                    value={`${insights.totalCalls}/${Math.round(insights.targetCalls)}`}
                    subValue={`(${insights.callRatePercentage}%)`}
                    description="Monthly target achievement" 
                    icon={Activity} 
                    color="text-[#f59e0b]" 
                    bgColor="bg-[#241a12]" 
                />
                <StatCard 
                    title="CONCENTRATION (3X)" 
                    value={`${insights.completedHighFreq.actual}/${insights.completedHighFreq.total}`}
                    subValue={`(${insights.completedHighFreq.percentage}%)`}
                    description="Providers visited 3+ times" 
                    icon={Target} 
                    color="text-[#10b981]" 
                    bgColor="bg-[#0d1e18]" 
                />
                <StatCard 
                    title="CALL REACH" 
                    value={`${insights.coverageReach.actual}/${insights.coverageReach.total}`}
                    subValue={`(${insights.coverageReach.percentage}%)`}
                    description="Coverage against masterlist" 
                    icon={Users} 
                    color="text-[#06b6d4]" 
                    bgColor="bg-[#0e1d21]" 
                />
                <StatCard 
                    title="SAMPLE VOLUME" 
                    value={insights.totalSamplesIssued} 
                    description="Total items issued" 
                    icon={Pill} 
                    color="text-[#f472b6]" 
                    bgColor="bg-[#1e1523]" 
                />
            </div>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
                <div className="xl:col-span-2 space-y-6">
                    <div className="space-y-6">
                        <h3 className="text-xl font-black font-headline text-white tracking-tight flex items-center gap-2">
                            <ChartIcon className="w-5 h-5 text-[#f59e0b]" />
                            Activity Trend (Rolling 3 Months)
                        </h3>
                        <Card className="bg-[#0a0c14] border border-white/5 shadow-2xl p-6 h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={insights.trendData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                    <XAxis 
                                        dataKey="name" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 'bold' }} 
                                    />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                                    <Tooltip 
                                        cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                                        contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                        itemStyle={{ color: '#f59e0b', fontWeight: 'bold' }}
                                        labelStyle={{ color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}
                                    />
                                    <Bar dataKey="calls" radius={[6, 6, 0, 0]} barSize={45}>
                                        {insights.trendData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={index === 2 ? '#f59e0b' : '#3b82f6'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <SmallStatCard title="WORKING DAYS" value={insights.workingDays} description="Business days this period" icon={Briefcase} color="text-[#f59e0b]" iconBg="bg-[#f59e0b]/10" />
                        <SmallStatCard title="ACTIVE DAYS" value={insights.activeDays} description="Weighted report days" icon={CalendarIcon} color="text-[#10b981]" iconBg="bg-[#10b981]/10" />
                        <SmallStatCard title="INBASE CALLS" value={insights.inbaseCalls} description="Metropolitan area" icon={Building2} color="text-[#3b82f6]" iconBg="bg-[#3b82f6]/10" />
                        <SmallStatCard title="OUTBASE CALLS" value={insights.outbaseCalls} description="Provincial/Out-of-base" icon={MapPin} color="text-[#ef4444]" iconBg="bg-[#ef4444]/10" />
                    </div>

                    <div className="space-y-6 pt-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h3 className="text-xl font-black font-headline text-white tracking-tight flex items-center gap-2">
                                <UserCheck className="w-5 h-5 text-[#3b82f6]" />
                                Provider Visit Tracking
                            </h3>
                            <div className="relative w-full md:w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                                <Input placeholder="Search provider name..." value={doctorSearch} onChange={(e) => setDoctorSearch(e.target.value)} className="pl-10 bg-[#0a0c14] border-white/10 h-10 rounded-xl" />
                            </div>
                        </div>
                        <Card className="bg-[#0a0c14] border border-white/5 shadow-2xl overflow-hidden">
                            <ScrollArea className="h-[400px]">
                                <Table>
                                    <TableHeader className="bg-white/5 sticky top-0 z-10">
                                        <TableRow className="border-white/10 h-12">
                                            <TableHead className="font-bold text-white/70 text-[10px] uppercase tracking-widest pl-6">Medical Provider</TableHead>
                                            <TableHead className="font-bold text-white/70 text-[10px] uppercase tracking-widest hidden md:table-cell">Clinic/Hospital</TableHead>
                                            <TableHead className="font-bold text-white/70 text-[10px] uppercase tracking-widest text-center">Target</TableHead>
                                            <TableHead className="font-bold text-white/70 text-[10px] uppercase tracking-widest text-center">Actual</TableHead>
                                            <TableHead className="font-bold text-white/70 text-[10px] uppercase tracking-widest text-right pr-6">Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredVisitedDoctorList.length > 0 ? (
                                            filteredVisitedDoctorList.map((doc, idx) => (
                                                <TableRow key={idx} className="border-white/5 h-14 hover:bg-white/5 transition-colors">
                                                    <TableCell className="pl-6">
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-sm text-white">{doc.name}</span>
                                                                {!doc.inMasterlist && <Badge variant="outline" className="text-[8px] h-4 px-1.5 opacity-50 uppercase">Ghost</Badge>}
                                                            </div>
                                                            <span className="text-[9px] font-black uppercase text-white/40 tracking-tight">{doc.specialty}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="hidden md:table-cell text-xs text-white/50">{doc.clinic}</TableCell>
                                                    <TableCell className="text-center font-mono font-black text-white/40">{doc.target > 0 ? `${doc.target}x` : "—"}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant="secondary" className={cn("font-mono font-black h-7 px-3", doc.actual > 0 ? "bg-[#3b82f6]/20 text-[#3b82f6]" : "bg-white/5 text-white/20")}>{doc.actual}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        {doc.isMet ? <CheckCircle2 className="w-5 h-5 text-[#10b981] ml-auto" /> : <div className="w-5 h-5 rounded-full border-2 border-white/5 ml-auto" />}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow><TableCell colSpan={5} className="h-32 text-center text-white/20 italic">No activity recorded.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </Card>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="space-y-6">
                        <h3 className="text-xl font-black font-headline text-white tracking-tight flex items-center gap-2">
                            <Stethoscope className="w-5 h-5 text-[#3b82f6]" />
                            Specialty Distribution
                        </h3>
                        <Card className="bg-[#0a0c14] border border-white/5 shadow-2xl overflow-hidden">
                            <CardContent className="p-0">
                                {insights.specialtyDistribution.length > 0 ? (
                                    <div className="divide-y divide-white/5">
                                        {insights.specialtyDistribution.map((item, idx) => (
                                            <div key={idx} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                                                <div className="space-y-0.5">
                                                    <p className="text-sm font-bold text-white truncate max-w-[200px]">{item.name}</p>
                                                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Medical Specialty</p>
                                                </div>
                                                <Badge variant="secondary" className="h-8 px-4 font-mono font-black text-lg bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20">{item.count}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-12 text-center">
                                        <Stethoscope className="w-12 h-12 text-white/10 mx-auto mb-4" />
                                        <p className="text-white/40 font-medium italic">No specialty data recorded.</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-xl font-black font-headline text-white tracking-tight flex items-center gap-2">
                            <PackageCheck className="w-5 h-5 text-[#f472b6]" />
                            Sample Breakdown
                        </h3>
                        <Card className="bg-[#0a0c14] border border-white/5 shadow-2xl overflow-hidden">
                            <CardContent className="p-0">
                                {insights.productUsage.length > 0 ? (
                                    <div className="divide-y divide-white/5">
                                        {insights.productUsage.map((item, idx) => (
                                            <div key={idx} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                                                <div className="space-y-0.5">
                                                    <p className="text-sm font-bold text-white truncate max-w-[200px]">{item.name}</p>
                                                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Distributed Item</p>
                                                </div>
                                                <Badge variant="secondary" className="h-8 px-4 font-mono font-black text-lg bg-[#f472b6]/10 text-[#f472b6] border-[#f472b6]/20">{item.quantity}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-12 text-center">
                                        <Pill className="w-12 h-12 text-white/10 mx-auto mb-4" />
                                        <p className="text-white/40 font-medium italic">No samples distributed.</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
