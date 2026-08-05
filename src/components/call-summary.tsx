
"use client";

import type { CoverageEntry, Doctor, NonCallDay, TimeLog } from "@/lib/types";
import { useMemo, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { format, parseISO, isWithinInterval, isValid, startOfMonth, endOfMonth, eachDayOfInterval, subMonths, isSameMonth } from "date-fns";
import { Target, Users, TrendingUp, RefreshCw, Percent, Calendar as CalendarIcon, MapPin, Building2, Briefcase, Pill, PackageCheck, CheckCircle2, UserCheck, Search, Stethoscope, Activity, BarChart as ChartIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { PH_HOLIDAYS_2026 } from "@/lib/utils";
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
                        {subValue && <span className="text-sm font-bold text-white/60">{subValue}</span>}
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

        const safeEntries = Array.isArray(entries) ? entries : [];
        const safeDoctors = Array.isArray(doctors) ? doctors : [];
        const safeNCDs = Array.isArray(nonCallDays) ? nonCallDays : [];

        const m0 = referenceDate;
        const m1 = subMonths(referenceDate, 1);
        const m2 = subMonths(referenceDate, 2);

        const trendData = [m2, m1, m0].map(m => {
            const count = safeEntries.filter(e => {
                try {
                    const d = parseISO(e.coverageDate || e.submittedAt);
                    return isValid(d) && isSameMonth(d, m);
                } catch { return false; }
            }).length;
            return {
                name: format(m, 'MMM'),
                calls: count,
                fullDate: format(m, 'MMMM yyyy')
            };
        });

        const filteredEntries = safeEntries.filter(e => {
            try { 
                const d = parseISO(e.coverageDate || e.submittedAt); 
                return isValid(d) && isWithinInterval(d, { start, end }); 
            } catch { return false; }
        });

        const approvedNCDs = safeNCDs.filter(n => {
            try {
                const d = parseISO(n.date);
                return n.status === 'approved' && isValid(d) && isWithinInterval(d, { start, end });
            } catch { return false; }
        });

        const ncdMap = new Map<string, string>();
        approvedNCDs.forEach(n => {
            try {
                const dateStr = format(parseISO(n.date), 'yyyy-MM-dd');
                ncdMap.set(dateStr, n.dayType);
            } catch {}
        });

        const activeDaysSet = new Set(filteredEntries.map(e => {
            try { return format(parseISO(e.coverageDate || e.submittedAt), 'yyyy-MM-dd'); } catch { return ""; }
        }).filter(Boolean));
        
        let activeDays = 0;
        activeDaysSet.forEach(dateStr => {
            const leaveType = ncdMap.get(dateStr);
            if (leaveType === 'halfday-am' || leaveType === 'halfday-pm') {
                activeDays += 0.5;
            } else if (leaveType === 'wholeday') {
                activeDays += 0;
            } else {
                activeDays += 1.0;
            }
        });

        // Base Calls Calculation
        const inbaseCalls = filteredEntries.filter(e => e.coverageType === 'inbase').length;
        const outbaseCalls = filteredEntries.filter(e => e.coverageType === 'outbase').length;

        // Provider Visit Logic: Use names from reports to ensure stability if masterlist is edited/deleted
        const providerVisits = filteredEntries.reduce((acc, entry) => {
            const providerName = `${entry.firstName} ${entry.lastName}`.toLowerCase().trim();
            if (!acc[providerName]) {
                acc[providerName] = {
                    count: 0,
                    firstName: entry.firstName || "",
                    lastName: entry.lastName || "",
                    specialty: entry.specialty || "—",
                    clinic: entry.clinic || "—"
                };
            }
            acc[providerName].count += 1;
            return acc;
        }, {} as Record<string, { count: number, firstName: string, lastName: string, specialty: string, clinic: string }>);
        
        const targetHighFreqDoctors = safeDoctors.filter(d => {
            const freqStr = String(d.frequency || "1x").replace('x', '');
            const freqVal = parseInt(freqStr, 10);
            return freqVal >= 3;
        });
        const totalHighFreqTarget = targetHighFreqDoctors.length;
        const actualHighFreqAchieved = targetHighFreqDoctors.filter(d => {
            const name = `${d.firstName} ${d.lastName}`.toLowerCase().trim();
            return (providerVisits[name]?.count || 0) >= 3;
        }).length;
        const percentageHighFreq = totalHighFreqTarget > 0 ? Math.round((actualHighFreqAchieved / totalHighFreqTarget) * 100) : 0;
        
        const totalDoctorsInList = safeDoctors.length;
        const actualVisitedFromList = safeDoctors.filter(d => {
            const name = `${d.firstName} ${d.lastName}`.toLowerCase().trim();
            return (providerVisits[name]?.count || 0) >= 1;
        }).length;
        const percentageReach = totalDoctorsInList > 0 ? Math.round((actualVisitedFromList / totalDoctorsInList) * 100) : 0;

        const totalCalls = filteredEntries.length;
        const targetCalls = activeDays * 12;
        const callRatePercentage = targetCalls > 0 ? Math.round((totalCalls / targetCalls) * 100) : 0;
        const avgCallsPerDay = activeDays > 0 ? (totalCalls / activeDays).toFixed(2) : "0.00";

        const productUsage = filteredEntries.reduce((acc, entry) => {
            const process = (name?: string, qty?: number) => {
                const key = (name ?? "").trim();
                if (!key) return;
                const q = Math.round(Number(qty || 0));
                if (!isNaN(q) && q !== 0) {
                    acc[key] = (acc[key] || 0) + q;
                }
            };
            process(entry.primarySampleName, entry.primaryProductQty);
            process(entry.secondarySampleName, entry.secondaryProductQty);
            if (entry.reminderProducts) {
                entry.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
            }
            return acc;
        }, {} as Record<string, number>);

        const sortedProductUsage = Object.entries(productUsage)
            .map(([name, quantity]) => ({ name, quantity }))
            .sort((a, b) => b.quantity - a.quantity);

        const totalSamplesIssued = Object.values(productUsage).reduce((a, b) => a + b, 0);

        const specialtyCounts = filteredEntries.reduce((acc, entry) => {
            const specialty = (entry.specialty || "Unspecified").trim();
            acc[specialty] = (acc[specialty] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const sortedSpecialties = Object.entries(specialtyCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

        // STABLE VISIT LIST: Ensure doctors who were visited but later deleted from masterlist still appear in the summary
        const visitedDoctorListMap = new Map<string, any>();

        // 1. Start with current masterlist
        safeDoctors.forEach(doctor => {
            const nameKey = `${doctor.firstName} ${doctor.lastName}`.toLowerCase().trim();
            const visitData = providerVisits[nameKey];
            const actual = visitData?.count || 0;
            const target = parseInt(String(doctor.frequency || "1x").replace('x', ''), 10) || 1;
            
            visitedDoctorListMap.set(nameKey, {
                name: `${doctor.firstName} ${doctor.lastName}`,
                specialty: doctor.specialty || "—",
                clinic: doctor.clinic || "—",
                target,
                actual,
                isMet: actual >= target,
                inMasterlist: true
            });
        });

        // 2. Add visited doctors who are NOT in current masterlist (e.g. deleted or name changed)
        Object.entries(providerVisits).forEach(([nameKey, data]) => {
            if (!visitedDoctorListMap.has(nameKey)) {
                visitedDoctorListMap.set(nameKey, {
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

        const visitedDoctorList = Array.from(visitedDoctorListMap.values()).sort((a, b) => {
            if (a.actual !== b.actual) return b.actual - a.actual;
            return a.name.localeCompare(b.name);
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
            coverageReach: { actual: actualVisitedFromList, total: totalDoctorsInList, percentage: percentageReach },
            avgCallsPerDay,
            productUsage: sortedProductUsage,
            totalSamplesIssued,
            visitedDoctorList,
            specialtyDistribution: sortedSpecialties,
            trendData
        };
    }, [entries, doctors, nonCallDays, selectedMonth]);

    const filteredVisitedDoctorList = useMemo(() => {
        if (!doctorSearch.trim()) return insights.visitedDoctorList;
        const q = doctorSearch.toLowerCase().trim();
        return insights.visitedDoctorList.filter(doc => 
            doc.name.toLowerCase().includes(q) || 
            doc.specialty.toLowerCase().includes(q) || 
            doc.clinic.toLowerCase().includes(q)
        );
    }, [insights.visitedDoctorList, doctorSearch]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h3 className="text-2xl font-black font-headline text-[#10b981]">Performance Oversight</h3>
                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Monthly analytics synchronization for individual field performance.</p>
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
                    description="High frequency retention (3+ visits)" 
                    icon={Target} 
                    color="text-[#10b981]" 
                    bgColor="bg-[#0d1e18]" 
                />
                <StatCard 
                    title="CALL REACH" 
                    value={`${insights.coverageReach.actual}/${insights.coverageReach.total}`}
                    subValue={`(${insights.coverageReach.percentage}%)`}
                    description="Unique doctors visited vs masterlist" 
                    icon={Users} 
                    color="text-[#06b6d4]" 
                    bgColor="bg-[#0e1d21]" 
                />
                <StatCard 
                    title="SAMPLE VOLUME" 
                    value={insights.totalSamplesIssued} 
                    description="Total items issued this month" 
                    icon={Pill} 
                    color="text-[#f472b6]" 
                    bgColor="bg-[#1e1523]" 
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2 space-y-6">
                    <div className="space-y-6">
                        <h3 className="text-xl font-black font-headline text-white tracking-tight flex items-center gap-2">
                            <ChartIcon className="w-5 h-5 text-[#f59e0b]" />
                            Performance Trend (3 Months)
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
                                    <YAxis 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} 
                                    />
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

                    <h3 className="text-xl font-black font-headline text-white tracking-tight flex items-center gap-2">
                        <CalendarIcon className="w-5 h-5 text-[#10b981]" />
                        Field Activity Statistics
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <SmallStatCard 
                            title="WORKING DAYS"
                            value={insights.workingDays}
                            description="Business days minus holidays"
                            icon={Briefcase}
                            color="text-[#f59e0b]"
                            iconBg="bg-[#f59e0b]/10"
                        />
                        <SmallStatCard 
                            title="ACTIVE DAYS"
                            value={insights.activeDays}
                            description="Weighted days with filed reports"
                            icon={CalendarIcon}
                            color="text-[#10b981]"
                            iconBg="bg-[#10b981]/10"
                        />
                        <SmallStatCard 
                            title="INBASE CALLS"
                            value={insights.inbaseCalls}
                            description="Metropolitan area visits"
                            icon={Building2}
                            color="text-[#3b82f6]"
                            iconBg="bg-[#3b82f6]/10"
                        />
                        <SmallStatCard 
                            title="OUTBASE CALLS"
                            value={insights.outbaseCalls}
                            description="Provincial/Out-of-base visits"
                            icon={MapPin}
                            color="text-[#ef4444]"
                            iconBg="bg-[#ef4444]/10"
                        />
                    </div>

                    <div className="space-y-6 pt-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h3 className="text-xl font-black font-headline text-white tracking-tight flex items-center gap-2">
                                <UserCheck className="w-5 h-5 text-[#3b82f6]" />
                                Provider Visit Tracking
                            </h3>
                            <div className="relative w-full md:w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                                <Input 
                                    placeholder="Search provider name..." 
                                    value={doctorSearch}
                                    onChange={(e) => setDoctorSearch(e.target.value)}
                                    className="pl-10 bg-[#0a0c14] border-white/10 text-white h-10 rounded-xl focus-visible:ring-[#3b82f6]/50"
                                />
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
                                                                {!doc.inMasterlist && <Badge variant="outline" className="text-[8px] h-4 px-1.5 opacity-50 uppercase">Deleted</Badge>}
                                                            </div>
                                                            <span className="text-[9px] font-black uppercase text-white/40 tracking-tight">{doc.specialty}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="hidden md:table-cell text-xs text-white/50">{doc.clinic}</TableCell>
                                                    <TableCell className="text-center font-mono font-black text-white/40">{doc.target > 0 ? `${doc.target}x` : "—"}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant="secondary" className={cn("font-mono font-black h-7 px-3", doc.actual > 0 ? "bg-[#3b82f6]/20 text-[#3b82f6]" : "bg-white/5 text-white/20")}>
                                                            {doc.actual}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        {doc.isMet ? (
                                                            <CheckCircle2 className="w-5 h-5 text-[#10b981] ml-auto" />
                                                        ) : (
                                                            <div className="w-5 h-5 rounded-full border-2 border-white/5 ml-auto" />
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-32 text-center text-white/20 italic">
                                                    {doctorSearch ? "No providers match your search." : "No masterlist doctors identified."}
                                                </TableCell>
                                            </TableRow>
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
                            Specialty Counter
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
                                                <Badge variant="secondary" className="h-8 px-4 font-mono font-black text-lg bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20">
                                                    {item.count}
                                                </Badge>
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
                            Sample Distribution
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
                                                <Badge variant="secondary" className="h-8 px-4 font-mono font-black text-lg bg-[#f472b6]/10 text-[#f472b6] border-[#f472b6]/20">
                                                    {item.quantity}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-12 text-center">
                                        <Pill className="w-12 h-12 text-white/10 mx-auto mb-4" />
                                        <p className="text-white/40 font-medium italic">No samples distributed yet.</p>
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
