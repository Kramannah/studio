
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
import type { MarketingSample } from "@/lib/types"
import { useQ4Allocation } from "@/hooks/use-q4-allocation"
import { useUserProfiles } from "@/hooks/use-user-profiles"
import { Loader2, Package, User, Globe, Search, Check, ChevronsUpDown } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"

const formSchema = z.object({
  assignmentType: z.enum(["global", "individual"]),
  userId: z.string().optional(),
  productGroup: z.string().min(1, "Product group is required"),
  materialName: z.string().min(1, "Material name is required"),
  allocationQuantity: z.coerce.number().min(0, "Quantity must be at least 0"),
}).superRefine((data, ctx) => {
    if (data.assignmentType === 'individual' && !data.userId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Please select a representative",
            path: ["userId"],
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
  const { saveAllocation, saveIndividualAllocation, allocations } = useQ4Allocation(false);
  const { profiles } = useUserProfiles();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      assignmentType: "global",
      userId: "",
      productGroup: "",
      materialName: "",
      allocationQuantity: 0,
    },
  })

  const assignmentType = form.watch("assignmentType");

  useEffect(() => {
    if (isOpen) {
      if (sample) {
        form.reset({
          assignmentType: "global",
          userId: "",
          productGroup: sample.productGroup,
          materialName: sample.materialName,
          allocationQuantity: sample.allocationQuantity,
        });
      } else {
        form.reset({
          assignmentType: "global",
          userId: "",
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
        if (values.assignmentType === 'global') {
            await saveAllocation({
                id: sample?.id,
                prodGroupProdSubGroup: values.productGroup,
                displayMaterialName: values.materialName,
                allocationQuantity: values.allocationQuantity
            });
        } else if (values.userId) {
            let targetSampleId = sample?.id;
            
            if (!targetSampleId) {
                const existing = allocations.find(a => 
                    a.displayMaterialName.toLowerCase() === values.materialName.toLowerCase()
                );
                
                if (existing) {
                    targetSampleId = existing.id;
                } else {
                    const result = await saveAllocation({
                        prodGroupProdSubGroup: values.productGroup,
                        displayMaterialName: values.materialName,
                        allocationQuantity: 0
                    });
                }
            }
            
            if (targetSampleId) {
                await saveIndividualAllocation(values.userId, targetSampleId, values.allocationQuantity);
            }
        }
        
        onSave();
        onOpenChange(false);
    } catch (e) {
        console.error("Save error:", e);
    } finally {
        setIsSubmitting(false);
    }
  }

  const sortedUsers = useMemo(() => {
    return Object.values(profiles)
        .filter(p => p.role === 'PMR' || !p.role)
        .sort((a, b) => {
            const nameA = `${a.lastName || ''} ${a.firstName || ''}`.trim() || a.email || '';
            const nameB = `${b.lastName || ''} ${b.firstName || ''}`.trim() || b.email || '';
            return nameA.localeCompare(nameB);
        });
  }, [profiles]);

  const getDisplayName = (p: any) => {
    const last = (p.lastName || "").trim();
    const first = (p.firstName || "").trim();
    if (!last && !first) return p.email || "Unknown User";
    if (!last) return first;
    if (!first) return last;
    return `${last}, ${first}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline flex items-center gap-2 text-xl">
            <Package className="w-5 h-5 text-primary" />
            {sample ? "Manage Material Allocation" : "Add New Material"}
          </DialogTitle>
          <DialogDescription>
            Assign marketing items globally or to a specific representative.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            
            <FormField
              control={form.control}
              name="assignmentType"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="font-headline">Assignment Level</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="grid grid-cols-2 gap-4"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0 border-2 rounded-xl p-3 cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-primary">
                        <FormControl><RadioGroupItem value="global" /></FormControl>
                        <FormLabel className="font-bold flex items-center gap-2 cursor-pointer">
                            <Globe className="w-4 h-4" /> Global
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0 border-2 rounded-xl p-3 cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-primary">
                        <FormControl><RadioGroupItem value="individual" /></FormControl>
                        <FormLabel className="font-bold flex items-center gap-2 cursor-pointer">
                            <User className="w-4 h-4" /> Specific PMR
                        </FormLabel>
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
                    name="userId"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel className="font-headline">Select Representative</FormLabel>
                            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            className={cn(
                                                "w-full justify-between h-12 border-2 text-left",
                                                !field.value && "text-muted-foreground"
                                            )}
                                        >
                                            <span className="truncate">
                                                {field.value && profiles[field.value]
                                                    ? `${getDisplayName(profiles[field.value])} (${profiles[field.value].code || 'PMR'})`
                                                    : "Search by name, code, or email..."}
                                            </span>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent 
                                    className="w-[--radix-popover-trigger-width] p-0" 
                                    align="start"
                                    onOpenAutoFocus={(e) => e.preventDefault()}
                                >
                                    <Command shouldFilter={true}>
                                        <CommandInput placeholder="Type name, email, or code..." />
                                        <CommandList>
                                            <CommandEmpty>No matching personnel found.</CommandEmpty>
                                            <CommandGroup>
                                                {sortedUsers.map((p) => (
                                                    <CommandItem
                                                        key={p.userId}
                                                        value={`${p.lastName} ${p.firstName} ${p.code || ''} ${p.email || ''}`.toLowerCase()}
                                                        onSelect={() => {
                                                            field.onChange(p.userId);
                                                            setPopoverOpen(false);
                                                        }}
                                                    >
                                                        <Check className={cn("mr-2 h-4 w-4", p.userId === field.value ? "opacity-100" : "opacity-0")} />
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-sm">{getDisplayName(p)}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] uppercase font-black text-primary tracking-widest">{p.code || "PMR"}</span>
                                                                {p.email && <span className="text-[9px] text-muted-foreground truncate max-w-[150px]">{p.email}</span>}
                                                            </div>
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
                      <FormLabel className="font-headline">Allocation Quantity</FormLabel>
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
                    "Save Assignment"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
