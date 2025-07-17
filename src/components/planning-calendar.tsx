
"use client"

import type { Doctor, Plan, NonCallDay } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isSameDay, isToday } from "date-fns";
import { useState, useMemo } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { PlusCircle, Trash2, CalendarOff } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "./ui/input";
import { NonCallDayDialog } from "./non-call-day-dialog";
import * as z from "zod"

type PlanningCalendarProps = {
  doctors: Doctor[];
  plans: Plan[];
  onAddPlan: (doctor: Doctor, plannedDate: Date) => void;
  onRemovePlan: (planId: string) => void;
  onLogCall: (doctor: Doctor) => void;
  nonCallDays: NonCallDay[];
  onAddNonCallDay: (entry: Omit<NonCallDay, 'id'>) => void;
};


export function PlanningCalendar({ doctors, plans, onAddPlan, onRemovePlan, onLogCall, nonCallDays, onAddNonCallDay }: PlanningCalendarProps) {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const [isNonCallDialogOpen, setIsNonCallDialogOpen] = useState(false);
    const [doctorFilter, setDoctorFilter] = useState("");

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
            `${d.firstName} ${d.lastName}`.toLowerCase().includes(doctorFilter.toLowerCase())
        );
    }, [doctors, doctorFilter]);

    const handleAddPlan = (doctor: Doctor) => {
        if(selectedDate) {
            onAddPlan(doctor, selectedDate);
            setIsPopoverOpen(false);
            setDoctorFilter("");
        }
    }
    
    const handleSaveNonCallDay = (data: {reason: string, remarks?: string}) => {
        if(selectedDate) {
            onAddNonCallDay({
                date: selectedDate.toISOString(),
                reason: data.reason,
                remarks: data.remarks || "",
            });
        }
    };
    
    const handleLogCallClick = (plan: Plan) => {
        const doctor = doctors.find(d => d.id === plan.doctorId);
        if (doctor) {
            onLogCall(doctor);
        }
    }

    if (doctors.length === 0) {
        return (
            <Card>
                <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground">You must add doctors to your masterlist before you can plan visits.</p>
                </CardContent>
            </Card>
        );
    }

    const isAddVisitDisabled = !selectedDate || !!selectedDayNonCallEntry;
    const isAddNonCallDisabled = !selectedDate || selectedDayPlans.length > 0 || !!selectedDayNonCallEntry;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Visit Planning Calendar</CardTitle>
                <CardDescription>Plan your upcoming doctor visits. Select a date to view or add plans.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <div>
                     <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        modifiers={{ 
                            planned: plannedDays,
                            nonCall: nonCallCalendarDays,
                        }}
                        modifiersStyles={{
                            planned: { 
                                border: '2px solid hsl(var(--accent))',
                                borderRadius: 'var(--radius)',
                            },
                            nonCall: {
                                textDecoration: 'line-through',
                                color: 'hsl(var(--destructive-foreground))'
                            }
                        }}
                        components={{
                            DayContent: ({ date }) => {
                                const dateString = format(date, 'yyyy-MM-dd');
                                const count = plansByDate[dateString]?.length;
                                return (
                                    <div className="relative flex items-center justify-center w-full h-full">
                                        {date.getDate()}
                                        {count && (
                                            <Badge variant="secondary" className="absolute -top-1 -right-1 h-5 w-5 justify-center p-0">{count}</Badge>
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
                                title={isAddNonCallDisabled ? "Cannot add non-call day on a date with planned visits or an existing leave." : "Log a non-call day"}
                            >
                                <CalendarOff className="mr-2"/>
                                Add Non-Call Day
                            </Button>
                            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button disabled={isAddVisitDisabled}>
                                        <PlusCircle className="mr-2"/>
                                        Add Visit
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80">
                                    <div className="grid gap-4">
                                        <h4 className="font-medium leading-none">Add Doctor to Plan</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Select a doctor to add to the visit plan for {selectedDate ? format(selectedDate, "PPP") : ""}.
                                        </p>
                                        <Input
                                            placeholder="Search doctors..."
                                            value={doctorFilter}
                                            onChange={(e) => setDoctorFilter(e.target.value)}
                                            className="mt-2"
                                        />
                                        <ScrollArea className="h-48">
                                            <div className="flex flex-col gap-2 p-1">
                                            {filteredDoctors.map(doctor => (
                                                <div key={doctor.id} className="flex items-center justify-between p-2 rounded-md hover:bg-accent">
                                                    <span>{doctor.firstName} {doctor.lastName}</span>
                                                    <Button size="sm" variant="ghost" onClick={() => handleAddPlan(doctor)}>
                                                        <PlusCircle size={16}/>
                                                    </Button>
                                                </div>
                                            ))}
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
                                <p className="text-sm text-muted-foreground">{selectedDayNonCallEntry.remarks}</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Provider</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {selectedDayPlans.length > 0 ? (
                                        selectedDayPlans.map((plan) => (
                                            <TableRow key={plan.id}>
                                                <TableCell>
                                                    <Button 
                                                        variant="link" 
                                                        className="p-0 h-auto font-medium"
                                                        onClick={() => handleLogCallClick(plan)}
                                                        disabled={!selectedDate || !isToday(selectedDate)}
                                                        title={!selectedDate || !isToday(selectedDate) ? "Coverage can only be logged for today" : `Log call for ${plan.doctorFirstName} ${plan.doctorLastName}`}
                                                    >
                                                        {plan.doctorFirstName} {plan.doctorLastName}
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon" onClick={() => onRemovePlan(plan.id)}>
                                                        <Trash2 className="w-4 h-4 text-destructive"/>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="h-24 text-center">
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
