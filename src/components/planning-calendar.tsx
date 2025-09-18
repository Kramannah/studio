
"use client"

import type { Doctor, Plan, NonCallDay, CoverageEntry } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isSameDay, isToday, isThisMonth, startOfToday, isBefore } from "date-fns";
import { useState, useMemo } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { PlusCircle, CalendarOff, Search } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "./ui/input";
import { NonCallDayDialog } from "./non-call-day-dialog";
import { cn } from "@/lib/utils";

type PlanningCalendarProps = {
  doctors: Doctor[];
  plans: Plan[];
  entries: CoverageEntry[];
  onAddPlan: (doctor: Doctor, plannedDate: Date) => void;
  onRemovePlan: (planId: string) => void;
  onLogCall: (doctor: Doctor) => void;
  nonCallDays: NonCallDay[];
  onAddNonCallDay: (entry: Omit<NonCallDay, 'id' | 'userId' | 'date'>) => void;
  readOnly?: boolean;
};

const dayTypeLabels: Record<NonCallDay['dayType'], string> = {
    'wholeday': 'Whole Day',
    'halfday-am': 'AM',
    'halfday-pm': 'PM',
};


export function PlanningCalendar({ doctors, plans, entries, onAddPlan, onRemovePlan, onLogCall, nonCallDays, onAddNonCallDay, readOnly = false }: PlanningCalendarProps) {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const [isNonCallDialogOpen, setIsNonCallDialogOpen] = useState(false);
    const [doctorFilter, setDoctorFilter] = useState("");

    const visitCountsThisMonth = useMemo(() => {
        const thisMonthEntries = entries.filter(e => isThisMonth(parseISO(e.submittedAt)));
        return thisMonthEntries.reduce((acc, entry) => {
          const doctorName = `${entry.firstName} ${entry.lastName}`.toLowerCase();
          acc[doctorName] = (acc[doctorName] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
    }, [entries]);

    const plansByDate = useMemo(() => {
        return plans.reduce((acc, plan) => {
            const date = format(parseISO(plan.plannedDate), 'yyyy-MM-dd');
            if (!acc[date]) {
                acc[date] = [];
            }
            acc[date].push(plan);
            return acc;
        }, {} as Record<string, Plan[]>);
    }, [plans]);
    
    const nonCallDaysByDate = useMemo(() => {
        return nonCallDays.reduce((acc, entry) => {
            const date = format(parseISO(entry.date), 'yyyy-MM-dd');
            if (!acc[date]) {
                acc[date] = [];
            }
            acc[date].push(entry);
            return acc;
        }, {} as Record<string, NonCallDay[]>);
    }, [nonCallDays]);

    const selectedDayPlans = useMemo(() => {
        if (!selectedDate) return [];
        return plans.filter(plan => isSameDay(parseISO(plan.plannedDate), selectedDate));
    }, [plans, selectedDate]);

    const entriesByDate = useMemo(() => {
        return entries.reduce((acc, entry) => {
            const date = format(parseISO(entry.submittedAt), 'yyyy-MM-dd');
            if(!acc[date]){
                acc[date] = [];
            }
            acc[date].push(entry);
            return acc;
        }, {} as Record<string, CoverageEntry[]>);
    }, [entries]);
    
    const selectedDayNonCallEntry = useMemo(() => {
        if (!selectedDate) return undefined;
        return nonCallDays.find(entry => isSameDay(parseISO(entry.date), selectedDate));
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

    const handleAddPlan = (doctor: Doctor) => {
        if(selectedDate) {
            onAddPlan(doctor, selectedDate);
            setIsPopoverOpen(false);
            setDoctorFilter("");
        }
    }
    
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
        if (doctor) {
            onLogCall(doctor);
        }
    }

    const isDateInPast = selectedDate ? isBefore(selectedDate, startOfToday()) : false;

    if (doctors.length === 0 && !readOnly) {
        return (
            <Card>
                <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground">You must add doctors to your masterlist before you can plan visits.</p>
                </CardContent>
            </Card>
        );
    }

    const isAddVisitDisabled = !selectedDate || !!selectedDayNonCallEntry || isDateInPast || readOnly;
    const isAddNonCallDisabled = !selectedDate || selectedDayPlans.length > 0 || !!selectedDayNonCallEntry || readOnly;
    
    const getAddVisitTitle = () => {
        if (readOnly) return "This is a read-only view.";
        if (isDateInPast) return "Cannot add visits for past dates.";
        if (!!selectedDayNonCallEntry) return "Cannot add visit on a non-call day.";
        return "Add a new visit";
    }

    const getAddNonCallTitle = () => {
        if (readOnly) return "This is a read-only view.";
        if (selectedDayPlans.length > 0) return "Cannot log non-call day on a date with planned visits.";
        if (!!selectedDayNonCallEntry) return "A non-call day is already logged for this date.";
        return "Log a non-call day";
    }


    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Call Planning Calendar</CardTitle>
                <CardDescription>Plan your upcoming doctor visits. Select a date to view or add plans.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-8 lg:grid-cols-2">
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
                        className="w-full p-4 border rounded-md"
                    />
                </div>
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold font-headline">
                            Plans for: {selectedDate ? format(selectedDate, "PPP") : "No date selected"}
                        </h3>
                        <div className="flex gap-2">
                            <Button 
                                variant="outline" 
                                onClick={() => setIsNonCallDialogOpen(true)}
                                disabled={isAddNonCallDisabled}
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
                                                Select a doctor to add to the visit plan for {selectedDate ? format(selectedDate, "PPP") : ""}.
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
                                            <div className="border rounded-md">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Doctor</TableHead>
                                                        <TableHead>Location</TableHead>
                                                        <TableHead className="text-center">Target</TableHead>
                                                        <TableHead className="text-center">Balance</TableHead>
                                                        <TableHead className="text-right">Action</TableHead>
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

                                                            return (
                                                                <TableRow key={doctor.id} className={cn(isCompleted && "bg-primary/10")}>
                                                                    <TableCell className="font-medium">{doctor.firstName} {doctor.lastName}</TableCell>
                                                                    <TableCell>
                                                                        <div className="flex flex-col">
                                                                            <span>{doctor.municipality}, {doctor.province}</span>
                                                                            <span className="text-xs text-muted-foreground">{doctor.placeOfPractice}</span>
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="text-center">{doctor.frequency}</TableCell>
                                                                    <TableCell className="text-center">{balance}</TableCell>
                                                                    <TableCell className="text-right">
                                                                        <Button size="sm" variant="ghost" onClick={() => handleAddPlan(doctor)} title="Add to plan">
                                                                            <PlusCircle size={16}/>
                                                                        </Button>
                                                                    </TableCell>
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
                                        </ScrollArea>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                     <div className="border rounded-md">
                        {selectedDayNonCallEntry ? (
                            <div className="p-4 text-center">
                                <h4 className="font-semibold">{selectedDayNonCallEntry.reason}</h4>
                                <p className="text-sm text-muted-foreground">{dayTypeLabels[selectedDayNonCallEntry.dayType]}: {selectedDayNonCallEntry.remarks}</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Doctor</TableHead>
                                        <TableHead>Location</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="text-center">Target</TableHead>
                                        <TableHead className="text-center">Balance</TableHead>
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
                                                entry.firstName.toLowerCase() === plan.doctorFirstName.toLowerCase() &&
                                                entry.lastName.toLowerCase() === plan.doctorLastName.toLowerCase()
                                            );
                                            const isTodaySelected = selectedDate && isToday(selectedDate);
                                            
                                            const doctorName = `${doctor.firstName} ${doctor.lastName}`.toLowerCase();
                                            const visitCount = visitCountsThisMonth[doctorName] || 0;
                                            const targetCount = parseInt(doctor.frequency.replace('x', ''), 10);
                                            const balance = Math.max(0, targetCount - visitCount);

                                            return (
                                            <TableRow key={plan.id}>
                                                <TableCell>
                                                    <Button 
                                                        variant="link" 
                                                        className="p-0 h-auto font-medium text-left"
                                                        onClick={() => handleLogCallClick(plan)}
                                                        disabled={!isTodaySelected || isCovered || readOnly}
                                                        title={
                                                            readOnly ? "This is a read-only view." :
                                                            isCovered ? "Already covered today" :
                                                            !isTodaySelected ? "Coverage can only be logged for today" : `Log call for ${plan.doctorFirstName} ${plan.doctorLastName}`
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
                                                    <Badge variant={plan.callType === 'planned' ? 'default' : 'outline'} className="capitalize">{plan.callType}</Badge>
                                                </TableCell>
                                                 <TableCell className="text-center">{doctor.frequency}</TableCell>
                                                 <TableCell className="text-center">{balance}</TableCell>
                                                 <TableCell>
                                                    {isCovered ? (
                                                        <Badge variant="secondary" className="text-primary">Covered</Badge>
                                                    ) : (
                                                        <Badge variant="outline">Not Yet Covered</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {/* Action space, intentionally left empty */}
                                                </TableCell>
                                            </TableRow>
                                        )})
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-24 text-center">
                                                {selectedDate ? "No visits planned for this date." : "Select a date to plan visits."}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </div>
            </CardContent>
             {selectedDate && <NonCallDayDialog 
                isOpen={isNonCallDialogOpen}
                onOpenChange={setIsNonCallDialogOpen}
                onSave={handleSaveNonCallDay}
                selectedDate={selectedDate}
             />}
        </Card>
    );
}
