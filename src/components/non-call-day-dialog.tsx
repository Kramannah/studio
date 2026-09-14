"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { useEffect, useMemo } from "react"
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
  category: z.string().min(1, "Please select a category."),
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

const categories = [
    { value: "leave-related", label: "Leave-Related Activities" },
    { value: "business", label: "Company and Business Activities" },
    { value: "other", label: "Other" },
];

const reasonsByCategory: Record<string, string[]> = {
    "leave-related": [
        "Vacation Leave",
        "Sick Leave",
        "Emergency Leave",
        "Maternity/Paternity Leave",
        "Solo Parent Leave",
        "Absence Without Pay",
        "Leave Without Pay",
        "Forced Leave",
        "Offset",
    ],
    "business": [
        "Training/Orientation",
        "Workshops",
        "Company Meeting",
        "Booth Manning Activities",
        "Medical Mission",
        "Trade Activity",
        "District Meeting",
        "Other management-approved business activities conducted outside regular field work",
    ],
    "other": [
        "Enroute",
    ],
};

export function NonCallDayDialog({ isOpen, onOpenChange, onSave, selectedDate }: NonCallDayDialogProps) {
  const form = useForm<z.infer<typeof nonCallDayFormSchema>>({
    resolver: zodResolver(nonCallDayFormSchema),
    defaultValues: {
      category: "",
      reason: "",
      remarks: "",
      dayType: "wholeday",
    },
  })

  const selectedCategory = form.watch("category");

  useEffect(() => {
    if (!isOpen) {
      form.reset();
    }
  }, [isOpen, form]);

  // Reset reason when category changes
  useEffect(() => {
    if (selectedCategory) {
        form.setValue("reason", "");
    }
  }, [selectedCategory, form]);

  const onSubmit = (values: z.infer<typeof nonCallDayFormSchema>) => {
    // The component expectation is to omit certain fields to match database structure
    const { category, ...rest } = values;
    onSave(rest);
    onOpenChange(false);
  }

  const currentReasons = useMemo(() => {
      return reasonsByCategory[selectedCategory] || [];
  }, [selectedCategory]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl">Log Non-Call Day</DialogTitle>
          <DialogDescription>
            Submit a request for a non-call day on {format(selectedDate, "PPP")}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
             <FormField
              control={form.control}
              name="dayType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-headline text-xs uppercase tracking-widest text-muted-foreground">Leave Duration</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-11 border-2 rounded-xl">
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
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-headline text-xs uppercase tracking-widest text-primary">Activity Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-11 border-2 rounded-xl">
                        <SelectValue placeholder="Select a category..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
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
                  <FormLabel className="font-headline text-xs uppercase tracking-widest text-primary">Reason for Leave</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value}
                    disabled={!selectedCategory}
                  >
                    <FormControl>
                      <SelectTrigger className="h-11 border-2 rounded-xl">
                        <SelectValue placeholder={selectedCategory ? "Select a specific reason..." : "Please select category first"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {currentReasons.map(reason => (
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
                  <FormLabel className="font-headline text-xs uppercase tracking-widest text-muted-foreground">Remarks (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                        placeholder="Add any additional details here..." 
                        {...field} 
                        className="min-h-[100px] border-2 rounded-xl focus-visible:ring-primary"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-2">
              <Button 
                type="submit" 
                className="w-full h-12 font-headline text-lg rounded-xl shadow-lg transition-all active:scale-[0.98]"
                disabled={!selectedCategory || !form.watch("reason")}
              >
                Submit for Approval
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
