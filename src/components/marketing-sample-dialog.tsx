
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
import type { MarketingSample } from "@/lib/types"
import { useAdminMarketingSamples } from "@/hooks/use-marketing-samples"
import { Loader2, Globe } from "lucide-react"

const formSchema = z.object({
  productGroup: z.string().min(1, "Product group is required"),
  materialName: z.string().min(1, "Material name is required"),
  allocationQuantity: z.coerce.number().min(0, "Quantity must be at least 0"),
})

type MarketingSampleDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: () => void;
  sample?: MarketingSample;
}

export function MarketingSampleDialog({ isOpen, onOpenChange, onSave, sample }: MarketingSampleDialogProps) {
  const { addSample, updateSample } = useAdminMarketingSamples();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      productGroup: "",
      materialName: "",
      allocationQuantity: 0,
    },
  })

  useEffect(() => {
    if (isOpen) {
      if (sample) {
        form.reset({
          productGroup: sample.productGroup,
          materialName: sample.materialName,
          allocationQuantity: sample.allocationQuantity,
        });
      } else {
        form.reset({
          productGroup: "",
          materialName: "",
          allocationQuantity: 0,
        });
      }
    }
  }, [sample, form, isOpen]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    let success = false;
    if (sample) {
      success = await updateSample(sample.id, values);
    } else {
      const res = await addSample(values);
      success = !!res;
    }
    
    if (success) {
      onSave();
      onOpenChange(false);
    }
    setIsSubmitting(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline flex items-center gap-2">
            {sample ? "Edit Global Assignment" : "Assign New Global Sample"}
          </DialogTitle>
          <DialogDescription>
            Setting this sample will make it available to <strong>all PMRs</strong> in the system.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="productGroup"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-headline">Product Category</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Antihistamine" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="materialName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-headline">Material / Sample Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. PQ3_Frutos Candy" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="allocationQuantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-headline">Quantity Assigned (Per PMR)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="bg-muted p-3 rounded-lg flex items-start gap-3">
                <Globe className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest leading-tight">
                    This allocation acts as a template. Every active representative will receive this quantity in their individual balance.
                </p>
            </div>

            <DialogFooter className="pt-4">
              <Button type="submit" disabled={isSubmitting} className="w-full h-12 font-headline text-lg">
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating Records...</> : sample ? "Update Global Assignment" : "Assign to All PMRs"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
