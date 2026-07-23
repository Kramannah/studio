
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
import { Loader2, Package, User, Globe, Check, ChevronsUpDown } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "./ui/radio-group"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command"
import { cn } from "@/lib/utils"

const formSchema = z.object({
  assignmentType: z.enum(["global", "individual"]),
  targetUserId: z.string().optional(),
  productGroup: z.string().min(1, "Product group is required"),
  materialName: z.string().min(1, "Material name is required"),
  allocationQuantity: z.coerce.number().min(0, "Quantity must be at least 0"),
}).superRefine((data, ctx) => {
    if (data.assignmentType === 'individual' && !data.targetUserId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Please select a specific representative.",
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
  const { saveAllocation, saveIndividualOverride } = useQ4Allocation(false);
  const { profiles } = useUserProfiles();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userSelectOpen, setUserSelectOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      assignmentType: "global",
      targetUserId: "",
      productGroup: "",
      materialName: "",
      allocationQuantity: 0,
    },
  })

  useEffect(() => {
    if (isOpen) {
      if (sample) {
        form.reset({
          assignmentType: "global",
          targetUserId: "",
          productGroup: sample.productGroup,
          materialName: sample.materialName,
          allocationQuantity: sample.allocationQuantity,
        });
      } else {
        form.reset({
          assignmentType: "global",
          targetUserId: "",
          productGroup: "",
          materialName: "",
          allocationQuantity: 0,
        });
      }
    }
  }, [sample, form, isOpen]);

  const assignmentType = form.watch("assignmentType");

  const pmrList = useMemo(() => {
    return Object.values(profiles)
        .filter(p => p.role === 'PMR' || !p.role)
        .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));
  }, [profiles]);

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
        } else if (values.assignmentType === 'individual' && values.targetUserId && sample?.id) {
            await saveIndividualOverride(values.targetUserId, sample.id, values.allocationQuantity);
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
          <DialogTitle className="font-headline flex items-center gap-2 text-xl">
            <Package className="w-5 h-5 text-primary" />
            {sample ? "Manage Material Assignment" : "Add New Material"}
          </DialogTitle>
          <DialogDescription>
            Configure product distribution. Choose whether this applies globally or to a specific PMR.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            
            <FormField
                control={form.control}
                name="assignmentType"
                render={({ field }) => (
                    <FormItem className="space-y-3">
                        <FormLabel className="font-headline text-sm uppercase tracking-widest text-muted-foreground">Distribution Scope</FormLabel>
                        <FormControl>
                            <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="flex flex-col space-y-1"
                                disabled={!sample && assignmentType === 'individual'} // Individual assignment requires a product context
                            >
                                <FormItem className="flex items-center space-x-3 space-y-0 p-3 border rounded-xl hover:bg-muted/50 transition-colors">
                                    <FormControl><RadioGroupItem value="global" /></FormControl>
                                    <div className="flex items-center gap-2">
                                        <Globe className="w-4 h-4 text-primary" />
                                        <FormLabel className="font-bold cursor-pointer">Global Template (All PMRs)</FormLabel>
                                    </div>
                                </FormItem>
                                <FormItem className={cn("flex items-center space-x-3 space-y-0 p-3 border rounded-xl hover:bg-muted/50 transition-colors", !sample && "opacity-50 grayscale cursor-not-allowed")}>
                                    <FormControl><RadioGroupItem value="individual" disabled={!sample} /></FormControl>
                                    <div className="flex items-center gap-2">
                                        <User className="w-4 h-4 text-orange-500" />
                                        <FormLabel className="font-bold cursor-pointer">Specific PMR Assignment</FormLabel>
                                    </div>
                                </FormItem>
                            </RadioGroup>
                        </FormControl>
                        {!sample && <p className="text-[10px] text-orange-500 font-bold uppercase italic">Note: Create product globally first before setting individual overrides.</p>}
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
                            <FormLabel className="font-headline">Target Representative</FormLabel>
                            <Popover open={userSelectOpen} onOpenChange={setUserSelectOpen}>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            className={cn("w-full justify-between h-11 border-2", !field.value && "text-muted-foreground")}
                                        >
                                            {field.value ? pmrList.find(p => p.userId === field.value)?.lastName + ", " + pmrList.find(p => p.userId === field.value)?.firstName : "Search personnel..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                    <Command>
                                        <CommandInput placeholder="Search PMR name..." />
                                        <CommandList>
                                            <CommandEmpty>No personnel found.</CommandEmpty>
                                            <CommandGroup>
                                                {pmrList.map((p) => (
                                                    <CommandItem
                                                        key={p.userId}
                                                        value={`${p.lastName} ${p.firstName}`}
                                                        onSelect={() => {
                                                            form.setValue("targetUserId", p.userId);
                                                            setUserSelectOpen(false);
                                                        }}
                                                    >
                                                        <Check className={cn("mr-2 h-4 w-4", p.userId === field.value ? "opacity-100" : "opacity-0")} />
                                                        {p.lastName}, {p.firstName}
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
                            <Input placeholder="e.g. Antihistamine" {...field} disabled={assignmentType === 'individual'} />
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
                            <Input placeholder="e.g. PQ3_Frutos" {...field} disabled={assignmentType === 'individual'} />
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
                      <FormLabel className="font-headline">
                        {assignmentType === 'global' ? "Global Quantity (Base)" : "Individual Bag Quantity"}
                      </FormLabel>
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
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                ) : (
                    assignmentType === 'global' ? "Save Global Assignment" : "Assign to Specific PMR"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
