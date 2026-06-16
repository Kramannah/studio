
"use client"

import type { Doctor, Plan, NonCallDay, CoverageEntry, PlanningPermissionRequest } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isSameMonth, isValid } from "date-fns";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { PlusCircle, CalendarOff, Search, Clock, CheckCircle, XCircle, Unlock, Loader2, Lock } from "lucide-react";
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
import { getWeekMonday, isCurrentWeek, isPastWeek, cn, PH_HOLIDAYS_2026, getHolidayName, parseAnyDate } from "@/lib/utils";
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
  selectedMonth?: string;
  onMonthChange?: (month: string) => void;
};

const dayTypeLabels: Record<NonCallDay['dayType'], string> = {
    'wholeday': 'Whole Day',
    'halfday-am': 'Half Day (AM)',
    'halfday-pm': 'Half Day (PM)',
};

const StatusIcon = ({ status }: { status: NonCallDay['status'] | 'holiday' }) => {
    switch (status) {
        case 'holiday':
        case 'approved':
            return <CheckCircle className="w-5 h-5 text-primary" />;
        case 'rejected':
            return <XCircle className="w-5 h-5 text-destructive" />;
        case 'pending':
        default:
            return <Clock className="w-5 h-5 text-yellow-500" />;
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
    selectedMonth,
    onMonthChange
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

    const allEntries = useMemo(() => [...entries, ...offlineEntries], [entries, offlineEntries]);

    const entriesByDate = useMemo(() => {
        const groups: Record<string, CoverageEntry[]> = {};
        allEntries.forEach(e => {
            const d = parseAnyDate(e.coverageDate) || parseAnyDate(e.submittedAt);
            if (d && isValid(d)) {
                const key = format(d, 'yyyy-MM-dd');
                if (!groups[key]) groups[key] = [];
                groups[key].push(e);
            }
        });
        return groups;
    }, [allEntries]);

    const plansByDate = useMemo(() => {
        const groups: Record<string, Plan[]> = {};
        (plans || []).forEach(plan => {
            const d = parseAnyDate(plan.plannedDate);
            if(d && isValid(d)) {
                const dateStr = format(d, 'yyyy-MM-dd');
                if (!groups[dateStr]) groups[dateStr] = [];
                groups[dateStr].push(plan);
            }
        });
        return groups;
    }, [plans]);
    
    const nonCallDaysByDate = useMemo(() => {
        const groups: Record<string, NonCallDay[]> = {};
        (nonCallDays || []).forEach(day => {
            const d = parseAnyDate(day.date);
            if(d && isValid(d)) {
                const dateStr = format(d, 'yyyy-MM-dd');
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
                .map(r => {
                    const d = parseAnyDate(r.weekStartDate);
                    return d && isValid(d) ? format(d, 'yyyy-MM-dd') : '';
                })
                .filter(Boolean)
        );
    }, [planningRequests]);

    const holidayDates = useMemo(() => {
        return Object.keys(PH_HOLIDAYS_2026).map(d => parseISO(d));
    }, []);

    const isLocked = useMemo(() => {
        if (!selectedDate || isCurrentWeek(selectedDate) || !isPastWeek(selectedDate)) return false;
        const mondayStr = format(getWeekMonday(selectedDate), 'yyyy-MM-dd');
        return !approvedWeekMondays.has(mondayStr);
    }, [selectedDate, approvedWeekMondays]);

    const visitCountsForSelectedMonth = useMemo(() => {
        const counts: Record<string, number> = {};
        const referenceDate = selectedDate || new Date();
        
        allEntries.forEach(e => {
            const d = parseAnyDate(e.coverageDate) || parseAnyDate(e.submittedAt);
            if (d && isValid(d) && isSameMonth(d, referenceDate)) {
                const first = String(e.firstName || "").toLowerCase().trim();
                const last = String(e.lastName || "").toLowerCase().trim();
                const nameKey = `${first}|${last}`;
                counts[nameKey] = (counts[nameKey] || 0) + 1;
            }
        });
        return counts;
    }, [allEntries, selectedDate]);

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
                String(e.firstName || "").toLowerCase().trim() === String(p.doctorFirstName || "").toLowerCase().trim() && 
                String(e.lastName || "").toLowerCase().trim() === String(p.doctorLastName || "").toLowerCase().trim()
            )
        ).length;

        return {
            total: dayPlans.length,
            covered: coveredCount,
            notCovered: Math.max(0, dayPlans.length - coveredCount)
        };
    }, [selectedDate, plansByDate, entriesByDate]);

    const filteredDoctorsForSearch = useMemo(() => {
        const q = (doctorFilter ?? "").toString().toLowerCase().trim();
        const doctorList = Array.from((doctors || []).reduce((acc, d) => d.id ? acc.set(d.id, d) : acc, new Map<string, Doctor>()).values());
        if (!q) return doctorList;
        return doctorList.filter(d => 
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
        const doctor = (doctors || []).find(d => d.id === plan.doctorId);
        if (doctor && plan.plannedDate) {
            onLogCall(doctor, parseAnyDate(plan.plannedDate) || new Date());
        }
    }

    const toggleDoctorSelection = (id: string) => {
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
        const doctorsToPlan = (doctors || []).filter(d => selectedDoctorIds.has(d.id));
        const success = await onAddPlansBulk(doctorsToPlan, selectedDate);
        if (success) {
            setIsAddPlanDialogOpen(false);
            setSelectedDoctorIds(new Set());
            setDoctorFilter("");
        }
        setIsSubmitting(false);
    };

    const selectedHoliday = useMemo(() => selectedDate ? getHolidayName(selectedDate) : null, [selectedDate]);

    const handleMonthChange = (month: Date) => {
        if (onMonthChange) {
            onMonthChange(format(month, 'yyyy-MM'));
        }
    };

    if (!mounted) return null;

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
                            month={selectedMonth ? parseISO(selectedMonth + "-01") : undefined}
                            onMonthChange={handleMonthChange}
                            modifiers={{ 
                                planned: Object.keys(plansByDate).map(d => parseISO(d)),
                                nonCall: Object.keys(nonCallDaysByDate).map(d => parseISO(d)),
                                holiday: holidayDates,
                                weekend: { dayOfWeek: [0, 6] }
                            }}
                            modifiersStyles={{
                                planned: { border: '3px solid hsl(var(--primary))', fontWeight: 'bold' },
                                nonCall: { backgroundColor: 'hsl(var(--destructive) / 0.15)', color: 'hsl(var(--destructive))', fontWeight: 'bold' },
                                holiday: { backgroundColor: 'hsl(var(--accent) / 0.3)', color: 'hsl(var(--accent-foreground))', textDecoration: 'underline' }
                            }}
                            components={{
                                DayContent: ({ date, activeModifiers }) => {
                                    const dateString = format(date, 'yyyy-MM-dd');
                                    const count = plansByDate[dateString]?.length;
                                    return (
                                        <div className="relative flex items-center justify-center w-full h-full">
                                            {date.getDate()}
                                            {count && !activeModifiers?.nonCall && (
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
                            <div className="flex wrap gap-2">
                                <Badge variant="outline" className="h-7 px-3 font-bold border-2 bg-background/50">Total Visits: {selectedDayStats.total}</Badge>
                                <Badge variant="outline" className="h-7 px-3 font-bold border-2 border-primary/30 text-primary bg-primary/10">Covered: {selectedDayStats.covered}</Badge>
                            </div>
                        </div>
                        <div className="flex wrap gap-2">
                            {!readOnly && (
                                <>
                                    {isLocked ? (
                                        <Button variant="outline" onClick={() => setIsUnlockDialogOpen(true)} className="h-10 border-2 font-headline gap-2">
                                            <Unlock className="w-4 h-4 text-primary" /> Unlock Week
                                        </Button>
                                    ) : (
                                        <Button onClick={() => setIsAddPlanDialogOpen(true)} className="h-10 font-headline gap-2">
                                            <PlusCircle className="w-4 h-4" /> Add Visits
                                        </Button>
                                    )}
                                    <Button variant="outline" onClick={() => setIsNonCallDialogOpen(true)} className="h-10 border-orange-500/50 text-orange-500 font-headline gap-2" disabled={isLocked}>
                                        <CalendarOff className="w-4 h-4" /> Log Leave
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    {(selectedDayNonCallDays.length > 0 || selectedHoliday) && (
                        <div className="space-y-3">
                            {selectedHoliday && (
                                <div className="flex items-center justify-between gap-4 bg-orange-500/5 border-2 border-orange-500/20 p-3 rounded-xl">
                                    <div className="flex items-center gap-4">
                                        <StatusIcon status="holiday" />
                                        <p className="font-black font-headline text-lg text-orange-500">{selectedHoliday}</p>
                                    </div>
                                </div>
                            )}
                            {selectedDayNonCallDays.map((day) => (
                                <div key={day.id} className="flex items-center justify-between gap-4 bg-orange-500/5 border-2 border-orange-500/20 p-3 rounded-xl">
                                    <div className="flex items-center gap-4">
                                        <StatusIcon status={day.status} />
                                        <div>
                                            <p className="font-black font-headline text-lg text-orange-500 leading-none">{day.reason}</p>
                                            <p className="text-[10px] text-muted-foreground mt-1 font-bold uppercase tracking-widest">{dayTypeLabels[day.dayType]}</p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="capitalize font-black border-2">{day.status}</Badge>
                                </div>
                            ))}
                        </div>
                    )}

                    <Card className="shadow-lg border-2 rounded-xl overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 h-14">
                                    <TableHead className="font-bold">Doctor</TableHead>
                                    <TableHead className="font-bold">Location</TableHead>
                                    <TableHead className="font-bold">Status</TableHead>
                                    <TableHead className="text-right font-bold">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selectedDayPlans.length > 0 ? (
                                    selectedDayPlans.map((plan) => {
                                        const doctor = (doctors || []).find(d => d.id === plan.doctorId);
                                        const dateStr = format(selectedDate || new Date(), 'yyyy-MM-dd');
                                        const isCovered = (entriesByDate[dateStr] || []).some(e => 
                                            String(e.firstName || "").toLowerCase().trim() === String(plan.doctorFirstName || "").toLowerCase().trim() && 
                                            String(e.lastName || "").toLowerCase().trim() === String(plan.doctorLastName || "").toLowerCase().trim()
                                        );
                                        return (
                                            <TableRow key={plan.id} className="h-16 border-b last:border-0 hover:bg-muted/10">
                                                <TableCell>
                                                    <Button variant="link" className="p-0 h-auto font-black text-sm uppercase tracking-tight text-primary" onClick={() => handleLogCallClick(plan)} disabled={readOnly || isCovered}>
                                                        {plan.doctorFirstName} {plan.doctorLastName}
                                                    </Button>
                                                </TableCell>
                                                <TableCell>{doctor?.municipality || "—"}</TableCell>
                                                <TableCell>
                                                     <Badge variant="outline" className={cn("font-black text-[10px] uppercase", isCovered && "bg-primary/10 text-primary border-primary/30")}>
                                                        {isCovered ? 'Covered' : 'Not Covered'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {!readOnly && <Button variant="ghost" size="icon" onClick={() => onRemovePlan(plan.id)} disabled={isLocked || isCovered}><XCircle size={18} className="text-destructive" /></Button>}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                ) : (
                                    <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground italic">No visits planned for this day.</TableCell></TableRow>
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
                    </DialogHeader>
                    <div className="flex-1 flex flex-col p-4 pt-0 space-y-4 overflow-hidden">
                        <div className="relative shrink-0">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input placeholder="Search masterlist..." value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} className="pl-10 border-2" />
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <Table className="w-full">
                                <TableHeader className="sticky top-0 bg-background z-20"><TableRow><TableHead className="w-[40px]"></TableHead><TableHead className="text-xs font-bold">Doctor</TableHead><TableHead className="w-[60px] text-center text-xs font-bold">Left</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {filteredDoctorsForSearch.map(doctor => {
                                        const first = String(doctor.firstName || "").toLowerCase().trim();
                                        const last = String(doctor.lastName || "").toLowerCase().trim();
                                        const actualCount = visitCountsForSelectedMonth[`${first}|${last}`] || 0;
                                        const targetCount = parseInt(String(doctor.frequency || '1x').replace('x', ''), 10) || 0;
                                        return (
                                            <TableRow key={doctor.id}>
                                                <TableCell><Checkbox checked={selectedDoctorIds.has(doctor.id)} onCheckedChange={() => toggleDoctorSelection(doctor.id)} /></TableCell>
                                                <TableCell className="font-bold text-xs">{doctor.firstName} {doctor.lastName}</TableCell>
                                                <TableCell className="w-[60px] font-mono text-xs font-black text-center">{Math.max(0, targetCount - actualCount)}</TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                    <DialogFooter className="p-4 pt-0 gap-3 shrink-0">
                        <Button variant="outline" onClick={() => setIsAddPlanDialogOpen(false)} disabled={isSubmitting} className="font-bold border-2">Close</Button>
                        <Button onClick={handleBulkSubmit} disabled={isSubmitting || selectedDoctorIds.size === 0} className="font-headline font-black shadow-lg">
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
