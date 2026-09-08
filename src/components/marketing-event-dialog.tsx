
'use client';

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
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
import { CalendarIcon, Loader2, Save } from "lucide-react"
import { cn } from "@/lib/utils"

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

type MarketingEventDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (data: Omit<MarketingEvent, 'id' | 'userId'>) => Promise<void>;
  doctors: Doctor[];
  event?: MarketingEvent;
}

export function MarketingEventDialog({ isOpen, onOpenChange, onSave, doctors, event }: MarketingEventDialogProps) {
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
    if (isOpen) {
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
    }
  }, [event, isOpen, form]);

  const handleSelectDoctor = (doctor: Doctor) => {
    form.setValue("doctorId", doctor.id);
    form.setValue("doctorFirstName", doctor.firstName);
    form.setValue("doctorLastName", doctor.lastName);
    setAutocompleteValue(`${doctor.firstName} ${doctor.lastName}`);
  };

  const onSubmit = async (values: z.infer<typeof eventSchema>) => {
    setIsSubmitting(true);
    try {
      await onSave({
        ...values,
        eventDate: values.eventDate.toISOString(),
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl text-primary">{event ? 'Edit Activity' : 'Add New Activity'}</DialogTitle>
          <DialogDescription>Log marketing activities and professional meetings.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-2">
            <div className="space-y-4 bg-muted/30 p-4 rounded-xl border-2">
                <FormField
                    control={form.control}
                    name="isListed"
                    render={({ field }) => (
                    <FormItem className="space-y-3">
                        <FormLabel className="font-headline text-xs uppercase tracking-widest text-muted-foreground">Doctor Masterlist Status</FormLabel>
                        <FormControl>
                        <RadioGroup
                            onValueChange={(v) => {
                                field.onChange(v === "true");
                                form.setValue("doctorId", "");
                                form.setValue("doctorFirstName", "");
                                form.setValue("doctorLastName", "");
                                setAutocompleteValue("");
                            }}
                            defaultValue={field.value ? "true" : "false"}
                            className="flex gap-4"
                        >
                            <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl><RadioGroupItem value="true" /></FormControl>
                                <FormLabel className="font-bold cursor-pointer">Listed on Masterlist</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl><RadioGroupItem value="false" /></FormControl>
                                <FormLabel className="font-bold cursor-pointer">Not Listed</FormLabel>
                            </FormItem>
                        </RadioGroup>
                        </FormControl>
                    </FormItem>
                    )}
                />

                {isListed ? (
                    <div className="space-y-2">
                        <FormLabel className="font-headline">Select Registered Doctor</FormLabel>
                        <Autocomplete 
                            doctors={doctors} 
                            value={autocompleteValue} 
                            onChange={setAutocompleteValue} 
                            onSelect={handleSelectDoctor}
                            placeholder="Search by name, specialty, or clinic..."
                        />
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-300">
                        <FormField
                            control={form.control}
                            name="doctorFirstName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-headline text-xs">First Name</FormLabel>
                                    <FormControl><Input {...field} placeholder="e.g. Maria" /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="doctorLastName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-headline text-xs">Last Name</FormLabel>
                                    <FormControl><Input {...field} placeholder="e.g. Cruz" /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 gap-4">
                <FormField
                    control={form.control}
                    name="eventName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="font-headline">Activity Name / Theme</FormLabel>
                            <FormControl><Input {...field} placeholder="e.g. Clinical Update 2024" /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="eventType"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel className="font-headline">Activity Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
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
                            <FormLabel className="font-headline mb-1.5">Date of Activity</FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                <FormControl>
                                    <Button
                                    variant={"outline"}
                                    className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                    >
                                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
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

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="venue"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="font-headline">Venue</FormLabel>
                                <FormControl><Input {...field} placeholder="e.g. Hotel Ballroom" /></FormControl>
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
                                <FormControl><Input type="number" {...field} /></FormControl>
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
                        <FormLabel className="font-headline">Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
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
                            <FormLabel className="font-headline">Additional Remarks</FormLabel>
                            <FormControl><Textarea {...field} rows={3} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            <DialogFooter className="pt-4 border-t">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="font-headline shadow-lg">
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {event ? 'Update Activity' : 'Log Activity'}
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
