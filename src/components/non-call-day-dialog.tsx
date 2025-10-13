
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { useEffect } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { format } from "date-fns"
import type { NonCallDay } from "@/lib/types"

const nonCallDayFormSchema = z.object({
  reason: z.string().min(1, "Please select a reason."),
  dayType: z.enum(['wholeday', 'halfday-am', 'halfday-pm']),
  remarks: z.string().optional(),
})

type NonCallDayDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (data: Omit<NonCallDay, 'id' | 'userId' | 'date' | 'status'>) => void;
  selectedDate: Date;
}

const leaveReasons = [
    "Vacation Leave",
    "Sick Leave",
    "Emergency Leave",
    "Marketing Activity",
    "Training/Orientation",
    "Sales/Marketing Event",
    "Paternity/Maternity Leave",
    "District Meeting",
]

export function NonCallDayDialog({ isOpen, onOpenChange, onSave, selectedDate }: NonCallDayDialogProps) {
  const form = useForm<z.infer<typeof nonCallDayFormSchema>>({
    resolver: zodResolver(nonCallDayFormSchema),
    defaultValues: {
      reason: "",
      remarks: "",
      dayType: "wholeday",
    },
  })

  useEffect(() => {
    if (!isOpen) {
      form.reset();
    }
  }, [isOpen, form]);

  const onSubmit = (values: z.infer<typeof nonCallDayFormSchema>) => {
    onSave(values);
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-headline">Log Non-Call Day</DialogTitle>
          <DialogDescription>
            Submit a request for a non-call day on {format(selectedDate, "PPP")}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
             <FormField
              control={form.control}
              name="dayType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-headline">Leave Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="wholeday">Whole Day</SelectItem>
                      <SelectItem value="halfday-am">Half Day (AM)</SelectItem>
                      <SelectItem value="halfday-pm">Half Day (PM)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-headline">Reason for Leave</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a reason..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {leaveReasons.map(reason => (
                          <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                      ))}
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
                  <FormLabel className="font-headline">Remarks (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Add any additional details here..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit">Submit for Approval</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
