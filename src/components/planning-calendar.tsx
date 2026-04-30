
"use client"

import type { Doctor, Plan, NonCallDay, CoverageEntry, PlanningPermissionRequest } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isSameDay, isToday, isThisMonth, startOfToday, isBefore, isValid, isSameWeek, startOfWeek, endOfWeek, isAfter } from "date-fns";
import { useState, useMemo, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { PlusCircle, CalendarOff, Search, Clock, CheckCircle, XCircle, Lock, Unlock, List, Calendar as CalendarIcon, CheckCheck, ClipboardList, ChevronDown, Settings2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { PlanningPermissionDialog } from "./planning-permission-dialog";
import { Checkbox } from "./ui/checkbox";


type PlanningCalendarProps = {
  doctors: Doctor[];
  plans: Plan[];
  entries: CoverageEntry[];
  offlineEntries?: CoverageEntry[];
  onAddPlan: (doctor: Doctor, plannedDate: Date) => void;
  onRemovePlan: (planId: string) => void;
  onLogCall: (doctor: Doctor, plannedDate: Date) => void;
  nonCallDays: NonCallDay[];
  onAddNonCallDay: (entry: Omit<NonCallDay, 'id' | 'userId' | 'date' | 'status'>) => void;
  readOnly?: boolean;
  planningRequests?: PlanningPermissionRequest[];
  onPermissionRequest?: (weekStartDate: Date, reason: string) => Promise<boolean>;
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
    entries, 
    offlineEntries = [],
    onAddPlan, 
    onRemovePlan, 
    onLogCall, 
    nonCallDays, 
    onAddNonCallDay, 
    readOnly = false,
    planningRequests,
    onPermissionRequest
}: PlanningCalendarProps) {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [isAddPlanDialogOpen, setIsAddPlanDialogOpen] = useState(false);
    const [isNonCallDialogOpen, setIsNonCallDialogOpen] = useState(false);
    const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false);
    const [doctorFilter, setDoctorFilter] = useState("");
    const [selectedDoctorIdsForPlan, setSelectedDoctorIdsForPlan] = useState<string[]>([]);

    const allEntries = useMemo(() => [...entries, ...offlineEntries], [entries, offlineEntries]);

    useEffect(() => {
        if (!isAddPlanDialogOpen) {
            setSelectedDoctorIdsForPlan([]);
            setDoctorFilter("");
        }
    }, [isAddPlanDialogOpen]);


    const visitCountsThisMonth = useMemo(() => {
        const thisMonthEntries = allEntries.filter(e => {
            const submittedDate = typeof e.submittedAt === 'string' ? parseISO(e.submittedAt) : e.submittedAt;
            return isValid(submittedDate) && isThisMonth(submittedDate);
        });
        return thisMonthEntries.reduce((acc, entry) => {
          const doctorName = `${entry.firstName} ${entry.lastName}`.toLowerCase();
          acc[doctorName] = (acc[doctorName] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
    }, [allEntries]);

    const categoryProgress = useMemo(() => {
        const stats = {
            '1x': { covered: 0, total: 0 },
            '2x': { covered: 0, total: 0 },
            '3x': { covered: 0, total: 0 },
            '4x': { covered: 0, total: 0 },
        };
        
        doctors.forEach(d => {
            const freq = d.frequency;
            if (stats[freq]) {
                stats[freq].total += 1;
                const nameKey = `${d.firstName} ${d.lastName}`.toLowerCase();
                // A doctor is considered "covered" if they have at least one visit this month
                if ((visitCountsThisMonth[nameKey] || 0) > 0) {
                    stats[freq].covered += 1;
                }
            }
        });
        return stats;
    }, [doctors, visitCountsThisMonth]);

    const plansByDate = useMemo(() => {
        return plans.reduce((acc, plan) => {
            const plannedDate = typeof plan.plannedDate === 'string' ? parseISO(plan.plannedDate) : plan.plannedDate;
            if(!isValid(plannedDate)) return acc;
            const date = format(plannedDate, 'yyyy-MM-dd');
            if (!acc[date]) {
                acc[date] = [];
            }
            acc[date].push(plan);
            return acc;
        }, {} as Record<string, Plan[]>);
    }, [plans]);
    
    const nonCallDaysByDate = useMemo(() => {
        return nonCallDays.reduce((acc, entry) => {
            const nonCallDate = typeof entry.date === 'string' ? parseISO(entry.date) : entry.date;
            if(!isValid(nonCallDate)) return acc;
            const date = format(nonCallDate, 'yyyy-MM-dd');
            if (!acc[date]) {
                acc[date] = [];
            }
            acc[date].push(entry);
            return acc;
        }, {} as Record<string, NonCallDay[]>);
    }, [nonCallDays]);

    const selectedDayPlans = useMemo(() => {
        if (!selectedDate) return [];
        return plans.filter(plan => {
            const plannedDate = typeof plan.plannedDate === 'string' ? parseISO(plan.plannedDate) : plan.plannedDate;
            return isValid(plannedDate) && isSameDay(plannedDate, selectedDate);
        });
    }, [plans, selectedDate]);

    const entriesByDate = useMemo(() => {
        return allEntries.reduce((acc, entry) => {
            const coverageDate = typeof entry.coverageDate === 'string' ? parseISO(entry.coverageDate) : entry.coverageDate;
            if (!isValid(coverageDate)) return acc;
            const date = format(coverageDate, 'yyyy-MM-dd');
            if(!acc[date]){
                acc[date] = [];
            }
            acc[date].push(entry);
            return acc;
        }, {} as Record<string, CoverageEntry[]>);
    }, [allEntries]);

    const selectedDayStats = useMemo(() => {
        if (!selectedDate) return { total: 0, covered: 0, remaining: 0 };
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
            remaining: Math.max(0, selectedDayPlans.length - covered)
        };
    }, [selectedDate, selectedDayPlans, entriesByDate]);
    
    const selectedDayNonCallEntry = useMemo(() => {
        if (!selectedDate) return undefined;
        return nonCallDays.find(entry => {
            const nonCallDate = typeof entry.date === 'string' ? parseISO(entry.date) : entry.date;
            return isValid(nonCallDate) && isSameDay(nonCallDate, selectedDate);
        });
    }, [nonCallDays, selectedDate]);
    
    const plannedDays = useMemo(() => {
        return Object.keys(plansByDate).map(dateStr => parseISO(dateStr));
    }, [plansByDate]);

    const nonCallCalendarDays = useMemo(() => {
        return Object.keys(nonCallDaysByDate).map(dateStr => parseISO(dateStr));
    }, [nonCallDaysByDate]);

    const filteredDoctors = useMemo(() => {
        if (!doctorFilter) return doctors;
        return doctors.filter(d => 
            `${d.firstName} ${d.lastName}`.toLowerCase().includes(doctorFilter.toLowerCase()) ||
            (d.province && d.province.toLowerCase().includes(doctorFilter.toLowerCase())) ||
            (d.municipality && d.municipality.toLowerCase().includes(doctorFilter.toLowerCase()))
        );
    }, [doctors, doctorFilter]);

    const handleAddSelectedPlans = () => {
        if (selectedDate && selectedDoctorIdsForPlan.length > 0) {
            const doctorsToAdd = doctors.filter(d => selectedDoctorIdsForPlan.includes(d.id));
            doctorsToAdd.forEach(doctor => {
                onAddPlan(doctor, selectedDate);
            });
            setIsAddPlanDialogOpen(false);
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
        const plannedDate = typeof plan.plannedDate === 'string' ? parseISO(plan.plannedDate) : plan.plannedDate;
        if (doctor && isValid(plannedDate)) {
            onLogCall(doctor, plannedDate);
        }
    }

    const today = startOfToday();
    
    const currentWeekRequest = useMemo(() => {
        if (!selectedDate || !planningRequests) return null;
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
        return planningRequests.find(req => {
             const reqDate = parseISO(req.weekStartDate);
             return isValid(reqDate) && isSameDay(reqDate, weekStart);
        });
    }, [planningRequests, selectedDate]);
    
    const canPlanPlannedCalls = useMemo(() => {
        if (!selectedDate) return false;
        
        const weekStartOfSelected = startOfWeek(selectedDate, { weekStartsOn: 1 });
        const weekStartOfToday = startOfWeek(startOfToday(), { weekStartsOn: 1 });
        
        if (!isBefore(weekStartOfSelected, weekStartOfToday)) {
            return true;
        }
        
        if (currentWeekRequest?.status === 'approved') {
            return true;
        }

        return false;

    }, [selectedDate, currentWeekRequest]);
    
    const canLogCallForDate = (date: Date) => {
        if (!isBefore(date, today)) return true;
        if (isSameWeek(date, today, { weekStartsOn: 1 })) return true;
        const weekStart = startOfWeek(date, { weekStartsOn: 1 });
        const request = planningRequests?.find(req => {
            const reqDate = parseISO(req.weekStartDate);
            return isValid(reqDate) && isSameDay(reqDate, weekStart);
        });
        return request?.status === 'approved';
    }

    const handlePermissionRequest = async (reason: string) => {
        if(selectedDate && onPermissionRequest) {
            const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
            return await onPermissionRequest(weekStart, reason);
        }
        return false;
    };

    const renderWeekStatus = () => {
        if (!selectedDate || readOnly) return null;

        const isPastWk = isBefore(startOfWeek(selectedDate, { weekStartsOn: 1 }), startOfWeek(today, { weekStartsOn: 1 }));

        if (!isPastWk) {
            return (
                <Badge variant='secondary' className="capitalize">
                    <Unlock className="w-3 h-3 mr-1.5" /> Unlocked
                </Badge>
            );
        }

        if (currentWeekRequest?.status === 'approved') {
            return (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger>
                            <Badge variant='secondary' className="capitalize">
                                <Unlock className="w-3 h-3 mr-1.5" /> Unlocked (Approved)
                            </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>This past week has been unlocked for planning.</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            );
        }

        if (currentWeekRequest?.status === 'pending') {
            return (
                 <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger>
                             <Badge variant='destructive' className="capitalize cursor-not-allowed">
                                <Lock className="w-3 h-3 mr-1.5" /> Locked (Pending)
                            </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Your request to unlock this week is pending approval.</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            );
        }

        return (
             <Badge variant='destructive' className="capitalize">
                <Lock className="w-3 h-3 mr-1.5" /> Locked
            </Badge>
        );
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

                        const planDate = typeof plan.plannedDate === 'string' ? parseISO(plan.plannedDate) : plan.plannedDate;
                        const dateString = format(planDate, 'yyyy-MM-dd');
                        const dayEntries = entriesByDate[dateString] || [];
                        const isCovered = dayEntries.some(entry => 
                            entry.firstName?.toLowerCase() === plan.doctorFirstName.toLowerCase() &&
                            entry.lastName?.toLowerCase() === plan.doctorLastName.toLowerCase()
                        );
                        
                        const isLogCallDisabled = readOnly || isCovered || !canLogCallForDate(planDate);
                        const isRemovalDisabled = readOnly || isCovered;

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

    const isPastWkLocked = useMemo(() => {
        if (!selectedDate) return false;
        const isPastWk = isBefore(startOfWeek(selectedDate, { weekStartsOn: 1 }), startOfWeek(today, { weekStartsOn: 1 }));
        return isPastWk && currentWeekRequest?.status !== 'approved';
    }, [selectedDate, today, currentWeekRequest]);

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
                            <h3 className="text-2xl font-black font-headline tracking-tight">
                                {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "No date selected"}
                            </h3>
                            <div className="flex flex-wrap items-center gap-3">
                                {renderWeekStatus()}
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
                                        <span className="text-orange-500">{selectedDayStats.remaining}</span>
                                        <span className="text-[10px] text-muted-foreground uppercase">Remaining</span>
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
                                    <DropdownMenuItem 
                                        onClick={() => setIsAddPlanDialogOpen(true)}
                                        disabled={!canPlanPlannedCalls}
                                        className="gap-2 py-3"
                                    >
                                        <PlusCircle className="w-4 h-4 text-primary" />
                                        Add Visit Plans
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                        onClick={() => setIsNonCallDialogOpen(true)}
                                        disabled={!canPlanPlannedCalls}
                                        className="gap-2 py-3"
                                    >
                                        <CalendarOff className="w-4 h-4 text-orange-500" />
                                        Log Leave / Non-Call
                                    </DropdownMenuItem>
                                    
                                    {isPastWkLocked && (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuLabel>Permissions</DropdownMenuLabel>
                                            <DropdownMenuItem 
                                                onClick={() => setIsPermissionDialogOpen(true)}
                                                className="gap-2 py-3 text-destructive focus:text-destructive"
                                            >
                                                <Lock className="w-4 h-4" />
                                                Request Week Unlock
                                            </DropdownMenuItem>
                                        </>
                                    )}
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
                <DialogContent className="sm:max-w-lg p-0 border-none overflow-hidden">
                    <DialogHeader className="p-6 pb-0">
                        <div className="flex justify-between items-start">
                            <div>
                                <DialogTitle className="text-2xl font-headline font-black">Add Visit Plans</DialogTitle>
                                <DialogDescription>Search and select doctors for {selectedDate ? format(selectedDate, "PPP") : ""}.</DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="p-6 space-y-5">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            <Input 
                                placeholder="Search by name, specialty, or location..." 
                                value={doctorFilter} 
                                onChange={(e) => setDoctorFilter(e.target.value)} 
                                className="pl-12 h-12 text-lg rounded-xl focus-visible:ring-primary" 
                                autoFocus
                            />
                        </div>

                        {/* Enlarged Category Progress Bar */}
                        <div className="flex items-center justify-center flex-wrap gap-x-6 gap-y-2 py-4 px-2 border-2 border-primary/10 rounded-2xl bg-primary/5 shadow-inner">
                            {(Object.keys(categoryProgress) as Array<keyof typeof categoryProgress>).map(freq => (
                                <div key={freq} className="flex flex-col items-center">
                                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1">{freq}</span>
                                    <span className="text-lg font-black text-primary tabular-nums leading-none">
                                        {categoryProgress[freq].covered}/{categoryProgress[freq].total}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <ScrollArea className="h-[350px] border rounded-xl p-2 bg-muted/10">
                            <div className="space-y-2">
                                {filteredDoctors.length > 0 ? (
                                    filteredDoctors.map(doctor => {
                                        const doctorName = `${doctor.firstName} ${doctor.lastName}`.toLowerCase();
                                        const visitCount = visitCountsThisMonth[doctorName] || 0;
                                        const target = parseInt(doctor.frequency.replace('x', ''), 10);
                                        const balance = Math.max(0, target - visitCount);
                                        const isPlanned = selectedDayPlans.some(p => p.doctorId === doctor.id);

                                        return (
                                            <div 
                                                key={doctor.id} 
                                                className={cn(
                                                    "flex items-center justify-between p-3 rounded-xl border transition-all hover:bg-muted/50", 
                                                    isPlanned ? "bg-muted/20 opacity-60" : "bg-card shadow-sm cursor-pointer border-border/50"
                                                )}
                                                onClick={() => {
                                                    if (!isPlanned) {
                                                        const isSelected = selectedDoctorIdsForPlan.includes(doctor.id);
                                                        if (isSelected) setSelectedDoctorIdsForPlan(prev => prev.filter(id => id !== doctor.id));
                                                        else setSelectedDoctorIdsForPlan(prev => [...prev, doctor.id]);
                                                    }
                                                }}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <Checkbox 
                                                        className="h-6 w-6 rounded-md"
                                                        checked={selectedDoctorIdsForPlan.includes(doctor.id)}
                                                        disabled={isPlanned}
                                                        onCheckedChange={() => {}} // Handled by div click
                                                    />
                                                    <div>
                                                        <p className="font-bold text-lg leading-tight">{doctor.firstName} {doctor.lastName}</p>
                                                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">
                                                            {doctor.municipality} • {doctor.specialty} • Target: {doctor.frequency}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Badge variant={isPlanned ? "outline" : "secondary"} className="text-[10px] font-black h-6">
                                                    {isPlanned ? 'SCHEDULED' : `Remaining Visits: ${balance}`}
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
                    <DialogFooter className="p-6 pt-0">
                        <Button 
                            className="w-full h-14 text-xl font-black rounded-xl shadow-lg" 
                            onClick={handleAddSelectedPlans} 
                            disabled={selectedDoctorIdsForPlan.length === 0}
                        >
                            Add {selectedDoctorIdsForPlan.length} to Schedule
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
                isOpen={isPermissionDialogOpen}
                onOpenChange={setIsPermissionDialogOpen}
                onConfirm={handlePermissionRequest}
                weekStartDate={startOfWeek(selectedDate, { weekStartsOn: 1})}
            />}
        </div>
    );
}
