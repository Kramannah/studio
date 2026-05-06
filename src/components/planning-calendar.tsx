
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

    // Grouping lookups for calendar modifiers
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

    // Statistics for the planning modal
    const visitCountsThisMonth = useMemo(() => {
        const counts: Record<string, number> = {};
        const today = new Date();
        allEntries.forEach(e => {
            const dateStr = e.coverageDate;
            if (dateStr) {
                const date = parseISO(dateStr);
                if (isValid(date) && isSameMonth(date, today)) {
                    const nameKey = `${e.firstName || ''} ${e.lastName || ''}`.toLowerCase().trim();
                    counts[nameKey] = (counts[nameKey] || 0) + 1;
                }
            }
        });
        return counts;
    }, [allEntries]);

    const territoryStats = useMemo(() => {
        let totalTarget = 0;
        let totalCompleted = 0;
        const freqStats: Record<string, { completed: number, target: number }> = {};

        doctors.forEach(doc => {
            const nameKey = `${doc.firstName || ''} ${doc.lastName || ''}`.toLowerCase().trim();
            const completed = visitCountsThisMonth[nameKey] || 0;
            const target = parseInt((doc.frequency || '1x').replace('x', ''), 10) || 0;

            totalTarget += target;
            totalCompleted += Math.min(completed, target);

            if (!freqStats[doc.frequency]) freqStats[doc.frequency] = { completed: 0, target: 0 };
            freqStats[doc.frequency].completed += Math.min(completed, target);
            freqStats[doc.frequency].target += target;
        });

        return { totalCompleted, totalTarget, freqStats };
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
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden bg-background">
                    <DialogHeader className="p-6 border-b shrink-0">
                        <DialogTitle className="text-2xl font-headline font-black">Plan Visits for {selectedDate ? format(selectedDate, "MMMM d, yyyy") : ""}</DialogTitle>
                        <DialogDescription className="text-base">Select doctors from your masterlist to plan multiple visits at once.</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 flex flex-col min-h-0 p-6 space-y-6">
                        <div className="relative shrink-0">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            <Input 
                                placeholder="Search doctors by name..." 
                                value={doctorFilter} 
                                onChange={(e) => setDoctorFilter(e.target.value)} 
                                className="pl-12 h-12 text-lg rounded-xl border-2 border-primary/50 focus-visible:ring-primary"
                            />
                        </div>

                        <div className="space-y-2 shrink-0">
                             <div className="flex items-center gap-2">
                                <span className="font-headline font-bold text-sm">Total Completed:</span>
                                <span className="font-mono text-sm font-black text-primary">{territoryStats.totalCompleted} / {territoryStats.totalTarget}</span>
                             </div>
                             <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">By Frequency:</span>
                                {Object.entries(territoryStats.freqStats).sort().map(([freq, stats]) => (
                                    <Badge key={freq} variant="secondary" className="font-mono h-7 px-3 border border-primary/10">
                                        {freq}: {stats.completed}/{stats.target}
                                    </Badge>
                                ))}
                             </div>
                        </div>

                        <div className="flex-1 flex flex-col min-h-0">
                            <ScrollArea className="flex-1 border rounded-xl bg-card">
                                <Table className="table-fixed w-full">
                                    <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-20 border-b">
                                        <TableRow className="hover:bg-transparent h-12">
                                            <TableHead className="w-[50px] pl-4"><Checkbox checked={filteredDoctorsForSearch.length > 0 && selectedDoctorIds.size === filteredDoctorsForSearch.length} onCheckedChange={(checked) => {
                                                if (checked) setSelectedDoctorIds(new Set(filteredDoctorsForSearch.map(d => d.id)));
                                                else setSelectedDoctorIds(new Set());
                                            }}/></TableHead>
                                            <TableHead className="w-[200px] font-bold text-xs uppercase">Name</TableHead>
                                            <TableHead className="w-[250px] font-bold text-xs uppercase">Location</TableHead>
                                            <TableHead className="w-[100px] font-bold text-xs uppercase text-center">Target</TableHead>
                                            <TableHead className="font-bold text-xs uppercase text-right pr-6">Remaining</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredDoctorsForSearch.length > 0 ? (
                                            filteredDoctorsForSearch.map(doctor => {
                                                const nameKey = `${doctor.firstName || ''} ${doctor.lastName || ''}`.toLowerCase().trim();
                                                const completedCount = visitCountsThisMonth[nameKey] || 0;
                                                const targetCount = parseInt((doctor.frequency || '1x').replace('x', ''), 10) || 0;
                                                const remaining = Math.max(0, targetCount - completedCount);
                                                const isAlreadyPlanned = selectedDayPlannedIds.has(doctor.id);
                                                
                                                return (
                                                    <TableRow key={doctor.id} className={cn("h-14 border-b last:border-0 hover:bg-muted/30 transition-colors", isAlreadyPlanned && "bg-muted/50 opacity-60")}>
                                                        <TableCell className="w-[50px] pl-4">
                                                            <Checkbox 
                                                                checked={selectedDoctorIds.has(doctor.id)} 
                                                                onCheckedChange={() => toggleDoctorSelection(doctor.id)}
                                                                disabled={isAlreadyPlanned}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="w-[200px] font-bold text-primary truncate">
                                                            {doctor.firstName} {doctor.lastName}
                                                        </TableCell>
                                                        <TableCell className="w-[250px] text-xs text-muted-foreground truncate">
                                                            {doctor.municipality}, {doctor.province}
                                                        </TableCell>
                                                        <TableCell className="w-[100px] font-mono text-sm text-center">
                                                            {doctor.frequency}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-sm font-bold text-right pr-6">
                                                            {remaining}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">No doctors found matching your search.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </div>
                    </div>

                    <DialogFooter className="p-6 border-t bg-muted/20 gap-4 flex-row justify-end shrink-0">
                        <Button variant="ghost" onClick={() => setIsAddPlanDialogOpen(false)} disabled={isSubmitting}>Cancel</Button>
                        <Button onClick={handleBulkSubmit} disabled={isSubmitting || selectedDoctorIds.size === 0} className="min-w-[140px] font-headline text-base h-11">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <PlusCircle className="mr-2" />}
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
