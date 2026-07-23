
'use client';

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { useEffect, useState, useMemo } from "react"
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
import { Loader2, Package, Check, ChevronsUpDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"

const formSchema = z.object({
  sampleId: z.string().min(1, "Please select a product"),
  quantity: z.coerce.number().min(0, "Quantity must be at least 0"),
})

type IndividualAllocationDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (sampleId: string, qty: number) => Promise<void>;
  globalAllocations: Q4Allocation[];
}

export function IndividualAllocationDialog({ isOpen, onOpenChange, onSave, globalAllocations }: IndividualAllocationDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sampleId: "",
      quantity: 0,
    },
  })

  useEffect(() => {
    if (isOpen) {
      form.reset({
        sampleId: "",
        quantity: 0,
      });
    }
  }, [isOpen, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    await onSave(values.sampleId, values.quantity);
    setIsSubmitting(false);
  }

  const selectedSample = useMemo(() => 
    globalAllocations.find(s => s.id === form.watch("sampleId")), 
    [globalAllocations, form.watch("sampleId")]
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline flex items-center gap-2">
            <Package className="text-primary w-5 h-5" />
            Assign Product to PMR
          </DialogTitle>
          <DialogDescription>
            Select a product from the master material list and set the quantity for this representative.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <FormField
              control={form.control}
              name="sampleId"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="font-headline">Target Product</FormLabel>
                  <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between h-12 border-2",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value
                            ? globalAllocations.find((s) => s.id === field.value)?.displayMaterialName
                            : "Search product list..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search material name..." />
                        <CommandList>
                          <CommandEmpty>No materials found.</CommandEmpty>
                          <CommandGroup>
                            {globalAllocations.map((sample) => (
                              <CommandItem
                                key={sample.id}
                                value={sample.displayMaterialName}
                                onSelect={() => {
                                  form.setValue("sampleId", sample.id);
                                  form.setValue("quantity", sample.allocationQuantity);
                                  setPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    sample.id === field.value ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                    <span className="font-bold">{sample.displayMaterialName}</span>
                                    <span className="text-[10px] uppercase text-muted-foreground">{sample.prodGroupProdSubGroup}</span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-headline">Specific Bag Quantity</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} className="h-12 text-lg font-mono border-2" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="bg-primary/5 p-4 rounded-xl border-2 border-primary/10">
                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest leading-relaxed">
                    This quantity will explicitly replace the global template for this PMR. Other representatives will not be affected.
                </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || !form.watch("sampleId")} className="font-headline">
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Assigning...</> : "Confirm Assignment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
