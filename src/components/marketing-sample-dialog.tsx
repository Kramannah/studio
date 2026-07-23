
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
import { Loader2, Package, User, Globe, Search, Check, X } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  const [searchQuery, setSearchQuery] = useState("");

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
  const selectedUserId = form.watch("userId");

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
      setSearchQuery("");
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
                if (existing) targetSampleId = existing.id;
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

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const sorted = Object.values(profiles)
        .filter(p => p.role === 'PMR' || !p.role)
        .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));

    if (!q) return sorted;
    return sorted.filter(p => {
        const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
        const code = (p.code || "").toLowerCase();
        const email = (p.email || "").toLowerCase();
        return fullName.includes(q) || code.includes(q) || email.includes(q);
    });
  }, [profiles, searchQuery]);

  const getDisplayName = (p: any) => {
    const last = (p.lastName || "").trim();
    const first = (p.firstName || "").trim();
    if (!last && !first) return p.email || "Unknown User";
    return last ? `${last}, ${first}` : first;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="font-headline flex items-center gap-2 text-xl">
            <Package className="w-5 h-5 text-primary" />
            {sample ? "Manage Material Allocation" : "Add New Material"}
          </DialogTitle>
          <DialogDescription>
            Assign marketing items globally or to a specific representative.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
              
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
                <div className="space-y-3 border-2 rounded-2xl p-4 bg-muted/20">
                  <FormLabel className="font-headline">Select Representative</FormLabel>
                  
                  {selectedUserId ? (
                    <div className="flex items-center justify-between p-3 bg-primary/10 border-2 border-primary/20 rounded-xl">
                        <div className="flex flex-col">
                            <span className="font-bold text-sm">{getDisplayName(profiles[selectedUserId])}</span>
                            <span className="text-[10px] font-black uppercase text-primary tracking-widest">{profiles[selectedUserId]?.code || "PMR"}</span>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => form.setValue("userId", "")}
                            className="h-8 w-8 rounded-full hover:bg-destructive hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                            <Input 
                                placeholder="Search by name, code, or email..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 h-11 border-2 focus-visible:ring-primary rounded-xl"
                            />
                        </div>
                        <div className="max-h-[200px] overflow-y-auto border-2 rounded-xl bg-background divide-y">
                            {filteredUsers.length > 0 ? (
                                filteredUsers.map((p) => (
                                    <div 
                                        key={p.userId}
                                        onClick={() => form.setValue("userId", p.userId)}
                                        className="p-3 hover:bg-muted cursor-pointer transition-colors flex items-center justify-between"
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-bold text-sm">{getDisplayName(p)}</span>
                                            <span className="text-[10px] text-muted-foreground uppercase">{p.code || "PMR"}</span>
                                        </div>
                                        <div className="text-[9px] text-muted-foreground hidden sm:block">{p.email}</div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-4 text-center text-xs text-muted-foreground italic">No matching personnel found.</div>
                            )}
                        </div>
                    </div>
                  )}
                  <FormMessage className="text-xs text-destructive">{form.formState.errors.userId?.message}</FormMessage>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                  <FormField
                      control={form.control}
                      name="productGroup"
                      render={({ field }) => (
                          <FormItem>
                          <FormLabel className="font-headline">Product Category</FormLabel>
                          <FormControl>
                              <Input placeholder="e.g. Antihistamine" {...field} className="h-11 border-2 rounded-xl" />
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
                              <Input placeholder="e.g. PQ3_Frutos" {...field} className="h-11 border-2 rounded-xl" />
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
                          <Input type="number" {...field} className="h-12 text-lg font-mono border-2 rounded-xl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
              </div>
            </form>
          </Form>
        </ScrollArea>

        <DialogFooter className="p-6 pt-2 border-t">
          <Button 
            onClick={form.handleSubmit(onSubmit)} 
            disabled={isSubmitting} 
            className="w-full h-12 font-headline text-lg rounded-xl shadow-lg"
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save Assignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
