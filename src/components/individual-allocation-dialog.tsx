
"use client"

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
import type { Q4Allocation } from "@/lib/types"
import { Loader2, UserCircle2 } from "lucide-react"

const formSchema = z.object({
  quantity: z.coerce.number().min(0, "Quantity must be at least 0"),
})

type IndividualAllocationDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (qty: number) => Promise<void>;
  sample?: Q4Allocation;
}

export function IndividualAllocationDialog({ isOpen, onOpenChange, onSave, sample }: IndividualAllocationDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      quantity: 0,
    },
  })

  useEffect(() => {
    if (isOpen && sample) {
      form.reset({
        quantity: sample.allocationQuantity,
      });
    }
  }, [sample, form, isOpen]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    await onSave(values.quantity);
    setIsSubmitting(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline flex items-center gap-2">
            <UserCircle2 className="text-primary w-5 h-5" />
            Individual Override
          </DialogTitle>
          <DialogDescription>
            Setting a specific quantity for this representative will override the global template for <strong>{sample?.displayMaterialName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-headline">PMR Specific Allocation</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} autoFocus className="h-12 text-lg font-mono border-2" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="bg-muted p-3 rounded-lg border">
                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest leading-tight">
                    Only this representative will see this updated balance. Other PMRs will continue using the global template quantity.
                </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="font-headline">
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</> : "Apply Override"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
