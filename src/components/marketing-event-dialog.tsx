
'use client';

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format, parseISO, isValid } from "date-fns"
import { CalendarIcon, Loader2, Presentation } from "lucide-react"
import { cn } from "@/lib/utils"

const formSchema = z.object({
  eventName: z.string().min(1, "Event name is required"),
  eventType: z.enum(["RTD", "Convention", "Booth Activity", "Product Launch", "Medical Society Meeting"]),
  eventDate: z.date({ required_error: "Date is required" }),
  venue: z.string().optional(),
  estimatedCost: z.coerce.number().min(0).optional(),
  status: z.enum(["planned", "completed", "cancelled"]),
  remarks: z.string().optional(),
})

type MarketingEventDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (data: any) => Promise<void>;
  event?: any;
}

export function MarketingEventDialog({ isOpen, onOpenChange, onSave, event }: MarketingEventDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      eventName: "",
      eventType: "RTD",
      eventDate: new Date(),
      venue: "",
      estimatedCost: 0,
      status: "planned",
      remarks: "",
    },
  })

  useEffect(() => {
    if (isOpen) {
      if (event) {
        form.reset({
          ...event,
          eventDate: parseISO(event.eventDate),
        });
      } else {
        form.reset({
          eventName: "",
          eventType: "RTD",
          eventDate: new Date(),
          venue: "",
          estimatedCost: 0,
          status: "planned",
          remarks: "",
        });
      }
    }
  }, [event, form, isOpen]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    const payload = {
      ...values,
      eventDate: values.eventDate.toISOString(),
      id: event?.id
    };
    await onSave(payload);
    setIsSubmitting(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl flex items-center gap-2">
            <Presentation className="text-primary" />
            {event ? "Edit Event Record" : "Log Marketing Event"}
          </DialogTitle>
          <DialogDescription>
            Record activity details for clinical meetings and group presentations.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="eventName"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel className="font-headline">Event Title</FormLabel>
                        <FormControl><Input placeholder="e.g. Q1 RTD Cardio" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="eventType"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel className="font-headline">Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="RTD">RTD (Round Table)</SelectItem>
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="eventDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                        <FormLabel className="font-headline">Activity Date</FormLabel>
                        <Popover>
                            <PopoverTrigger asChild>
                            <FormControl>
                                <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                            </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                            </PopoverContent>
                        </Popover>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel className="font-headline">Operational Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="planned">Planned / Upcoming</SelectItem>
                                <SelectItem value="completed">Completed / Done</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            <FormField
                control={form.control}
                name="venue"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="font-headline">Venue / Hospital Unit</FormLabel>
                    <FormControl><Input placeholder="e.g. PHC Function Room A" {...field} /></FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />

            <FormField
                control={form.control}
                name="remarks"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="font-headline">Session Highlights / Notes</FormLabel>
                    <FormControl><Textarea placeholder="Add any details about speakers or outcomes..." {...field} /></FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />

            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="font-headline px-8">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {event ? "Update Record" : "Log Event"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
