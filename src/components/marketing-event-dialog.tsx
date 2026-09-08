
'use client';

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Autocomplete } from "./autocomplete"
import { format, parseISO, isValid } from "date-fns"
import type { MarketingEvent, Doctor } from "@/lib/types"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Loader2, Save, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card"
import { ScrollArea } from "./ui/scroll-area"

const eventSchema = z.object({
  isListed: z.boolean(),
  doctorId: z.string().optional(),
  doctorFirstName: z.string().min(1, "First Name is required"),
  doctorLastName: z.string().min(1, "Last Name is required"),
  eventName: z.string().min(1, "Activity Name is required"),
  eventType: z.enum(['RTD', 'Convention', 'Booth Activity', 'Product Launch', 'Medical Society Meeting']),
  eventDate: z.date(),
  venue: z.string().optional(),
  estimatedCost: z.coerce.number().optional(),
  status: z.enum(['planned', 'completed', 'cancelled']),
  remarks: z.string().optional(),
});

type MarketingEventFormProps = {
  onSave: (data: Omit<MarketingEvent, 'id' | 'userId'>) => Promise<void>;
  onCancel: () => void;
  doctors: Doctor[];
  event?: MarketingEvent;
}

export function MarketingEventForm({ onSave, onCancel, doctors, event }: MarketingEventFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autocompleteValue, setAutocompleteValue] = useState("");

  const form = useForm<z.infer<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      isListed: true,
      doctorId: "",
      doctorFirstName: "",
      doctorLastName: "",
      eventName: "",
      eventType: "RTD",
      eventDate: new Date(),
      venue: "",
      estimatedCost: 0,
      status: "planned",
      remarks: "",
    },
  });

  const isListed = form.watch("isListed");

  useEffect(() => {
    if (event) {
      form.reset({
        ...event,
        eventDate: event.eventDate ? parseISO(event.eventDate) : new Date(),
      });
      setAutocompleteValue(event.isListed ? `${event.doctorFirstName} ${event.doctorLastName}` : "");
    } else {
      form.reset({
        isListed: true,
        doctorId: "",
        doctorFirstName: "",
        doctorLastName: "",
        eventName: "",
        eventType: "RTD",
        eventDate: new Date(),
        venue: "",
        estimatedCost: 0,
        status: "planned",
        remarks: "",
      });
      setAutocompleteValue("");
    }
  }, [event, form]);

  const handleSelectDoctor = useCallback((doctor: Doctor) => {
    form.setValue("doctorId", doctor.id, { shouldValidate: true, shouldDirty: true });
    form.setValue("doctorFirstName", doctor.firstName, { shouldValidate: true, shouldDirty: true });
    form.setValue("doctorLastName", doctor.lastName, { shouldValidate: true, shouldDirty: true });
    setAutocompleteValue(`${doctor.firstName} ${doctor.lastName}`);
  }, [form]);

  const onSubmit = async (values: z.infer<typeof eventSchema>) => {
    setIsSubmitting(true);
    try {
      await onSave({
        ...values,
        eventDate: values.eventDate.toISOString(),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-2 shadow-xl animate-in slide-in-from-right-4 duration-300">
      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20">
        <div>
          <CardTitle className="font-headline text-xl text-primary">{event ? 'Modify Activity' : 'Log New Activity'}</CardTitle>
          <CardDescription>Enter details for clinical updates, meetings, or conventions.</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onCancel} className="rounded-full">
            <X className="w-5 h-5" />
        </Button>
      </CardHeader>
      <CardContent className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="space-y-6">
                <div className="space-y-4 bg-muted/30 p-5 rounded-2xl border-2 border-dashed">
                    <FormField
                        control={form.control}
                        name="isListed"
                        render={({ field }) => (
                        <FormItem className="space-y-3">
                            <FormLabel className="font-headline text-xs uppercase tracking-widest text-muted-foreground">Provider Selection</FormLabel>
                            <FormControl>
                            <RadioGroup
                                onValueChange={(v) => {
                                    const listed = v === "true";
                                    field.onChange(listed);
                                    form.setValue("doctorId", "");
                                    form.setValue("doctorFirstName", "");
                                    form.setValue("doctorLastName", "");
                                    setAutocompleteValue("");
                                }}
                                value={field.value ? "true" : "false"}
                                className="flex gap-4"
                            >
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl><RadioGroupItem value="true" /></FormControl>
                                    <FormLabel className="font-bold cursor-pointer">In Masterlist</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl><RadioGroupItem value="false" /></FormControl>
                                    <FormLabel className="font-bold cursor-pointer">Guest / Not Listed</FormLabel>
                                </FormItem>
                            </RadioGroup>
                            </FormControl>
                        </FormItem>
                        )}
                    />

                    {isListed ? (
                        <div className="space-y-2">
                            <FormLabel className="font-headline text-xs uppercase text-primary">Registered Medical Provider</FormLabel>
                            <Autocomplete 
                                doctors={doctors} 
                                value={autocompleteValue} 
                                onChange={setAutocompleteValue} 
                                onSelect={handleSelectDoctor}
                                placeholder="Search by name or clinic..."
                            />
                            <FormMessage />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                            <FormField
                                control={form.control}
                                name="doctorFirstName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-headline text-xs text-primary">First Name</FormLabel>
                                        <FormControl><Input {...field} placeholder="e.g. Maria" className="h-11 border-2 rounded-xl" /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="doctorLastName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-headline text-xs text-primary">Last Name</FormLabel>
                                        <FormControl><Input {...field} placeholder="e.g. Cruz" className="h-11 border-2 rounded-xl" /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-6">
                    <FormField
                        control={form.control}
                        name="eventName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="font-headline">Activity Name / Event Theme</FormLabel>
                                <FormControl><Input {...field} placeholder="e.g. 1st Quarter RTD Update" className="h-11 border-2 rounded-xl" /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                            control={form.control}
                            name="eventType"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel className="font-headline">Classification</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                    <SelectTrigger className="h-11 border-2 rounded-xl"><SelectValue placeholder="Select type" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="RTD">RTD</SelectItem>
                                    <SelectItem value="Convention">Convention</SelectItem>
                                    <SelectItem value="Booth Activity">Booth Activity</SelectItem>
                                    <SelectItem value="Product Launch">Product Launch</SelectItem>
                                    <SelectItem value="Medical Society Meeting">Medical Society Meeting</SelectItem>
                                </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="eventDate"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                <FormLabel className="font-headline mb-2">Event Date</FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                        variant={"outline"}
                                        className={cn("w-full h-11 pl-3 text-left font-normal border-2 rounded-xl", !field.value && "text-muted-foreground")}
                                        >
                                        {field.value && isValid(field.value) ? format(field.value, "PPP") : <span>Pick a date</span>}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={field.value}
                                        onSelect={field.onChange}
                                        initialFocus
                                    />
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                            control={form.control}
                            name="venue"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-headline">Venue / Location</FormLabel>
                                    <FormControl><Input {...field} placeholder="e.g. Grand Hotel" className="h-11 border-2 rounded-xl" /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="estimatedCost"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-headline">Estimated Cost (₱)</FormLabel>
                                    <FormControl><Input type="number" {...field} className="h-11 border-2 rounded-xl font-mono" /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel className="font-headline">Tracking Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                                <SelectTrigger className="h-11 border-2 rounded-xl"><SelectValue placeholder="Select status" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="planned">Planned</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="remarks"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="font-headline">Notes & Remarks</FormLabel>
                                <FormControl><Textarea {...field} rows={4} className="border-2 rounded-xl resize-none" placeholder="Any additional context or outcomes..." /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t">
                <Button 
                    type="submit" 
                    disabled={isSubmitting} 
                    className="flex-1 h-14 font-headline text-lg rounded-2xl shadow-xl transition-all active:scale-[0.98] font-black"
                >
                    {isSubmitting ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : <Save className="mr-2 h-6 w-6" />}
                    {event ? 'Confirm Changes' : 'Save Activity'}
                </Button>
                <Button 
                    type="button" 
                    variant="outline" 
                    onClick={onCancel} 
                    disabled={isSubmitting}
                    className="h-14 font-headline rounded-2xl border-2 px-8"
                >
                    Cancel
                </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
