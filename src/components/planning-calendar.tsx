
"use client"

import type { Doctor, Plan } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isSameDay } from "date-fns";
import { useState, useMemo } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { PlusCircle, Trash2 } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "./ui/input";

type PlanningCalendarProps = {
  doctors: Doctor[];
  plans: Plan[];
  onAddPlan: (doctor: Doctor, plannedDate: Date) => void;
  onRemovePlan: (planId: string) => void;
};


export function PlanningCalendar({ doctors, plans, onAddPlan, onRemovePlan }: PlanningCalendarProps) {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
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

    const selectedDayPlans = useMemo(() => {
        if (!selectedDate) return [];
        return plans.filter(plan => isSameDay(parseISO(plan.plannedDate), selectedDate));
    }, [plans, selectedDate]);
    
    const plannedDays = useMemo(() => {
        return Object.keys(plansByDate).map(dateStr => parseISO(dateStr));
    }, [plansByDate]);

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

    if (doctors.length === 0) {
        return (
            <Card>
                <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground">You must add doctors to your masterlist before you can plan visits.</p>
                </CardContent>
            </Card>
        );
    }


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
                        modifiers={{ planned: plannedDays }}
                        modifiersStyles={{
                            planned: { 
                                border: '2px solid hsl(var(--accent))',
                                borderRadius: 'var(--radius)',
                            },
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
                        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button disabled={!selectedDate}>
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
                     <div className="border rounded-md">
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
                                            <TableCell className="font-medium">
                                                {plan.doctorFirstName} {plan.doctorLastName}
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
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
