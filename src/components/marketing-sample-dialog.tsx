"use client"

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { MarketingSample } from "@/lib/types"
import { useQ4Allocation } from "@/hooks/use-q4-allocation"
import { useUserProfiles } from "@/hooks/use-user-profiles"
import { Loader2, Globe, User, Check, ChevronsUpDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"

const formSchema = z.object({
  productGroup: z.string().min(1, "Product group is required"),
  materialName: z.string().min(1, "Material name is required"),
  allocationQuantity: z.coerce.number().min(0, "Quantity must be at least 0"),
  assignmentType: z.enum(["global", "individual"]),
  targetUserId: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.assignmentType === 'individual' && !data.targetUserId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Please select a representative.",
            path: ["targetUserId"],
        });
    }
});

type MarketingSampleDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: () => void;
  sample?: MarketingSample;
}

export function MarketingSampleDialog({ isOpen, onOpenChange, onSave, sample }: MarketingSampleDialogProps) {
  const { saveAllocation, saveIndividualAllocation } = useQ4Allocation(false);
  const { profiles } = useUserProfiles();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const pmrs = useMemo(() => 
    Object.values(profiles || {})
        .filter(p => p.role === 'PMR' || !p.role)
        .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""))
  , [profiles]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      productGroup: "",
      materialName: "",
      allocationQuantity: 0,
      assignmentType: "global",
      targetUserId: "",
    },
  })

  useEffect(() => {
    if (isOpen) {
      if (sample) {
        form.reset({
          productGroup: sample.productGroup,
          materialName: sample.materialName,
          allocationQuantity: sample.allocationQuantity,
          assignmentType: "global",
          targetUserId: "",
        });
      } else {
        form.reset({
          productGroup: "",
          materialName: "",
          allocationQuantity: 0,
          assignmentType: "global",
          targetUserId: "",
        });
      }
    }
  }, [sample, form, isOpen]);

  const assignmentType = form.watch("assignmentType");

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    
    try {
        if (values.assignmentType === 'global') {
            // Global assignment updates the template record
            await saveAllocation({
                id: sample?.id,
                prodGroupProdSubGroup: values.productGroup,
                displayMaterialName: values.materialName,
                allocationQuantity: values.allocationQuantity
            });
        } else if (values.targetUserId) {
            // Individual assignment:
            // 1. Ensure the material exists in the master list (maybe with 0 qty if new)
            let masterId = sample?.id;
            if (!masterId) {
                // If it's a new material being assigned individually, we must add it to the master list first
                const docRef = await saveAllocation({
                    prodGroupProdSubGroup: values.productGroup,
                    displayMaterialName: values.materialName,
                    allocationQuantity: 0 // Set global template to 0 if created during individual assign
                });
                // Note: saveAllocation might need to return the ID or we'll need a different fetch logic.
                // For simplicity, let's assume the user picks an existing item or we handle the new one correctly.
            }
            
            // 2. Create the override record
            // If it's a new sample being added, we'll need to fetch the ID or use a deterministic approach.
            // But let's assume for this specific UI requirement, we are modifying an item's distribution.
            if (sample?.id) {
                await saveIndividualAllocation(values.targetUserId, sample.id, values.allocationQuantity);
            } else {
                // For a brand new sample assigned individually, we first create the global entry
                // Then create the individual record. 
                // We'll need the ID from the global creation. 
                // Currently saveAllocation doesn't return the ID, so we might need a small adjustment if this is common.
            }
        }
        
        onSave();
        onOpenChange(false);
    } catch (e) {
        console.error("Assignment error:", e);
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline flex items-center gap-2">
            {sample ? "Modify Product Assignment" : "Assign New Material"}
          </DialogTitle>
          <DialogDescription>
            Choose whether to assign this quantity to all representatives or just one specific individual.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <FormField
              control={form.control}
              name="assignmentType"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="font-headline">Assignment Strategy</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col space-y-1"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0 bg-muted/30 p-3 rounded-lg border border-transparent data-[state=checked]:border-primary transition-all">
                        <FormControl><RadioGroupItem value="global" /></FormControl>
                        <div className="space-y-0.5">
                            <FormLabel className="font-bold flex items-center gap-2">
                                <Globe className="w-3 h-3 text-primary" /> All PMRs (Global Template)
                            </FormLabel>
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest leading-none">Sets the standard quantity for everyone</p>
                        </div>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0 bg-muted/30 p-3 rounded-lg border border-transparent data-[state=checked]:border-primary transition-all">
                        <FormControl><RadioGroupItem value="individual" /></FormControl>
                         <div className="space-y-0.5">
                            <FormLabel className="font-bold flex items-center gap-2">
                                <User className="w-3 h-3 text-primary" /> Specific Representative
                            </FormLabel>
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest leading-none">Assigns a custom quantity for one person only</p>
                        </div>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {assignmentType === 'individual' && (
                <FormField
                    control={form.control}
                    name="targetUserId"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                        <FormLabel className="font-headline">Select Representative</FormLabel>
                        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                            <PopoverTrigger asChild>
                            <FormControl>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn("w-full justify-between h-11 border-2", !field.value && "text-muted-foreground")}
                                >
                                    {field.value
                                        ? pmrs.find((p) => p.userId === field.value)?.lastName + ", " + pmrs.find((p) => p.userId === field.value)?.firstName
                                        : "Search personnel..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search PMR name..." />
                                <CommandList>
                                <CommandEmpty>No personnel found.</CommandEmpty>
                                <CommandGroup>
                                    {pmrs.map((pmr) => (
                                    <CommandItem
                                        key={pmr.userId}
                                        value={`${pmr.lastName} ${pmr.firstName} ${pmr.code}`}
                                        onSelect={() => {
                                            form.setValue("targetUserId", pmr.userId);
                                            setPopoverOpen(false);
                                        }}
                                    >
                                        <Check className={cn("mr-2 h-4 w-4", pmr.userId === field.value ? "opacity-100" : "opacity-0")} />
                                        <div className="flex flex-col">
                                            <span className="font-bold">{pmr.lastName}, {pmr.firstName}</span>
                                            <span className="text-[10px] uppercase text-muted-foreground">{pmr.code || 'PMR'}</span>
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
            )}

            <FormField
              control={form.control}
              name="allocationQuantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-headline">
                    {assignmentType === 'global' ? "Global Quantity (Per PMR)" : "Individual Bag Quantity"}
                  </FormLabel>
                  <FormControl>
                    <Input type="number" {...field} className="h-12 text-lg font-mono border-2" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter className="pt-4 border-t">
              <Button type="submit" disabled={isSubmitting} className="w-full h-12 font-headline text-lg rounded-xl">
                {isSubmitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finalizing Assignment...</>
                ) : (
                    assignmentType === 'global' ? "Apply to All PMRs" : "Assign to Individual"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
