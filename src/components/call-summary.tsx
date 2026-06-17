
"use client";

import type { CoverageEntry, Doctor, NonCallDay, TimeLog } from "@/lib/types";
import { useMemo } from "react";
import { Card, CardContent } from "./ui/card";
import { format, parseISO, isWithinInterval, isValid, startOfMonth, endOfMonth } from "date-fns";
import { Target, Users, TrendingUp, RefreshCw, Percent, Calendar as CalendarIcon, MapPin, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const StatCard = ({ title, value, subValue, description, icon: Icon, color, bgColor, footer }: { title: string, value: string | number, subValue?: string, description: string, icon: any, color: string, bgColor?: string, footer?: string }) => (
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
                        {subValue && <span className="text-sm font-bold text-white/40">{subValue}</span>}
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

        const safeEntries = Array.isArray(entries) ? entries : [];
        const safeDoctors = Array.isArray(doctors) ? doctors : [];
        const safeNCDs = Array.isArray(nonCallDays) ? nonCallDays : [];

        // Filter entries for the selected month
        const filteredEntries = safeEntries.filter(e => {
            try { 
                const d = parseISO(e.coverageDate || e.submittedAt); 
                return isValid(d) && isWithinInterval(d, { start, end }); 
            } catch { return false; }
        });

        // Filter approved non-call days for the selected month
        const approvedNCDs = safeNCDs.filter(n => {
            try {
                const d = parseISO(n.date);
                return n.status === 'approved' && isValid(d) && isWithinInterval(d, { start, end });
            } catch { return false; }
        });

        // Map dates to their leave types for quick lookup
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
        
        // Calculate weighted active days
        // CRITICAL: Half-day leaves count as 0.5 active days per requirement
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

        const inbaseCalls = filteredEntries.filter(e => e.coverageType === 'inbase' || !e.coverageType).length;
        const outbaseCalls = filteredEntries.filter(e => e.coverageType === 'outbase').length;

        // Map visits per doctor name
        const providerVisits = filteredEntries.reduce((acc, entry) => {
            const providerName = `${entry.firstName} ${entry.lastName}`.toLowerCase().trim();
            acc[providerName] = (acc[providerName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        // 1. CONCENTRATION (3X): Target vs Achieved
        const targetHighFreqDoctors = safeDoctors.filter(d => {
            const freqStr = String(d.frequency || "1x").replace('x', '');
            const freqVal = parseInt(freqStr, 10);
            return freqVal >= 3;
        });
        const totalHighFreqTarget = targetHighFreqDoctors.length;
        const actualHighFreqAchieved = targetHighFreqDoctors.filter(d => {
            const name = `${d.firstName} ${d.lastName}`.toLowerCase().trim();
            return (providerVisits[name] || 0) >= 3;
        }).length;
        const percentageHighFreq = totalHighFreqTarget > 0 ? Math.round((actualHighFreqAchieved / totalHighFreqTarget) * 100) : 0;
        
        // 2. CALL REACH: Unique vs Masterlist
        const totalDoctorsInList = safeDoctors.length;
        const actualVisitedFromList = safeDoctors.filter(d => {
            const name = `${d.firstName} ${d.lastName}`.toLowerCase().trim();
            return (providerVisits[name] || 0) >= 1;
        }).length;
        const percentageReach = totalDoctorsInList > 0 ? Math.round((actualVisitedFromList / totalDoctorsInList) * 100) : 0;

        // 3. CALL RATE: Total calls vs target (12 per active day)
        const totalCalls = filteredEntries.length;
        const targetCalls = activeDays * 12;
        const callRatePercentage = targetCalls > 0 ? Math.round((totalCalls / targetCalls) * 100) : 0;
        const avgCallsPerDay = activeDays > 0 ? (totalCalls / activeDays).toFixed(2) : "0.00";

        return {
            activeDays,
            inbaseCalls,
            outbaseCalls,
            totalCalls,
            targetCalls,
            callRatePercentage,
            completedHighFreq: { actual: actualHighFreqAchieved, total: totalHighFreqTarget, percentage: percentageHighFreq },
            coverageReach: { actual: actualVisitedFromList, total: totalDoctorsInList, percentage: percentageReach },
            avgCallsPerDay,
        };
    }, [entries, doctors, nonCallDays, selectedMonth]);

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
                    description="Target: 12 reports per active day" 
                    icon={Percent} 
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
                    title="EFFICIENCY" 
                    value={insights.avgCallsPerDay} 
                    description="Avg daily reports submitted" 
                    icon={TrendingUp} 
                    color="text-[#3b82f6]" 
                    bgColor="bg-[#0f172a]" 
                />
            </div>

            <div className="space-y-6">
                <h3 className="text-xl font-black font-headline text-white tracking-tight">Field Activity Statistics</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            </div>
        </div>
    );
}
