"use client"

import type { Doctor, Plan, NonCallDay, CoverageEntry, PlanningPermissionRequest } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isSameDay, isSameMonth, isValid } from "date-fns";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { PlusCircle, CalendarOff, Search, Clock, CheckCircle, XCircle, ChevronDown, Settings2, Lock, Unlock, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "./ui/input";
import { NonCallDayDialog } from "./non-call-day-dialog";
import { PlanningPermissionDialog } from "./planning-permission-dialog";
import { getWeekMonday, isCurrentWeek, isPastWeek, cn } from "@/lib/utils";
import { Checkbox } from "./ui/checkbox";

type PlanningCalendarProps = {
  doctors: Doctor[];
  plans: Plan[];
  planningRequests: PlanningPermissionRequest[];
  onRequestUnlock: (week: Date, reason: string) => Promise<boolean>;
  entries: CoverageEntry[];
  offlineEntries?: CoverageEntry[];
  onAddPlan: (doctor: Doctor, plannedDate: Date) => void;
  onAddPlansBulk: (doctors: Doctor[], plannedDate: Date) => Promise<boolean>;
  onRemovePlan: (planId: string) => void;
  onLogCall: (doctor: Doctor, plannedDate: Date) => void;
  nonCallDays: NonCallDay[];
  onAddNonCallDay: (entry: Omit<NonCallDay, 'id' | 'userId' | 'date' | 'status'>) => void;
  readOnly?: boolean;
};

const dayTypeLabels: Record<NonCallDay['dayType'], string> = {
    'wholeday': 'Whole Day',
    'halfday-am': 'Half Day (AM)',
    'halfday-pm': 'Half Day (PM)',
};

const StatusIcon = ({ status }: { status: NonCallDay['status'] }) => {
    switch (status) {
        case 'approved':
            return <CheckCircle className="w-4 h-4 text-primary" />;
        case 'rejected':
            return <XCircle className="w-4 h-4 text-destructive" />;
        case 'pending':
        default:
            return <Clock className="w-4 h-4 text-yellow-500" />;
    }
}

export function PlanningCalendar({ 
    doctors = [], 
    plans = [], 
    planningRequests = [],
    onRequestUnlock,
    entries = [], 
    offlineEntries = [],
    onAddPlan, 
    onAddPlansBulk,
    onRemovePlan, 
    onLogCall, 
    nonCallDays = [], 
    onAddNonCallDay, 
    readOnly = false,
}: PlanningCalendarProps) {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    const [isAddPlanDialogOpen, setIsAddPlanDialogOpen] = useState(false);
    const [isNonCallDialogOpen, setIsNonCallDialogOpen] = useState(false);
    const [isUnlockDialogOpen, setIsUnlockDialogOpen] = useState(false);
    const [doctorFilter, setDoctorFilter] = useState("");
    const [selectedDoctorIds, setSelectedDoctorIds] = useState<Set<string>>(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setSelectedDate(new Date());
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!isAddPlanDialogOpen && !isNonCallDialogOpen && !isUnlockDialogOpen) {
            document.body.style.pointerEvents = 'auto';
        }
    }, [isAddPlanDialogOpen, isNonCallDialogOpen, isUnlockDialogOpen]);

    const allEntries = useMemo(() => [...entries, ...offlineEntries], [entries, offlineEntries]);

    const entriesByDate = useMemo(() => {
        const groups: Record<string, CoverageEntry[]> = {};
        allEntries.forEach(e => {
            const dateStr = String(e.coverageDate || "");
            if (dateStr) {
                const date = parseISO(dateStr);
                if (isValid(date)) {
                    const dateKey = format(date, 'yyyy-MM-dd');
                    if (!groups[dateKey]) groups[dateKey] = [];
                    groups[dateKey].push(e);
                }
            }
        });
        return groups;
    }, [allEntries]);

    const plansByDate = useMemo(() => {
        const groups: Record<string, Plan[]> = {};
        plans.forEach(plan => {
            const date = typeof plan.plannedDate === 'string' ? parseISO(plan.plannedDate) : plan.plannedDate;
            if(isValid(date)) {
                const dateStr = format(date, 'yyyy-MM-dd');
                if (!groups[dateStr]) groups[dateStr] = [];
                groups[dateStr].push(plan);
            }
        });
        return groups;
    }, [plans]);
    
    const nonCallDaysByDate = useMemo(() => {
        const groups: Record<string, NonCallDay[]> = {};
        nonCallDays.forEach(day => {
            const date = typeof day.date === 'string' ? parseISO(day.date) : day.date;
            if(isValid(date)) {
                const dateStr = format(date, 'yyyy-MM-dd');
                if (!groups[dateStr]) groups[dateStr] = [];
                groups[dateStr].push(day);
            }
        });
        return groups;
    }, [nonCallDays]);

    const approvedWeekMondays = useMemo(() => {
        return new Set(
            planningRequests
                .filter(r => r.status === 'approved')
                .map(r => format(parseISO(r.weekStartDate), 'yyyy-MM-dd'))
        );
    }, [planningRequests]);

    const isLocked = useMemo(() => {
        if (!selectedDate || isCurrentWeek(selectedDate) || !isPastWeek(selectedDate)) return false;
        const mondayStr = format(getWeekMonday(selectedDate), 'yyyy-MM-dd');
        return !approvedWeekMondays.has(mondayStr);
    }, [selectedDate, approvedWeekMondays]);

    const visitCountsThisMonth = useMemo(() => {
        const counts: Record<string, number> = {};
        const today = new Date();
        allEntries.forEach(e => {
            const dateStr = String(e.coverageDate || "");
            if (dateStr) {
                const date = parseISO(dateStr);
                if (isValid(date) && isSameMonth(date, today)) {
                    const nameKey = `${String(e.firstName || "").toLowerCase()}|${String(e.lastName || "").toLowerCase()}`;
                    counts[nameKey] = (counts[nameKey] || 0) + 1;
                }
            }
        });
        return counts;
    }, [allEntries]);

    const territoryStats = useMemo(() => {
        const stats = {
            total: { completed: 0, target: 0 },
            '1x': { completed: 0, target: 0 },
            '2x': { completed: 0, target: 0 },
            '3x': { completed: 0, target: 0 },
            '4x': { completed: 0, target: 0 },
        };

        doctors.forEach(d => {
            const freq = String(d.frequency || '1x');
            const target = parseInt(freq.replace('x', ''), 10) || 0;
            const nameKey = `${String(d.firstName || "").toLowerCase()}|${String(d.lastName || "").toLowerCase()}`;
            const actual = visitCountsThisMonth[nameKey] || 0;
            const completed = Math.min(target, actual);

            stats.total.target += target;
            stats.total.completed += completed;
            if (stats[freq as keyof typeof stats]) {
                (stats[freq as keyof typeof stats] as any).target += target;
                (stats[freq as keyof typeof stats] as any).completed += completed;
            }
        });

        return stats;
    }, [doctors, visitCountsThisMonth]);

    const selectedDayPlans = useMemo(() => {
        if (!selectedDate) return [];
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        return plansByDate[dateStr] || [];
    }, [plansByDate, selectedDate]);

    const selectedDayNonCallDays = useMemo(() => {
        if (!selectedDate) return [];
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        return nonCallDaysByDate[dateStr] || [];
    }, [nonCallDaysByDate, selectedDate]);

    const selectedDayStats = useMemo(() => {
        if (!selectedDate) return { total: 0, covered: 0, notCovered: 0 };
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const dayPlans = plansByDate[dateStr] || [];
        const dayEntries = entriesByDate[dateStr] || [];
        
        const coveredCount = dayPlans.filter(p => 
            dayEntries.some(e => 
                String(e.firstName || "").toLowerCase() === String(p.doctorFirstName || "").toLowerCase() && 
                String(e.lastName || "").toLowerCase() === String(p.doctorLastName || "").toLowerCase()
            )
        ).length;

        return {
            total: dayPlans.length,
            covered: coveredCount,
            notCovered: Math.max(0, dayPlans.length - coveredCount)
        };
    }, [selectedDate, plansByDate, entriesByDate]);

    const selectedDayPlannedIds = useMemo(() => {
        return new Set(selectedDayPlans.map(p => p.doctorId));
    }, [selectedDayPlans]);

    const filteredDoctorsForSearch = useMemo(() => {
        const q = String(doctorFilter || "").toLowerCase().trim();
        if (!q) return doctors;
        return doctors.filter(d => 
            `${String(d.firstName || "")} ${String(d.lastName || "")}`.toLowerCase().includes(q) ||
            String(d.municipality || "").toLowerCase().includes(q) ||
            String(d.specialty || "").toLowerCase().includes(q)
        );
    }, [doctors, doctorFilter]);

    const handleSaveNonCallDay = useCallback((data: {reason: string, remarks?: string, dayType: 'wholeday' | 'halfday-am' | 'halfday-pm'}) => {
        if(selectedDate) {
            onAddNonCallDay({
                date: selectedDate.toISOString(),
                reason: data.reason,
                remarks: data.remarks || "",
                dayType: data.dayType,
            });
            setIsNonCallDialogOpen(false);
        }
    }, [selectedDate, onAddNonCallDay]);
    
    const handleLogCallClick = (plan: Plan) => {
        const doctor = doctors.find(d => d.id === plan.doctorId);
        const date = typeof plan.plannedDate === 'string' ? parseISO(plan.plannedDate) : plan.plannedDate;
        if (doctor && isValid(date)) {
            onLogCall(doctor, date);
        }
    }

    const toggleDoctorSelection = (id: string) => {
        if (selectedDayPlannedIds.has(id)) return;
        setSelectedDoctorIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleBulkSubmit = async () => {
        if (selectedDoctorIds.size === 0 || !selectedDate) return;
        setIsSubmitting(true);
        const doctorsToPlan = doctors.filter(d => selectedDoctorIds.has(d.id));
        const success = await onAddPlansBulk(doctorsToPlan, selectedDate);
        if (success) {
            setIsAddPlanDialogOpen(false);
            setSelectedDoctorIds(new Set());
            setDoctorFilter("");
        }
        setIsSubmitting(false);
    };

    if (!mounted) return (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Initializing Calendar...</p>
        </div>
    );

    if (doctors.length === 0 && !readOnly) {
        return (
            <Card className="border-2 border-dashed">
                <CardContent className="p-12 text-center">
                    <p className="text-xl text-muted-foreground font-headline">You must add doctors to your masterlist before you can plan visits.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="w-full space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold font-headline text-primary">Call Planning</h2>
                    <p className="text-muted-foreground text-lg">Schedule and manage your doctor visits efficiently.</p>
                </div>
            </div>

            <div className="flex flex-col xl:flex-row gap-8 items-start">
                <div className="w-full xl:w-[400px] shrink-0">
                    <Card className="shadow-md border-2 overflow-hidden">
                        <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={setSelectedDate}
                            modifiers={{ 
                                planned: Object.keys(plansByDate).map(d => parseISO(d)),
                                nonCall: Object.keys(nonCallDaysByDate).map(d => parseISO(d)),
                                weekend: { dayOfWeek: [0, 6] }
                            }}
                            modifiersStyles={{
                                planned: { border: '3px solid hsl(var(--primary))', fontWeight: 'bold' },
                                nonCall: { backgroundColor: 'hsl(var(--destructive) / 0.15)', color: 'hsl(var(--destructive))', fontWeight: 'bold' }
                            }}
                            components={{
                                DayContent: ({ date, activeModifiers }) => {
                                    const dateString = format(date, 'yyyy-MM-dd');
                                    const count = plansByDate[dateString]?.length;
                                    return (
                                        <div className="relative flex items-center justify-center w-full h-full">
                                            {date.getDate()}
                                            {count && !activeModifiers.nonCall && (
                                                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-black shadow-sm">
                                                    {count}
                                                </span>
                                            )}
                                        </div>
                                    );
                                },
                            }}
                            className="w-full p-4 bg-card"
                        />
                    </Card>
                </div>

                <div className="flex-1 w-full space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/30 p-4 rounded-xl border-2">
                        <div className="space-y-3">
                            <h3 className="text-2xl font-black font-headline tracking-tight flex items-center gap-2">
                                Daily Plan for {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "No date selected"}
                                {isLocked && <Lock className="w-5 h-5 text-destructive" />}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="outline" className="h-7 px-3 font-bold border-2 bg-background/50">
                                    Total Visits: {selectedDayStats.total}
                                </Badge>
                                <Badge variant="outline" className="h-7 px-3 font-bold border-2 border-primary/30 text-primary bg-primary/10">
                                    Covered: {selectedDayStats.covered}
                                </Badge>
                                <Badge variant="outline" className="h-7 px-3 font-bold border-2 border-destructive/30 text-destructive bg-destructive/10">
                                    Not Covered: {selectedDayStats.notCovered}
                                </Badge>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                    <Button size="lg" className="h-12 px-6 font-bold text-lg gap-2" disabled={readOnly}>
                                        <Settings2 className="w-5 h-5" />
                                        Actions
                                        <ChevronDown className="w-4 h-4 ml-1 opacity-70" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuLabel>Daily Management</DropdownMenuLabel>
                                    {isLocked ? (
                                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsUnlockDialogOpen(true); }} className="gap-2 py-3">
                                            <Unlock className="w-4 h-4 text-primary" /> Unlock Planning
                                        </DropdownMenuItem>
                                    ) : (
                                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsAddPlanDialogOpen(true); }} className="gap-2 py-3">
                                            <PlusCircle className="w-4 h-4 text-primary" /> Add Visit Plans
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsNonCallDialogOpen(true); }} className="gap-2 py-3" disabled={isLocked}>
                                        <CalendarOff className="w-4 h-4 text-orange-500" /> Log Leave / Non-Call
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    {selectedDayNonCallDays.length > 0 && (
                        <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                             <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 px-1">
                                <CalendarOff className="w-3 h-3" /> Non-Call Activity
                            </h4>
                            {selectedDayNonCallDays.map((day) => (
                                <div key={day.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-orange-500/5 border-2 border-orange-500/20 p-4 rounded-xl shadow-sm">
                                    <div className="flex items-start gap-4">
                                        <div className="p-2 rounded-full bg-orange-500/10">
                                            <StatusIcon status={day.status} />
                                        </div>
                                        <div>
                                            <p className="font-black font-headline text-lg text-orange-600 dark:text-orange-400 leading-none mb-1">
                                                {day.reason}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge variant="secondary" className="h-6 px-2 text-[10px] font-black uppercase tracking-tighter bg-orange-500/10 text-orange-600 border-none">
                                                    {dayTypeLabels[day.dayType]}
                                                </Badge>
                                                {day.remarks && (
                                                    <p className="text-xs text-muted-foreground font-medium italic">
                                                        "{day.remarks}"
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className={cn(
                                        "h-8 px-4 capitalize font-black text-xs border-2 shadow-sm",
                                        day.status === 'approved' && "bg-primary/10 text-primary border-primary/30",
                                        day.status === 'pending' && "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
                                        day.status === 'rejected' && "bg-destructive/10 text-destructive border-destructive/30"
                                    )}>
                                        {day.status}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}

                    <Card className="shadow-lg border-2 rounded-xl overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 h-14">
                                    <TableHead className="font-bold">Doctor</TableHead>
                                    <TableHead className="hidden md:table-cell font-bold">Location</TableHead>
                                    <TableHead className="font-bold">Status</TableHead>
                                    <TableHead className="text-right font-bold">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selectedDayPlans.length > 0 ? (
                                    selectedDayPlans.map((plan) => {
                                        const doctor = doctors.find(d => d.id === plan.doctorId);
                                        const dateStr = format(selectedDate || new Date(), 'yyyy-MM-dd');
                                        const isCovered = (entriesByDate[dateStr] || []).some(e => 
                                            String(e.firstName || "").toLowerCase() === String(plan.doctorFirstName || "").toLowerCase() && 
                                            String(e.lastName || "").toLowerCase() === String(plan.doctorLastName || "").toLowerCase()
                                        );
                                        return (
                                            <TableRow key={plan.id} className="h-16">
                                                <TableCell>
                                                    <Button variant="link" className="p-0 h-auto font-bold text-base text-primary" onClick={() => handleLogCallClick(plan)} disabled={readOnly || isCovered}>
                                                        {plan.doctorFirstName} {plan.doctorLastName}
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-medium">{doctor?.municipality}</TableCell>
                                                <TableCell>
                                                    {isCovered ? (
                                                        <Badge variant="secondary" className="text-primary font-bold">Covered</Badge>
                                                    ) : (
                                                        <Badge 
                                                            variant="outline" 
                                                            className={cn("font-bold", plan.callType === 'unplanned' && "border-orange-500/50 text-orange-500")}
                                                        >
                                                            {plan.callType === 'unplanned' ? 'Unplanned' : 'Planned'}
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">{!readOnly && <Button variant="ghost" size="icon" onClick={() => onRemovePlan(plan.id)} disabled={isLocked || isCovered}><XCircle size={18} className="text-destructive"/></Button>}</TableCell>
                                            </TableRow>
                                        )
                                    })
                                ) : (
                                    <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground text-lg italic">No visits planned for this day.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </div>
            </div>

            <Dialog open={isAddPlanDialogOpen} onOpenChange={setIsAddPlanDialogOpen}>
                <DialogContent className="w-[94vw] max-w-5xl h-[90vh] flex flex-col p-0 overflow-hidden bg-background border-2 shadow-2xl">
                    <DialogHeader className="p-4 shrink-0">
                        <DialogTitle className="text-lg font-headline font-black">Plan Visits: {selectedDate ? format(selectedDate, "MMMM d, yyyy") : ""}</DialogTitle>
                        <DialogDescription className="text-sm">Select doctors from your masterlist to bulk schedule visits.</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 flex flex-col min-h-0 p-4 pt-0 space-y-4 overflow-hidden">
                        <div className="relative shrink-0">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input 
                                placeholder="Search by name, specialty, or city..." 
                                value={doctorFilter} 
                                onChange={(e) => setDoctorFilter(e.target.value)} 
                                className="pl-10 h-9 text-sm rounded-lg border-2 focus-visible:ring-primary bg-card"
                            />
                        </div>

                        <div className="space-y-3 shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="font-bold font-headline text-xs uppercase tracking-tight">Total Completed:</span>
                                <span className="font-black text-primary text-sm">{territoryStats.total.completed} / {territoryStats.total.target}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">By Frequency:</span>
                                {['1x', '2x', '3x', '4x'].map(f => (
                                    territoryStats[f as keyof typeof territoryStats].target > 0 && (
                                        <Badge key={f} variant="outline" className="h-7 px-2 font-bold border-2 bg-background/50 text-[10px]">
                                            {f}: {territoryStats[f as keyof typeof territoryStats].completed} / {territoryStats[f as keyof typeof territoryStats].target}
                                        </Badge>
                                    )
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col relative">
                            <div className="flex-1 w-full overflow-y-auto scrollbar-hide">
                                <Table className="w-full">
                                    <TableHeader className="sticky top-0 bg-background z-20">
                                        <TableRow className="h-10 hover:bg-transparent">
                                            <TableHead className="w-[40px] pl-0"></TableHead>
                                            <TableHead className="w-[200px] text-xs font-bold uppercase tracking-tighter">Doctor Name</TableHead>
                                            <TableHead className="text-xs font-bold uppercase tracking-tighter">Location</TableHead>
                                            <TableHead className="w-[60px] text-center text-xs font-bold uppercase tracking-tighter">Freq</TableHead>
                                            <TableHead className="w-[60px] text-center text-xs font-bold uppercase tracking-tighter pr-0">Left</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredDoctorsForSearch.length > 0 ? (
                                            filteredDoctorsForSearch.map(doctor => {
                                                const nameKey = `${String(doctor.firstName || "").toLowerCase()}|${String(doctor.lastName || "").toLowerCase()}`;
                                                const actualCount = visitCountsThisMonth[nameKey] || 0;
                                                const freq = String(doctor.frequency || '1x');
                                                const targetCount = parseInt(freq.replace('x', ''), 10) || 0;
                                                const remaining = Math.max(0, targetCount - actualCount);
                                                const isAlreadyPlanned = selectedDayPlannedIds.has(doctor.id);
                                                
                                                return (
                                                    <TableRow key={doctor.id} className={cn("h-10 border-b last:border-0 hover:bg-muted/30 transition-colors", isAlreadyPlanned && "bg-muted/50 opacity-60")}>
                                                        <TableCell className="w-[40px] pl-0">
                                                            <Checkbox 
                                                                checked={selectedDoctorIds.has(doctor.id)} 
                                                                onCheckedChange={() => toggleDoctorSelection(doctor.id)}
                                                                disabled={isAlreadyPlanned}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="w-[200px]">
                                                            <span className="font-bold text-xs">{doctor.firstName} {doctor.lastName}</span>
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground text-[10px] font-medium truncate max-w-[150px]">
                                                            {doctor.municipality}
                                                        </TableCell>
                                                        <TableCell className="w-[60px] text-center font-bold text-[10px]">
                                                            {doctor.frequency}
                                                        </TableCell>
                                                        <TableCell className="w-[60px] font-mono text-xs font-black text-center pr-0">
                                                            {remaining}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-48 text-center text-muted-foreground italic text-xs">No results found.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="p-4 pt-0 gap-3 flex-row justify-end shrink-0">
                        <Button variant="outline" onClick={() => setIsAddPlanDialogOpen(false)} disabled={isSubmitting} className="h-10 px-6 font-bold border-2 text-sm">Close</Button>
                        <Button onClick={handleBulkSubmit} disabled={isSubmitting || selectedDoctorIds.size === 0} className="min-w-[160px] font-headline text-base font-black h-10 shadow-lg transition-all active:scale-95 bg-primary text-primary-foreground hover:bg-primary/90">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                            Schedule ({selectedDoctorIds.size})
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {selectedDate && <NonCallDayDialog isOpen={isNonCallDialogOpen} onOpenChange={setIsNonCallDialogOpen} onSave={handleSaveNonCallDay} selectedDate={selectedDate} />}
            {selectedDate && <PlanningPermissionDialog isOpen={isUnlockDialogOpen} onOpenChange={setIsUnlockDialogOpen} onConfirm={(reason) => onRequestUnlock(getWeekMonday(selectedDate), reason)} weekStartDate={getWeekMonday(selectedDate)} />}
        </div>
    );
}
