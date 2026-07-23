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
import { useQ4Allocation } from "@/hooks/use-q4-allocation"
import { Loader2, Package } from "lucide-react"

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
  const { saveAllocation } = useQ4Allocation(false);
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
    
    try {
        await saveAllocation({
            id: sample?.id,
            prodGroupProdSubGroup: values.productGroup,
            displayMaterialName: values.materialName,
            allocationQuantity: values.allocationQuantity
        });
        
        onSave();
        onOpenChange(false);
    } catch (e) {
        console.error("Save error:", e);
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline flex items-center gap-2 text-xl">
            <Package className="w-5 h-5 text-primary" />
            {sample ? "Edit Material" : "Add New Material"}
          </DialogTitle>
          <DialogDescription>
            Update the marketing material details in the global master list.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <div className="grid grid-cols-1 gap-4">
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
                        <FormLabel className="font-headline">Material Name</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g. PQ3_Frutos" {...field} />
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
                      <FormLabel className="font-headline">Global Allocation Quantity</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} className="h-12 text-lg font-mono border-2" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>

            <DialogFooter className="pt-4 border-t">
              <Button type="submit" disabled={isSubmitting} className="w-full h-12 font-headline text-lg rounded-xl shadow-lg">
                {isSubmitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                ) : (
                    "Save to Master List"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
