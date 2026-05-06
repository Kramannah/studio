
"use client"

import type { Doctor, Plan, NonCallDay, CoverageEntry, PlanningPermissionRequest } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isSameDay, isThisMonth, startOfToday, isValid, isSameWeek, isSameMonth } from "date-fns";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { PlusCircle, CalendarOff, Search, Clock, CheckCircle, XCircle, List, CheckCheck, ClipboardList, ChevronDown, Settings2, Lock, Unlock, Loader2 } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "./ui/input";
import { NonCallDayDialog } from "./non-call-day-dialog";
import { PlanningPermissionDialog } from "./planning-permission-dialog";
import { cn, isPastWeek, getWeekMonday, isCurrentWeek } from "@/lib/utils";
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
    'halfday-am': 'AM',
    'halfday-pm': 'PM',
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

    useEffect(() => {
        setSelectedDate(new Date());
    }, []);

    const allEntries = useMemo(() => [...entries, ...offlineEntries], [entries, offlineEntries]);

    const entriesByDate = useMemo(() => {
        const groups: Record<string, CoverageEntry[]> = {};
        allEntries.forEach(e => {
            const dateStr = e.coverageDate;
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
            const dateStr = e.coverageDate;
            if (dateStr) {
                const date = parseISO(dateStr);
                if (isValid(date) && isSameMonth(date, today)) {
                    const nameKey = `${(e.firstName || '').toLowerCase()}|${(e.lastName || '').toLowerCase()}`;
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
            const freq = d.frequency || '1x';
            const target = parseInt(freq.replace('x', ''), 10) || 0;
            const nameKey = `${(d.firstName || '').toLowerCase()}|${(d.lastName || '').toLowerCase()}`;
            const completed = Math.min(target, visitCountsThisMonth[nameKey] || 0);

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

    const selectedDayStats = useMemo(() => {
        if (!selectedDate) return { total: 0, covered: 0, notCovered: 0 };
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const dayPlans = plansByDate[dateStr] || [];
        const dayEntries = entriesByDate[dateStr] || [];
        
        const coveredCount = dayPlans.filter(p => 
            dayEntries.some(e => 
                (e.firstName || '').toLowerCase() === (p.doctorFirstName || '').toLowerCase() && 
                (e.lastName || '').toLowerCase() === (p.doctorLastName || '').toLowerCase()
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
        const q = doctorFilter.toLowerCase().trim();
        if (!q) return doctors;
        return doctors.filter(d => 
            `${d.firstName} ${d.lastName}`.toLowerCase().includes(q) ||
            (d.municipality && d.municipality.toLowerCase().includes(q)) ||
            (d.specialty && d.specialty.toLowerCase().includes(q))
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

                    {nonCallDaysByDate[format(selectedDate || new Date(), 'yyyy-MM-dd')]?.[0] && (
                        <div className="flex items-center justify-between p-5 border-2 rounded-xl bg-destructive/5">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-destructive/10 rounded-full">
                                    <CalendarOff className="w-6 h-6 text-destructive" />
                                </div>
                                <div className="space-y-1">
                                    {nonCallDaysByDate[format(selectedDate || new Date(), 'yyyy-MM-dd')].map((ncd) => (
                                        <div key={ncd.id}>
                                            <p className="text-xl font-black text-destructive leading-tight">{ncd.reason}</p>
                                            <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                                                {dayTypeLabels[ncd.dayType]}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <Badge variant="outline" className="h-10 px-4 text-sm font-bold uppercase gap-2 border-2">
                                <StatusIcon status={nonCallDaysByDate[format(selectedDate || new Date(), 'yyyy-MM-dd')][0].status} /> {nonCallDaysByDate[format(selectedDate || new Date(), 'yyyy-MM-dd')][0].status}
                            </Badge>
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
                                            (e.firstName || '').toLowerCase() === (plan.doctorFirstName || '').toLowerCase() && 
                                            (e.lastName || '').toLowerCase() === (plan.doctorLastName || '').toLowerCase()
                                        );
                                        return (
                                            <TableRow key={plan.id} className="h-16">
                                                <TableCell>
                                                    <Button variant="link" className="p-0 h-auto font-bold text-base text-primary" onClick={() => handleLogCallClick(plan)} disabled={readOnly || isCovered}>
                                                        {plan.doctorFirstName} {plan.doctorLastName}
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-medium">{doctor?.municipality}</TableCell>
                                                <TableCell>{isCovered ? <Badge variant="secondary" className="text-primary font-bold">Covered</Badge> : <Badge variant="outline" className="font-bold">Planned</Badge>}</TableCell>
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
                <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-background">
                    <DialogHeader className="p-6 border-b shrink-0 bg-muted/20">
                        <DialogTitle className="text-2xl font-headline font-black">Add Visit Plans</DialogTitle>
                        <DialogDescription className="text-base">Select doctors from your masterlist to schedule visits for {selectedDate ? format(selectedDate, "MMMM d, yyyy") : ""}.</DialogDescription>
                        
                        <div className="flex flex-wrap gap-2 mt-4">
                            <Badge variant="outline" className="h-7 px-3 font-bold border-2 border-primary/30 text-primary bg-primary/10">
                                Monthly Territory Progress: {territoryStats.total.completed} / {territoryStats.total.target}
                            </Badge>
                            {['1x', '2x', '3x', '4x'].map(f => (
                                <Badge key={f} variant="outline" className="h-7 px-3 font-bold border-2 bg-background/50">
                                    {f}: {territoryStats[f as keyof typeof territoryStats].completed} / {territoryStats[f as keyof typeof territoryStats].target}
                                </Badge>
                            ))}
                        </div>
                    </DialogHeader>

                    <div className="flex-1 flex flex-col min-h-0 p-6 space-y-6">
                        <div className="relative shrink-0">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            <Input 
                                placeholder="Search doctors by name, specialty, or city..." 
                                value={doctorFilter} 
                                onChange={(e) => setDoctorFilter(e.target.value)} 
                                className="pl-12 h-12 text-lg rounded-xl border-2 focus-visible:ring-primary bg-card"
                            />
                        </div>

                        <div className="flex-1 border-2 rounded-2xl bg-card overflow-hidden flex flex-col">
                            <div className="sticky top-0 bg-muted/90 backdrop-blur-md z-30 border-b-2">
                                <Table className="table-fixed w-full">
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent h-12">
                                            <TableHead className="w-[60px] pl-6">
                                                <Checkbox 
                                                    checked={filteredDoctorsForSearch.length > 0 && selectedDoctorIds.size === filteredDoctorsForSearch.filter(d => !selectedDayPlannedIds.has(d.id)).length} 
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            const ids = new Set(filteredDoctorsForSearch.filter(d => !selectedDayPlannedIds.has(d.id)).map(d => d.id));
                                                            setSelectedDoctorIds(ids);
                                                        } else {
                                                            setSelectedDoctorIds(new Set());
                                                        }
                                                    }}
                                                />
                                            </TableHead>
                                            <TableHead className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Doctor Name</TableHead>
                                            <TableHead className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Location</TableHead>
                                            <TableHead className="w-[120px] font-bold text-xs uppercase tracking-widest text-muted-foreground text-center">Remaining</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                </Table>
                            </div>
                            <ScrollArea className="flex-1">
                                <Table className="table-fixed w-full">
                                    <TableBody>
                                        {filteredDoctorsForSearch.length > 0 ? (
                                            filteredDoctorsForSearch.map(doctor => {
                                                const nameKey = `${(doctor.firstName || '').toLowerCase()}|${(doctor.lastName || '').toLowerCase()}`;
                                                const completedCount = visitCountsThisMonth[nameKey] || 0;
                                                const targetCount = parseInt((doctor.frequency || '1x').replace('x', ''), 10) || 0;
                                                const remaining = Math.max(0, targetCount - completedCount);
                                                const isAlreadyPlanned = selectedDayPlannedIds.has(doctor.id);
                                                
                                                return (
                                                    <TableRow key={doctor.id} className={cn("h-16 border-b last:border-0 hover:bg-muted/30 transition-colors", isAlreadyPlanned && "bg-muted/50 opacity-60")}>
                                                        <TableCell className="w-[60px] pl-6">
                                                            <Checkbox 
                                                                checked={selectedDoctorIds.has(doctor.id)} 
                                                                onCheckedChange={() => toggleDoctorSelection(doctor.id)}
                                                                disabled={isAlreadyPlanned}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-primary">{doctor.firstName} {doctor.lastName}</span>
                                                                <span className="text-[10px] text-muted-foreground uppercase font-bold">{doctor.specialty}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-sm text-muted-foreground truncate">
                                                            {doctor.municipality}
                                                        </TableCell>
                                                        <TableCell className="w-[120px] font-mono text-lg font-black text-center text-foreground/70">
                                                            {remaining}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-64 text-center text-muted-foreground italic text-lg">No doctors found matching your search.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </div>
                    </div>

                    <DialogFooter className="p-6 border-t bg-muted/20 gap-4 flex-row justify-end shrink-0">
                        <Button variant="outline" onClick={() => setIsAddPlanDialogOpen(false)} disabled={isSubmitting} className="h-12 px-8 font-bold border-2">Cancel</Button>
                        <Button onClick={handleBulkSubmit} disabled={isSubmitting || selectedDoctorIds.size === 0} className="min-w-[200px] font-headline text-lg font-black h-12 shadow-lg transition-all active:scale-95">
                            {isSubmitting ? <Loader2 className="animate-spin mr-3" /> : <PlusCircle className="mr-3 w-5 h-5" />}
                            Plan {selectedDoctorIds.size} Visit(s)
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {selectedDate && <NonCallDayDialog isOpen={isNonCallDialogOpen} onOpenChange={setIsNonCallDialogOpen} onSave={handleSaveNonCallDay} selectedDate={selectedDate} />}
            {selectedDate && <PlanningPermissionDialog isOpen={isUnlockDialogOpen} onOpenChange={setIsUnlockDialogOpen} onConfirm={(reason) => onRequestUnlock(getWeekMonday(selectedDate), reason)} weekStartDate={getWeekMonday(selectedDate)} />}
        </div>
    );
}
