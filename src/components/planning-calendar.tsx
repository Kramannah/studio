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
import { getWeekMonday, isCurrentWeek, isPastWeek, cn, PH_HOLIDAYS_2026, getHolidayName } from "@/lib/utils";
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
            const dateStr = (e.coverageDate ?? "").toString();
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
        const uniquePlansMap = new Map<string, Plan>();
        (plans || []).forEach(p => { if (p && p.id) uniquePlansMap.set(p.id, p); });

        Array.from(uniquePlansMap.values()).forEach(plan => {
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
        const uniqueNCDMap = new Map<string, NonCallDay>();
        (nonCallDays || []).forEach(d => { if (d && d.id) uniqueNCDMap.set(d.id, d); });

        Array.from(uniqueNCDMap.values()).forEach(day => {
            const date = typeof day.date === 'string' ? parseISO(day.date) : day.date;
            if(isValid(date)) {
                const dateStr = format(date, 'yyyy-MM-dd');
                if (!groups[dateStr]) groups[dateStr] = [];
                groups[dateKey].push(day);
            }
        });
        return groups;
    }, [nonCallDays]);

    const approvedWeekMondays = useMemo(() => {
        return new Set(
            planningRequests
                .filter(r => r.status === 'approved')
                .map(r => format(parseISO((r.weekStartDate ?? "").toString()), 'yyyy-MM-dd'))
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

    const visitCountsThisMonth = useMemo(() => {
        const counts: Record<string, number> = {};
        const today = new Date();
        allEntries.forEach(e => {
            const dateStr = (e.coverageDate ?? "").toString();
            if (dateStr) {
                const date = parseISO(dateStr);
                if (isValid(date) && isSameMonth(date, today)) {
                    const first = (e.firstName ?? "").toString().toLowerCase().trim();
                    const last = (e.lastName ?? "").toString().toLowerCase().trim();
                    const nameKey = `${first}|${last}`;
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

        const uniqueDoctors = new Map<string, Doctor>();
        (doctors || []).forEach(d => { if (d && d.id) uniqueDoctors.set(d.id, d); });

        Array.from(uniqueDoctors.values()).forEach(d => {
            const freq = (d.frequency || '1x').toString();
            const target = parseInt(freq.replace('x', ''), 10) || 0;
            const first = (d.firstName ?? "").toString().toLowerCase().trim();
            const last = (d.lastName ?? "").toString().toLowerCase().trim();
            const nameKey = `${first}|${last}`;
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
        const dayPlans = plansByDate[dateStr] || [];
        const unique = new Map<string, Plan>();
        dayPlans.forEach(p => unique.set(p.id, p));
        return Array.from(unique.values());
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
                (e.firstName ?? "").toString().toLowerCase().trim() === (p.doctorFirstName ?? "").toString().toLowerCase().trim() && 
                (e.lastName ?? "").toString().toLowerCase().trim() === (p.doctorLastName ?? "").toString().toLowerCase().trim()
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
        const uniqueDoctors = new Map<string, Doctor>();
        (doctors || []).forEach(d => { if (d && d.id) uniqueDoctors.set(d.id, d); });
        
        const doctorList = Array.from(uniqueDoctors.values());
        if (!q) return doctorList;
        
        return doctorList.filter(d => 
            `${(d.firstName ?? "")} ${(d.lastName ?? "")}`.toLowerCase().includes(q) ||
            (d.municipality ?? "").toString().toLowerCase().includes(q) ||
            (d.specialty ?? "").toString().toLowerCase().includes(q)
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
        const date = typeof plan.plannedDate === 'string' ? parseISO(plan.plannedDate) : plan.plannedDate;
        if (doctor && isValid(date)) {
            onLogCall(doctor, date);
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
        const uniqueDoctors = new Map<string, Doctor>();
        (doctors || []).forEach(d => { if (d && d.id) uniqueDoctors.set(d.id, d); });
        
        const doctorsToPlan = Array.from(uniqueDoctors.values()).filter(d => selectedDoctorIds.has(d.id));
        const success = await onAddPlansBulk(doctorsToPlan, selectedDate);
        if (success) {
            setIsAddPlanDialogOpen(false);
            setSelectedDoctorIds(new Set());
            setDoctorFilter("");
        }
        setIsSubmitting(false);
    };

    const selectedHoliday = useMemo(() => {
      return selectedDate ? getHolidayName(selectedDate) : null;
    }, [selectedDate]);

    if (!mounted) return (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Initializing Calendar...</p>
        </div>
    );

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
                                    Visits: {selectedDayStats.total}
                                </Badge>
                                <Badge variant="outline" className="h-7 px-3 font-bold border-2 border-primary/30 text-primary bg-primary/10">
                                    Covered: {selectedDayStats.covered}
                                </Badge>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
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
                                    <TableHead className="font-bold">Call Type</TableHead>
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
                                            (e.firstName ?? "").toString().toLowerCase().trim() === (plan.doctorFirstName ?? "").toString().toLowerCase().trim() && 
                                            (e.lastName ?? "").toString().toLowerCase().trim() === (plan.doctorLastName ?? "").toString().toLowerCase().trim()
                                        );
                                        return (
                                            <TableRow key={plan.id} className="h-16 border-b last:border-0 hover:bg-muted/10">
                                                <TableCell>
                                                    <Button 
                                                        variant="link" 
                                                        className="p-0 h-auto font-black text-sm uppercase tracking-tight text-primary hover:no-underline" 
                                                        onClick={() => handleLogCallClick(plan)} 
                                                        disabled={readOnly || isCovered}
                                                    >
                                                        {plan.doctorFirstName} {plan.doctorLastName}
                                                    </Button>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-sm leading-none">{doctor?.municipality || "—"}</span>
                                                        <span className="text-[10px] text-muted-foreground font-medium mt-1">{doctor?.province || "—"}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary" className="font-black text-[10px] uppercase">{plan.callType}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                     <Badge variant="outline" className={cn("font-black text-[10px] uppercase", isCovered && "bg-primary/10 text-primary border-primary/30")}>
                                                        {isCovered ? 'Covered' : 'Not Covered'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {!readOnly && (
                                                        <Button variant="ghost" size="icon" onClick={() => onRemovePlan(plan.id)} disabled={isLocked || isCovered}>
                                                            <XCircle size={18} className="text-destructive" />
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                ) : (
                                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground text-lg italic">No visits planned for this day.</TableCell></TableRow>
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
                            <Input placeholder="Search masterlist..." value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} className="pl-10 h-9 text-sm border-2" />
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col">
                            <div className="flex-1 w-full overflow-y-auto">
                                <Table className="w-full">
                                    <TableHeader className="sticky top-0 bg-background z-20">
                                        <TableRow className="h-10">
                                            <TableHead className="w-[40px] pl-0"></TableHead>
                                            <TableHead className="text-xs font-bold uppercase">Doctor</TableHead>
                                            <TableHead className="text-xs font-bold uppercase">Location</TableHead>
                                            <TableHead className="w-[60px] text-center text-xs font-bold uppercase">Freq</TableHead>
                                            <TableHead className="w-[60px] text-center text-xs font-bold uppercase">Left</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredDoctorsForSearch.map(doctor => {
                                            const first = (doctor.firstName ?? "").toString().toLowerCase().trim();
                                            const last = (doctor.lastName ?? "").toString().toLowerCase().trim();
                                            const nameKey = `${first}|${last}`;
                                            const actualCount = visitCountsThisMonth[nameKey] || 0;
                                            const freq = (doctor.frequency || '1x').toString();
                                            const targetCount = parseInt(freq.replace('x', ''), 10) || 0;
                                            const remaining = Math.max(0, targetCount - actualCount);
                                            
                                            return (
                                                <TableRow key={doctor.id} className="h-10 border-b">
                                                    <TableCell className="w-[40px] pl-0">
                                                        <Checkbox checked={selectedDoctorIds.has(doctor.id)} onCheckedChange={() => toggleDoctorSelection(doctor.id)} />
                                                    </TableCell>
                                                    <TableCell className="font-bold text-xs">{doctor.firstName} {doctor.lastName}</TableCell>
                                                    <TableCell className="text-muted-foreground text-[10px] truncate max-w-[150px]">{doctor.municipality}</TableCell>
                                                    <TableCell className="w-[60px] text-center font-bold text-[10px]">{doctor.frequency}</TableCell>
                                                    <TableCell className="w-[60px] font-mono text-xs font-black text-center">{remaining}</TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="p-4 pt-0 gap-3 flex-row justify-end shrink-0">
                        <Button variant="outline" onClick={() => setIsAddPlanDialogOpen(false)} disabled={isSubmitting} className="h-10 font-bold border-2">Close</Button>
                        <Button onClick={handleBulkSubmit} disabled={isSubmitting || selectedDoctorIds.size === 0} className="min-w-[160px] font-headline font-black h-10 shadow-lg">
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