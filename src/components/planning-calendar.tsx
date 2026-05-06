
"use client"

import type { Doctor, Plan, NonCallDay, CoverageEntry, PlanningPermissionRequest } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isSameDay, isThisMonth, startOfToday, isValid, isSameWeek } from "date-fns";
import React, { useState, useMemo, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { PlusCircle, CalendarOff, Search, Clock, CheckCircle, XCircle, List, CheckCheck, ClipboardList, ChevronDown, Settings2, Lock, Unlock } from "lucide-react";
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

type PlanningCalendarProps = {
  doctors: Doctor[];
  plans: Plan[];
  planningRequests: PlanningPermissionRequest[];
  onRequestUnlock: (week: Date, reason: string) => Promise<boolean>;
  entries: CoverageEntry[];
  offlineEntries?: CoverageEntry[];
  onAddPlan: (doctor: Doctor, plannedDate: Date) => void;
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
    doctors, 
    plans, 
    planningRequests,
    onRequestUnlock,
    entries, 
    offlineEntries = [],
    onAddPlan, 
    onRemovePlan, 
    onLogCall, 
    nonCallDays, 
    onAddNonCallDay, 
    readOnly = false,
}: PlanningCalendarProps) {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    const [isAddPlanDialogOpen, setIsAddPlanDialogOpen] = useState(false);
    const [isNonCallDialogOpen, setIsNonCallDialogOpen] = useState(false);
    const [isUnlockDialogOpen, setIsUnlockDialogOpen] = useState(false);
    const [doctorFilter, setDoctorFilter] = useState("");

    useEffect(() => {
        setSelectedDate(new Date());
    }, []);

    const allEntries = useMemo(() => [...entries, ...offlineEntries], [entries, offlineEntries]);

    const isLocked = useMemo(() => {
        if (!selectedDate) return false;
        if (isCurrentWeek(selectedDate)) return false;
        if (!isPastWeek(selectedDate)) return false;

        const monday = getWeekMonday(selectedDate);
        const hasApproval = planningRequests.some(req => 
            req.status === 'approved' && 
            isSameDay(parseISO(req.weekStartDate), monday)
        );
        
        return !hasApproval;
    }, [selectedDate, planningRequests]);

    const visitCountsThisMonth = useMemo(() => {
        const counts: Record<string, number> = {};
        allEntries.forEach(e => {
            const date = typeof e.submittedAt === 'string' ? parseISO(e.submittedAt) : e.submittedAt;
            if (date && isValid(date) && isThisMonth(date)) {
                const nameKey = `${e.firstName} ${e.lastName}`.toLowerCase();
                counts[nameKey] = (counts[nameKey] || 0) + 1;
            }
        });
        return counts;
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

    const selectedDayPlans = useMemo(() => {
        if (!selectedDate) return [];
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        return plansByDate[dateStr] || [];
    }, [plansByDate, selectedDate]);

    const entriesByDate = useMemo(() => {
        const groups: Record<string, CoverageEntry[]> = {};
        allEntries.forEach(e => {
            const date = typeof e.coverageDate === 'string' ? parseISO(e.coverageDate) : e.coverageDate;
            if (isValid(date)) {
                const dateStr = format(date, 'yyyy-MM-dd');
                if (!groups[dateStr]) groups[dateStr] = [];
                groups[dateStr].push(e);
            }
        });
        return groups;
    }, [allEntries]);

    const selectedDayStats = useMemo(() => {
        if (!selectedDate) return { total: 0, covered: 0, notYetCovered: 0 };
        const dateString = format(selectedDate, 'yyyy-MM-dd');
        const dayEntries = entriesByDate[dateString] || [];
        
        let covered = 0;
        selectedDayPlans.forEach(plan => {
            const isCovered = dayEntries.some(entry => 
                entry.firstName?.toLowerCase() === plan.doctorFirstName.toLowerCase() &&
                entry.lastName?.toLowerCase() === plan.doctorLastName.toLowerCase()
            );
            if (isCovered) covered++;
        });

        return {
            total: selectedDayPlans.length,
            covered,
            notYetCovered: Math.max(0, selectedDayPlans.length - covered)
        };
    }, [selectedDate, selectedDayPlans, entriesByDate]);
    
    const selectedDayNonCallEntry = useMemo(() => {
        if (!selectedDate) return undefined;
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        return (nonCallDaysByDate[dateStr] || [])[0];
    }, [nonCallDaysByDate, selectedDate]);
    
    const plannedDays = useMemo(() => {
        return Object.keys(plansByDate).map(dateStr => parseISO(dateStr));
    }, [plansByDate]);

    const nonCallCalendarDays = useMemo(() => {
        return Object.keys(nonCallDaysByDate).map(dateStr => parseISO(dateStr));
    }, [nonCallDaysByDate]);

    const filteredDoctors = useMemo(() => {
        if (!doctorFilter) return doctors;
        const q = doctorFilter.toLowerCase();
        return doctors.filter(d => 
            `${d.firstName} ${d.lastName}`.toLowerCase().includes(q) ||
            (d.province && d.province.toLowerCase().includes(q)) ||
            (d.municipality && d.municipality.toLowerCase().includes(q)) ||
            (d.specialty && d.specialty.toLowerCase().includes(q))
        );
    }, [doctors, doctorFilter]);

    const handleAddPlan = (doctor: Doctor) => {
        if (selectedDate) {
            onAddPlan(doctor, selectedDate);
            setIsAddPlanDialogOpen(false);
            setDoctorFilter("");
        }
    };

    const handleSaveNonCallDay = (data: {reason: string, remarks?: string, dayType: 'wholeday' | 'halfday-am' | 'halfday-pm'}) => {
        if(selectedDate) {
            onAddNonCallDay({
                date: selectedDate.toISOString(),
                reason: data.reason,
                remarks: data.remarks || "",
                dayType: data.dayType,
            });
        }
    };
    
    const handleLogCallClick = (plan: Plan) => {
        const doctor = doctors.find(d => d.id === plan.doctorId);
        const date = typeof plan.plannedDate === 'string' ? parseISO(plan.plannedDate) : plan.plannedDate;
        if (doctor && isValid(date)) {
            onLogCall(doctor, date);
        }
    }

    const PlanTable = ({ plansToRender }: { plansToRender: Plan[] }) => (
        <Table>
            <TableHeader>
                <TableRow className="bg-muted/50">
                    <TableHead className="font-bold">Doctor</TableHead>
                    <TableHead className="hidden md:table-cell font-bold">Location</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                    <TableHead className="text-right font-bold">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {plansToRender.length > 0 ? (
                    plansToRender.map((plan) => {
                        const doctor = doctors.find(d => d.id === plan.doctorId);
                        if (!doctor) return null;

                        const dateStr = typeof plan.plannedDate === 'string' ? format(parseISO(plan.plannedDate), 'yyyy-MM-dd') : format(plan.plannedDate, 'yyyy-MM-dd');
                        const dayEntries = entriesByDate[dateStr] || [];
                        const isCovered = dayEntries.some(entry => 
                            entry.firstName?.toLowerCase() === plan.doctorFirstName.toLowerCase() &&
                            entry.lastName?.toLowerCase() === plan.doctorLastName.toLowerCase()
                        );
                        
                        const isLogCallDisabled = readOnly || isCovered;
                        const isRemovalDisabled = readOnly || isLocked || isCovered;

                        return (
                        <TableRow key={plan.id} className="h-16">
                            <TableCell>
                                <Button 
                                    variant="link" 
                                    className="p-0 h-auto font-bold text-left text-base text-primary hover:no-underline"
                                    onClick={() => handleLogCallClick(plan)}
                                    disabled={isLogCallDisabled}
                                >
                                    {plan.doctorFirstName} {plan.doctorLastName}
                                </Button>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                                <span className="text-sm text-muted-foreground font-medium">{doctor.municipality}</span>
                            </TableCell>
                             <TableCell>
                                {isCovered ? (
                                    <Badge variant="secondary" className="text-primary text-xs h-6 px-2 font-bold">Covered</Badge>
                                ) : (
                                    <Badge variant="outline" className="text-xs h-6 px-2 font-bold">Planned</Badge>
                                )}
                            </TableCell>
                            <TableCell className="text-right">
                                 {!readOnly && (
                                     <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-10 w-10"
                                        onClick={() => onRemovePlan(plan.id)}
                                        disabled={isRemovalDisabled}
                                     >
                                         <XCircle size={18} className="text-destructive opacity-70 hover:opacity-100 transition-opacity"/>
                                     </Button>
                                 )}
                            </TableCell>
                        </TableRow>
                    )})
                ) : (
                    <TableRow>
                        <TableCell colSpan={4} className="h-32 text-center text-muted-foreground text-lg italic">
                            No visits planned for this day.
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
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
                                planned: plannedDays,
                                nonCall: nonCallCalendarDays,
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
                                {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "No date selected"}
                                {isLocked && <Lock className="w-5 h-5 text-destructive" />}
                            </h3>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="h-7 px-3 font-bold border-2 border-primary/20 bg-background/50 flex gap-2 items-center">
                                        <ClipboardList className="w-3.5 h-3.5 text-primary" />
                                        <span className="text-primary">{selectedDayStats.total}</span>
                                        <span className="text-[10px] text-muted-foreground uppercase">Planned</span>
                                    </Badge>
                                    <Badge variant="outline" className="h-7 px-3 font-bold border-2 border-green-500/20 bg-green-500/5 flex gap-2 items-center">
                                        <CheckCheck className="w-3.5 h-3.5 text-green-500" />
                                        <span className="text-green-500">{selectedDayStats.covered}</span>
                                        <span className="text-[10px] text-muted-foreground uppercase">Covered</span>
                                    </Badge>
                                    <Badge variant="outline" className="h-7 px-3 font-bold border-2 border-orange-500/20 bg-orange-500/5 flex gap-2 items-center">
                                        <Clock className="w-3.5 h-3.5 text-orange-500" />
                                        <span className="text-orange-500">{selectedDayStats.notYetCovered}</span>
                                        <span className="text-[10px] text-muted-foreground uppercase">Not Yet Covered</span>
                                    </Badge>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button size="lg" className="h-12 px-6 font-bold text-lg gap-2" disabled={readOnly}>
                                        <Settings2 className="w-5 h-5" />
                                        Schedule Actions
                                        <ChevronDown className="w-4 h-4 ml-1 opacity-70" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuLabel>Daily Management</DropdownMenuLabel>
                                    {isLocked ? (
                                        <DropdownMenuItem 
                                            onClick={() => setIsUnlockDialogOpen(true)}
                                            className="gap-2 py-3"
                                        >
                                            <Unlock className="w-4 h-4 text-primary" />
                                            Unlock Planning
                                        </DropdownMenuItem>
                                    ) : (
                                        <DropdownMenuItem 
                                            onClick={() => setIsAddPlanDialogOpen(true)}
                                            className="gap-2 py-3"
                                        >
                                            <PlusCircle className="w-4 h-4 text-primary" />
                                            Add Visit Plans
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem 
                                        onClick={() => setIsNonCallDialogOpen(true)}
                                        className="gap-2 py-3"
                                        disabled={isLocked}
                                    >
                                        <CalendarOff className="w-4 h-4 text-orange-500" />
                                        Log Leave / Non-Call
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    {selectedDayNonCallEntry && (
                        <div className="flex items-center justify-between p-5 border-2 rounded-xl bg-destructive/5 animate-in slide-in-from-top-4 duration-300">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-destructive/10 rounded-full">
                                    <CalendarOff className="w-6 h-6 text-destructive" />
                                </div>
                                <div>
                                    <p className="text-xl font-black text-destructive leading-tight">{selectedDayNonCallEntry.reason}</p>
                                    <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                                        {dayTypeLabels[selectedDayNonCallEntry.dayType]} {selectedDayNonCallEntry.remarks ? `• ${selectedDayNonCallEntry.remarks}` : ''}
                                    </p>
                                </div>
                            </div>
                            <Badge variant="outline" className="h-10 px-4 text-sm font-bold uppercase gap-2 border-2">
                                <StatusIcon status={selectedDayNonCallEntry.status} /> {selectedDayNonCallEntry.status}
                            </Badge>
                        </div>
                    )}

                    <Card className="shadow-lg border-2 rounded-xl overflow-hidden">
                        <PlanTable plansToRender={selectedDayPlans} />
                    </Card>
                </div>
            </div>

            <Dialog open={isAddPlanDialogOpen} onOpenChange={setIsAddPlanDialogOpen}>
                <DialogContent className="max-w-xl w-[95vw] h-[80dvh] p-0 border-none flex flex-col overflow-hidden">
                    <DialogHeader className="p-6 pb-2">
                        <DialogTitle className="text-2xl font-headline font-black">Add Visit Plan</DialogTitle>
                        <DialogDescription>Search and select a doctor to visit on {selectedDate ? format(selectedDate, "PPP") : ""}.</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-hidden p-6 pt-0 flex flex-col space-y-4">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            <Input 
                                placeholder="Search by name, specialty, or location..." 
                                value={doctorFilter} 
                                onChange={(e) => setDoctorFilter(e.target.value)} 
                                className="pl-12 h-12 text-lg rounded-xl focus-visible:ring-primary border-2" 
                                autoFocus
                            />
                        </div>

                        <ScrollArea className="flex-1 border rounded-xl p-2 bg-muted/10">
                            <div className="space-y-2">
                                {filteredDoctors.length > 0 ? (
                                    filteredDoctors.map(doctor => {
                                        const nameKey = `${doctor.firstName} ${doctor.lastName}`.toLowerCase();
                                        const count = visitCountsThisMonth[nameKey] || 0;
                                        const isAlreadyPlanned = selectedDayPlans.some(p => p.doctorId === doctor.id);

                                        return (
                                            <div 
                                                key={doctor.id} 
                                                className={cn(
                                                    "flex items-center justify-between p-4 rounded-xl border transition-all", 
                                                    isAlreadyPlanned ? "bg-muted/20 opacity-60 pointer-events-none" : "bg-card shadow-sm cursor-pointer hover:border-primary border-border/50"
                                                )}
                                                onClick={() => !isAlreadyPlanned && handleAddPlan(doctor)}
                                            >
                                                <div>
                                                    <p className="font-bold text-lg leading-tight">{doctor.firstName} {doctor.lastName}</p>
                                                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">
                                                        {doctor.municipality} • {doctor.specialty} • Target: {doctor.frequency}
                                                    </p>
                                                </div>
                                                <Badge variant={isAlreadyPlanned ? "outline" : "secondary"} className="text-[10px] font-black h-6">
                                                    {isAlreadyPlanned ? 'PLANNED' : `Visits: ${count}`}
                                                </Badge>
                                            </div>
                                        )
                                    })
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                        <Search className="w-8 h-8 mb-2 opacity-20" />
                                        <p>No doctors found.</p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                    <DialogFooter className="p-4 bg-muted/20 border-t">
                        <Button variant="ghost" className="w-full" onClick={() => setIsAddPlanDialogOpen(false)}>
                            Cancel
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {selectedDate && <NonCallDayDialog 
                isOpen={isNonCallDialogOpen}
                onOpenChange={setIsNonCallDialogOpen}
                onSave={handleSaveNonCallDay}
                selectedDate={selectedDate}
            />}

            {selectedDate && <PlanningPermissionDialog
                isOpen={isUnlockDialogOpen}
                onOpenChange={setIsUnlockDialogOpen}
                onConfirm={(reason) => onRequestUnlock(getWeekMonday(selectedDate), reason)}
                weekStartDate={getWeekMonday(selectedDate)}
            />}
        </div>
    );
}
