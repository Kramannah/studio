

"use client"

import type { Doctor, Plan, NonCallDay, CoverageEntry, PlanningPermissionRequest } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isSameDay, isToday, isThisMonth, startOfToday, isBefore, isValid, isSameWeek, startOfWeek, endOfWeek, isAfter } from "date-fns";
import { useState, useMemo, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { PlusCircle, CalendarOff, Search, Clock, CheckCircle, XCircle, ShieldQuestion, Lock, Unlock } from "lucide-react";
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
        const plannedDate = parseISO(plan.plannedDate);
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
        
        // Always allow planning for future weeks or the current week
        if (!isBefore(weekStartOfSelected, weekStartOfToday)) {
            return true;
        }
        
        // For past weeks, only allow if approved
        if (currentWeekRequest?.status === 'approved') {
            return true;
        }

        return false;

    }, [selectedDate, currentWeekRequest]);
    

    const showRequestButton = useMemo(() => {
        if (readOnly || !selectedDate || !onPermissionRequest) return false;

        const weekStartOfSelected = startOfWeek(selectedDate, { weekStartsOn: 1 });
        const weekStartOfToday = startOfWeek(startOfToday(), { weekStartsOn: 1 });

        // Show if it's a past week and no approved/pending request exists
        if (isBefore(weekStartOfSelected, weekStartOfToday)) {
            return !currentWeekRequest || currentWeekRequest.status === 'rejected';
        }

        return false;

    }, [readOnly, selectedDate, currentWeekRequest, onPermissionRequest]);


    const handlePermissionRequest = async (reason: string) => {
        if(selectedDate && onPermissionRequest) {
            const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
            return await onPermissionRequest(weekStart, reason);
        }
        return false;
    };

    if (doctors.length === 0 && !readOnly) {
        return (
            <Card>
                <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground">You must add doctors to your masterlist before you can plan visits.</p>
                </CardContent>
            </Card>
        );
    }
    
    const isAddVisitDisabled = readOnly || !canPlanPlannedCalls;

    const getAddVisitTitle = () => {
        if (readOnly) return "This is a read-only view.";
        if (!canPlanPlannedCalls) return "Planning for this week is locked.";
        return "Add a new visit";
    }

    const getAddNonCallTitle = () => {
        if (readOnly) return "This is a read-only view.";
        return "Log a non-call day";
    }


    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Call Planning Calendar</CardTitle>
                <CardDescription>Plan your upcoming doctor visits. Select a date to view or add plans.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-8">
                <div className="space-y-4">
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
                            planned: { 
                                border: '2px solid hsl(var(--accent))',
                                borderRadius: 'var(--radius)',
                            },
                             nonCall: {
                                backgroundColor: 'hsl(var(--destructive) / 0.2)',
                                color: 'hsl(var(--destructive-foreground) / 0.8)',
                            }
                        }}
                        components={{
                            DayContent: ({ date, activeModifiers }) => {
                                const dateString = format(date, 'yyyy-MM-dd');
                                const count = plansByDate[dateString]?.length;
                                return (
                                    <div className="relative flex items-center justify-center w-full h-full">
                                        {date.getDate()}
                                        {count && !activeModifiers.nonCall && (
                                            <Badge variant="secondary" className="absolute w-5 h-5 p-0 -top-1 -right-1 justify-center">{count}</Badge>
                                        )}
                                    </div>
                                );
                            },
                        }}
                        className="w-full p-4 mx-auto border rounded-md sm:w-auto"
                    />
                </div>
                <div>
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                            <h3 className="text-xl font-semibold font-headline">
                                Plans for: {selectedDate ? format(selectedDate, "PPP") : "No date selected"}
                            </h3>
                            {selectedDate && (
                                showRequestButton ? (
                                    <Button variant="destructive" className="capitalize" onClick={() => setIsPermissionDialogOpen(true)}>
                                        <Lock className="w-3 h-3 mr-1.5" />
                                        Locked (Request Unlock)
                                    </Button>
                                ) : (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <Badge variant={canPlanPlannedCalls ? 'secondary' : 'destructive'} className="capitalize">
                                                    {canPlanPlannedCalls ? 
                                                        <><Unlock className="w-3 h-3 mr-1.5" /> Unlocked</> : 
                                                        <><Lock className="w-3 h-3 mr-1.5" /> Locked</>
                                                    }
                                                    {currentWeekRequest && ` (${currentWeekRequest.status})`}
                                                </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>
                                                    {canPlanPlannedCalls 
                                                        ? 'This week is open for planning.' 
                                                        : currentWeekRequest?.status === 'pending'
                                                        ? 'Unlock request is pending approval.'
                                                        : 'Planning for this past week is locked.'
                                                    }
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                )
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button 
                                variant="outline" 
                                onClick={() => setIsNonCallDialogOpen(true)}
                                disabled={readOnly}
                                title={getAddNonCallTitle()}
                            >
                                <CalendarOff className="mr-2"/>
                                Add Non-Call Day
                            </Button>
                            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button disabled={isAddVisitDisabled} title={getAddVisitTitle()}>
                                        <PlusCircle className="mr-2"/>
                                        Add Visit
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[80vw] max-w-[60rem]">
                                    <div className="grid gap-4">
                                        <div className="space-y-2">
                                            <h4 className="font-medium leading-none">Add Doctor to Plan</h4>
                                            <p className="text-sm text-muted-foreground">
                                                Select doctors to add to the visit plan for {selectedDate ? format(selectedDate, "PPP") : ""}.
                                            </p>
                                        </div>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                            <Input
                                                placeholder="Search doctors to add to plan..."
                                                value={doctorFilter}
                                                onChange={(e) => setDoctorFilter(e.target.value)}
                                                className="pl-10"
                                            />
                                        </div>
                                        <ScrollArea className="h-72">
                                            <TooltipProvider>
                                                <div className="border rounded-md">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead className="w-12">
                                                                <Checkbox 
                                                                    checked={selectedDoctorIdsForPlan.length === filteredDoctors.length && filteredDoctors.length > 0}
                                                                    onCheckedChange={(checked) => {
                                                                        if (checked) {
                                                                            setSelectedDoctorIdsForPlan(filteredDoctors.map(d => d.id));
                                                                        } else {
                                                                            setSelectedDoctorIdsForPlan([]);
                                                                        }
                                                                    }}
                                                                />
                                                            </TableHead>
                                                            <TableHead>Doctor</TableHead>
                                                            <TableHead>Location</TableHead>
                                                            <TableHead className="text-center">Target</TableHead>
                                                            <TableHead className="text-center">Balance</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {filteredDoctors.length > 0 ? (
                                                            filteredDoctors.map(doctor => {
                                                                const doctorName = `${doctor.firstName} ${doctor.lastName}`.toLowerCase();
                                                                const visitCount = visitCountsThisMonth[doctorName] || 0;
                                                                const targetCount = parseInt(doctor.frequency.replace('x', ''), 10);
                                                                const balance = Math.max(0, targetCount - visitCount);
                                                                const isCompleted = balance === 0;
                                                                const isAlreadyPlanned = selectedDayPlans.some(p => p.doctorId === doctor.id);

                                                                return (
                                                                    <TableRow 
                                                                        key={doctor.id} 
                                                                        className={cn(isCompleted && "bg-primary/10", isAlreadyPlanned && "bg-muted/50 opacity-60")}
                                                                        data-selected={selectedDoctorIdsForPlan.includes(doctor.id)}
                                                                    >
                                                                        <TableCell>
                                                                            <Checkbox 
                                                                                checked={selectedDoctorIdsForPlan.includes(doctor.id)}
                                                                                onCheckedChange={(checked) => {
                                                                                    if (checked) {
                                                                                        setSelectedDoctorIdsForPlan(prev => [...prev, doctor.id]);
                                                                                    } else {
                                                                                        setSelectedDoctorIdsForPlan(prev => prev.filter(id => id !== doctor.id));
                                                                                    }
                                                                                }}
                                                                                disabled={isAlreadyPlanned}
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell className="font-medium">{doctor.firstName} {doctor.lastName}</TableCell>
                                                                        <TableCell>
                                                                            <div className="flex flex-col">
                                                                                <span>{doctor.municipality}, {doctor.province}</span>
                                                                                <span className="text-xs text-muted-foreground">{doctor.placeOfPractice}</span>
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell className="text-center">{doctor.frequency}</TableCell>
                                                                        <TableCell className="text-center">{isAlreadyPlanned ? 'Planned' : balance}</TableCell>
                                                                    </TableRow>
                                                                )
                                                            })
                                                        ) : (
                                                            <TableRow>
                                                                <TableCell colSpan={5} className="h-24 text-center">
                                                                    No doctors found.
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                                </div>
                                            </TooltipProvider>
                                        </ScrollArea>
                                        <div className="flex justify-end">
                                            <Button
                                                onClick={handleAddSelectedPlans}
                                                disabled={selectedDoctorIdsForPlan.length === 0}
                                            >
                                                Add Selected to Plan ({selectedDoctorIdsForPlan.length})
                                            </Button>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                     <div className="border rounded-md">
                        {selectedDayNonCallEntry && (
                             <div className="flex items-center justify-between p-4 border-b">
                                <div className="flex flex-col">
                                    <h4 className="font-semibold">{selectedDayNonCallEntry.reason}</h4>
                                    <p className="text-sm text-muted-foreground">{dayTypeLabels[selectedDayNonCallEntry.dayType]}: {selectedDayNonCallEntry.remarks}</p>
                                </div>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Badge variant={selectedDayNonCallEntry.status === 'approved' ? 'secondary' : selectedDayNonCallEntry.status === 'rejected' ? 'destructive' : 'outline'} className="capitalize">
                                                <StatusIcon status={selectedDayNonCallEntry.status} />
                                                <span className="ml-2">{selectedDayNonCallEntry.status}</span>
                                            </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Your non-call day request is {selectedDayNonCallEntry.status}.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        )}
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Doctor</TableHead>
                                    <TableHead>Location</TableHead>
                                    <TableHead>Call Type</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selectedDayPlans.length > 0 ? (
                                    selectedDayPlans.map((plan) => {
                                        const doctor = doctors.find(d => d.id === plan.doctorId);
                                        if (!doctor) return null;

                                        const dayEntries = selectedDate ? entriesByDate[format(selectedDate, 'yyyy-MM-dd')] || [] : [];
                                        const isCovered = dayEntries.some(entry => 
                                            entry.firstName?.toLowerCase() === plan.doctorFirstName.toLowerCase() &&
                                            entry.lastName?.toLowerCase() === plan.doctorLastName.toLowerCase()
                                        );
                                        
                                        const canLogCall = selectedDate && isToday(selectedDate);
                                        
                                        const today = startOfToday();
                                        const planDate = parseISO(plan.plannedDate);
                                        const endOfCurrentWeek = endOfWeek(today, { weekStartsOn: 1 });
                                        const isFuturePlan = isValid(planDate) ? isAfter(planDate, endOfCurrentWeek) : false;
                                        const isRemovalDisabled = readOnly || !isFuturePlan;

                                        return (
                                        <TableRow key={plan.id}>
                                            <TableCell>
                                                <Button 
                                                    variant="link" 
                                                    className="p-0 h-auto font-medium text-left"
                                                    onClick={() => handleLogCallClick(plan)}
                                                    disabled={readOnly || isCovered || !canLogCall}
                                                    title={
                                                        readOnly ? "This is a read-only view." :
                                                        isCovered ? "Already covered today" :
                                                        !canLogCall ? "Coverage can only be logged for the current day" : `Log call for ${plan.doctorFirstName} ${plan.doctorLastName}`
                                                    }
                                                >
                                                    {plan.doctorFirstName} {plan.doctorLastName}
                                                </Button>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span>{doctor.municipality}</span>
                                                    <span className="text-xs text-muted-foreground">{doctor.province}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={plan.callType === 'planned' ? 'secondary' : 'outline'} className="capitalize">{plan.callType}</Badge>
                                            </TableCell>
                                             <TableCell>
                                                {isCovered ? (
                                                    <Badge variant="secondary" className="text-primary">Covered</Badge>
                                                ) : (
                                                    <Badge variant="outline">Not Yet Covered</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                 {!readOnly && (
                                                     <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        onClick={() => onRemovePlan(plan.id)}
                                                        disabled={isRemovalDisabled}
                                                        title={isRemovalDisabled ? "Cannot delete plans for current or past weeks." : "Remove plan"}
                                                     >
                                                         <XCircle size={16} className="text-destructive"/>
                                                     </Button>
                                                 )}
                                            </TableCell>
                                        </TableRow>
                                    )})
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            {selectedDate ? "No visits planned for this date." : "Select a date to plan visits."}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
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

    

    



    