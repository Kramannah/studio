
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
import type { MarketingSample, Q4Allocation } from "@/lib/types"
import { useQ4Allocation } from "@/hooks/use-q4-allocation"
import { useUserProfiles } from "@/hooks/use-user-profiles"
import { Loader2, Package, User, Globe, Search, X, Check, Info } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"
import { ScrollArea } from "./ui/scroll-area"

const formSchema = z.object({
  assignmentType: z.enum(["global", "individual"]),
  userId: z.string().optional(),
  sampleId: z.string().optional(),
  productGroup: z.string().min(1, "Product category is required"),
  materialName: z.string().min(1, "Material name is required"),
  allocationQuantity: z.coerce.number().min(0, "Quantity must be at least 0"),
}).superRefine((data, ctx) => {
    if (data.assignmentType === 'individual') {
        if (!data.userId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Please select a representative",
                path: ["userId"],
            });
        }
        if (!data.sampleId) {
             ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "This product name was not found in the master list. Please check the spelling.",
                path: ["materialName"],
            });
        }
    }
});

type MarketingSampleDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: () => void;
  sample?: MarketingSample;
}

export function MarketingSampleDialog({ isOpen, onOpenChange, onSave, sample }: MarketingSampleDialogProps) {
  const { saveAllocation, saveIndividualAllocation, allocations, loading: dataLoading } = useQ4Allocation(true);
  const { profiles } = useUserProfiles();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      assignmentType: "global",
      userId: "",
      sampleId: "",
      productGroup: "",
      materialName: "",
      allocationQuantity: 0,
    },
  })

  const assignmentType = form.watch("assignmentType");
  const selectedUserId = form.watch("userId");
  const typedMaterialName = form.watch("materialName");

  // Type-based Linking Logic: Find the Sample ID as the user types the name
  useEffect(() => {
      const q = typedMaterialName.toLowerCase().trim();
      if (!q) {
          if (assignmentType === 'individual') form.setValue("sampleId", "");
          return;
      }

      const match = allocations.find(a => 
          (a.displayMaterialName || "").toLowerCase().trim() === q ||
          (a.materialName || "").toLowerCase().trim() === q
      );

      if (match) {
          form.setValue("sampleId", match.id);
          form.setValue("productGroup", match.prodGroupProdSubGroup || match.productGroup || "");
      } else if (assignmentType === 'individual') {
          form.setValue("sampleId", "");
      }
  }, [typedMaterialName, allocations, assignmentType, form]);

  useEffect(() => {
    if (isOpen) {
      if (sample) {
        form.reset({
          assignmentType: "global",
          userId: "",
          sampleId: sample.id,
          productGroup: sample.productGroup,
          materialName: sample.materialName,
          allocationQuantity: sample.allocationQuantity,
        });
      } else {
        form.reset({
          assignmentType: "global",
          userId: "",
          sampleId: "",
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
        } else if (values.userId && values.sampleId) {
            await saveIndividualAllocation(values.userId, values.sampleId, values.allocationQuantity);
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

  const isMatched = !!form.watch("sampleId");

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 pb-4 border-b bg-background shrink-0">
          <DialogTitle className="font-headline flex items-center gap-2 text-xl text-primary">
            <Package className="w-5 h-5" />
            {assignmentType === 'global' ? "Master Material Config" : "Individual Bag Assignment"}
          </DialogTitle>
          <DialogDescription>
            {assignmentType === 'global' 
                ? "Update items for the entire organization." 
                : "Type the material name exactly as it appears in the master list to link it to a specific PMR."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 scrollbar-hide">
          <div className="p-6 space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                
                <FormField
                  control={form.control}
                  name="assignmentType"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel className="font-headline text-xs uppercase tracking-widest text-muted-foreground">Allocation Strategy</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={(v) => {
                              field.onChange(v);
                              if (v === 'individual') {
                                  form.setValue("allocationQuantity", 0);
                                  form.setValue("materialName", "");
                                  form.setValue("productGroup", "");
                                  form.setValue("sampleId", "");
                              }
                          }}
                          defaultValue={field.value}
                          className="grid grid-cols-2 gap-4"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0 border-2 rounded-xl p-4 cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                            <FormControl><RadioGroupItem value="global" /></FormControl>
                            <FormLabel className="font-bold flex items-center gap-2 cursor-pointer">
                                <Globe className="w-4 h-4" /> Global Template
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0 border-2 rounded-xl p-4 cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
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
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <FormLabel className="font-headline text-xs uppercase tracking-widest text-primary">1. Select Representative</FormLabel>
                        {selectedUserId ? (
                        <div className="flex items-center justify-between p-4 bg-primary/10 border-2 border-primary/20 rounded-2xl">
                            <div className="flex flex-col">
                                <span className="font-bold text-base">{getDisplayName(profiles[selectedUserId])}</span>
                                <span className="text-[10px] font-black uppercase text-primary tracking-widest">
                                    {profiles[selectedUserId]?.code || "PMR"} • {profiles[selectedUserId]?.email}
                                </span>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                type="button"
                                onClick={() => form.setValue("userId", "")}
                                className="h-10 w-10 rounded-full hover:bg-destructive hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                        ) : (
                        <div className="space-y-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <Input 
                                    placeholder="Search by name or code..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 h-11 border-2 focus-visible:ring-primary rounded-xl"
                                />
                            </div>
                            <div className="max-h-[160px] overflow-y-auto border-2 rounded-xl bg-background divide-y shadow-inner scrollbar-hide">
                                {filteredUsers.length > 0 ? (
                                    filteredUsers.map((p) => (
                                        <div 
                                            key={p.userId}
                                            onClick={() => form.setValue("userId", p.userId)}
                                            className="p-3 hover:bg-primary/5 cursor-pointer transition-colors flex items-center justify-between group"
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-bold text-sm group-hover:text-primary transition-colors">{getDisplayName(p)}</span>
                                                <span className="text-[10px] text-muted-foreground uppercase">{p.code || "PMR"}</span>
                                            </div>
                                            <Check className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-8 text-center text-sm text-muted-foreground italic">No field personnel found.</div>
                                )}
                            </div>
                        </div>
                        )}
                        <FormMessage className="text-xs text-destructive">{form.formState.errors.userId?.message}</FormMessage>
                    </div>
                )}

                <div className="space-y-6 pt-2">
                    <FormField
                        control={form.control}
                        name="materialName"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel className="font-headline text-xs uppercase tracking-wider text-muted-foreground">
                                {assignmentType === 'individual' ? "2. Material Name (Must match exactly)" : "Material Name"}
                            </FormLabel>
                            <FormControl>
                                <div className="relative">
                                    <Input placeholder="e.g. Frutos Candy" {...field} className="h-12 border-2 rounded-xl pr-10" />
                                    {assignmentType === 'individual' && isMatched && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <Check className="w-5 h-5 text-[#10b981]" />
                                        </div>
                                    )}
                                </div>
                            </FormControl>
                            {assignmentType === 'individual' && isMatched && (
                                <p className="text-[10px] text-[#10b981] font-bold uppercase tracking-widest mt-1 flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Successfully Linked to Global Inventory
                                </p>
                            )}
                            <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="productGroup"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel className="font-headline text-xs uppercase tracking-wider text-muted-foreground">Product Category</FormLabel>
                            <FormControl>
                                <Input 
                                    placeholder="e.g. Antihistamine" 
                                    {...field} 
                                    className="h-12 border-2 rounded-xl bg-muted/20" 
                                    disabled={assignmentType === 'individual' && isMatched}
                                />
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
                          <FormLabel className="font-headline text-xs uppercase tracking-wider text-muted-foreground">
                            {assignmentType === 'individual' ? "3. Custom Bag Quantity" : "Default Bag Quantity"}
                          </FormLabel>
                          <FormControl>
                             <div className="relative">
                                <Input type="number" {...field} className="h-16 text-4xl font-mono border-2 rounded-2xl bg-background text-center font-black pr-16" />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Units</div>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                </div>
              </form>
            </Form>
          </div>
        </ScrollArea>

        <DialogFooter className="p-6 pt-4 border-t bg-muted/30 shrink-0">
          <Button 
            onClick={form.handleSubmit(onSubmit)} 
            disabled={isSubmitting || dataLoading} 
            className="w-full h-14 font-headline text-lg rounded-xl shadow-xl transition-all active:scale-[0.98] font-black"
          >
            {isSubmitting ? <><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Processing...</> : (assignmentType === 'global' ? "Save to Global Template" : "Confirm Individual Assignment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
