
"use client"

import type { Doctor, Plan, NonCallDay, CoverageEntry, PlanningPermissionRequest } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isSameDay, isToday, isThisMonth, startOfToday, isBefore, isValid, isSameWeek, startOfWeek, endOfWeek, isAfter } from "date-fns";
import { useState, useMemo, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { PlusCircle, CalendarOff, Search, Clock, CheckCircle, XCircle, Lock, Unlock, List, Calendar as CalendarIcon } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const [isNonCallDialogOpen, setIsNonCallDialogOpen] = useState(false);
    const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false);
    const [doctorFilter, setDoctorFilter] = useState("");
    const [selectedDoctorIdsForPlan, setSelectedDoctorIdsForPlan] = useState<string[]>([]);

    const allEntries = useMemo(() => [...entries, ...offlineEntries], [entries, offlineEntries]);

    useEffect(() => {
        if (!isPopoverOpen) {
            setSelectedDoctorIdsForPlan([]);
            setDoctorFilter("");
        }
    }, [isPopoverOpen]);


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
            setIsPopoverOpen(false);
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
            <Button variant="destructive" size="sm" className="capitalize h-7 px-2 text-[10px]" onClick={() => setIsPermissionDialogOpen(true)}>
                <Lock className="w-3 h-3 mr-1.5" />
                Locked (Request Unlock)
            </Button>
        );
    }

    const PlanTable = ({ plansToRender }: { plansToRender: Plan[] }) => (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Doctor</TableHead>
                    <TableHead className="hidden md:table-cell">Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
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
                        <TableRow key={plan.id}>
                            <TableCell>
                                <Button 
                                    variant="link" 
                                    className="p-0 h-auto font-medium text-left text-sm"
                                    onClick={() => handleLogCallClick(plan)}
                                    disabled={isLogCallDisabled}
                                >
                                    {plan.doctorFirstName} {plan.doctorLastName}
                                </Button>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                                <span className="text-xs text-muted-foreground">{doctor.municipality}</span>
                            </TableCell>
                             <TableCell>
                                {isCovered ? (
                                    <Badge variant="secondary" className="text-primary text-[10px] h-5 px-1.5">Covered</Badge>
                                ) : (
                                    <Badge variant="outline" className="text-[10px] h-5 px-1.5">Planned</Badge>
                                )}
                            </TableCell>
                            <TableCell className="text-right">
                                 {!readOnly && (
                                     <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8"
                                        onClick={() => onRemovePlan(plan.id)}
                                        disabled={isRemovalDisabled}
                                     >
                                         <XCircle size={14} className="text-destructive"/>
                                     </Button>
                                 )}
                            </TableCell>
                        </TableRow>
                    )})
                ) : (
                    <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                            No visits planned for this day.
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    );

    if (doctors.length === 0 && !readOnly) {
        return (
            <Card>
                <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground">You must add doctors to your masterlist before you can plan visits.</p>
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0 pt-0">
                <div>
                    <CardTitle className="font-headline">Call Planning</CardTitle>
                    <CardDescription>Schedule and manage your doctor visits.</CardDescription>
                </div>
            </CardHeader>
            <CardContent className="px-0">
                <div className="flex flex-col lg:flex-row gap-6">
                    <div className="w-full lg:w-auto">
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
                                planned: { border: '2px solid hsl(var(--primary))' },
                                nonCall: { backgroundColor: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))' }
                            }}
                            components={{
                                DayContent: ({ date, activeModifiers }) => {
                                    const dateString = format(date, 'yyyy-MM-dd');
                                    const count = plansByDate[dateString]?.length;
                                    return (
                                        <div className="relative flex items-center justify-center w-full h-full">
                                            {date.getDate()}
                                            {count && !activeModifiers.nonCall && (
                                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                                                    {count}
                                                </span>
                                            )}
                                        </div>
                                    );
                                },
                            }}
                            className="w-full p-4 border rounded-md bg-card"
                        />
                    </div>
                    <div className="flex-1 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <h3 className="text-lg font-semibold font-headline">
                                    {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "No date selected"}
                                </h3>
                                {renderWeekStatus()}
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setIsNonCallDialogOpen(true)} disabled={readOnly || !canPlanPlannedCalls}>
                                    <CalendarOff className="w-4 h-4 mr-1.5" /> Leave
                                </Button>
                                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button size="sm" disabled={readOnly || !canPlanPlannedCalls}>
                                            <PlusCircle className="w-4 h-4 mr-1.5" /> Plan
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[90vw] max-w-md p-0" align="end">
                                        <div className="p-4 space-y-4">
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                <Input placeholder="Search masterlist..." value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} className="pl-9 h-9" />
                                            </div>
                                            <ScrollArea className="h-64">
                                                <div className="space-y-1">
                                                    {filteredDoctors.map(doctor => {
                                                        const doctorName = `${doctor.firstName} ${doctor.lastName}`.toLowerCase();
                                                        const visitCount = visitCountsThisMonth[doctorName] || 0;
                                                        const target = parseInt(doctor.frequency.replace('x', ''), 10);
                                                        const balance = Math.max(0, target - visitCount);
                                                        const isPlanned = selectedDayPlans.some(p => p.doctorId === doctor.id);

                                                        return (
                                                            <div key={doctor.id} className={cn("flex items-center justify-between p-2 rounded-md hover:bg-muted text-sm", isPlanned && "opacity-50")}>
                                                                <div className="flex items-center gap-3">
                                                                    <Checkbox 
                                                                        checked={selectedDoctorIdsForPlan.includes(doctor.id)}
                                                                        onCheckedChange={(checked) => {
                                                                            if (checked) setSelectedDoctorIdsForPlan(prev => [...prev, doctor.id]);
                                                                            else setSelectedDoctorIdsForPlan(prev => prev.filter(id => id !== doctor.id));
                                                                        }}
                                                                        disabled={isPlanned}
                                                                    />
                                                                    <div>
                                                                        <p className="font-medium">{doctor.firstName} {doctor.lastName}</p>
                                                                        <p className="text-[10px] text-muted-foreground">{doctor.municipality}, {doctor.province}</p>
                                                                    </div>
                                                                </div>
                                                                <Badge variant="secondary" className="text-[10px]">{isPlanned ? 'Planned' : `Bal: ${balance}`}</Badge>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </ScrollArea>
                                            <Button className="w-full" onClick={handleAddSelectedPlans} disabled={selectedDoctorIdsForPlan.length === 0}>
                                                Add {selectedDoctorIdsForPlan.length} to Schedule
                                            </Button>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        {selectedDayNonCallEntry && (
                                <div className="flex items-center justify-between p-3 border rounded-md bg-destructive/5">
                                <div>
                                    <p className="text-sm font-bold text-destructive">{selectedDayNonCallEntry.reason}</p>
                                    <p className="text-[10px] text-muted-foreground">{dayTypeLabels[selectedDayNonCallEntry.dayType]}: {selectedDayNonCallEntry.remarks}</p>
                                </div>
                                <Badge variant="outline" className="h-6 text-[10px] capitalize gap-1.5">
                                    <StatusIcon status={selectedDayNonCallEntry.status} /> {selectedDayNonCallEntry.status}
                                </Badge>
                            </div>
                        )}
                        <div className="border rounded-md bg-card">
                            <PlanTable plansToRender={selectedDayPlans} />
                        </div>
                    </div>
                </div>
            </CardContent>
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
        </Card>
    );
}
