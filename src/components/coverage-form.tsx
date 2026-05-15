
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useFieldArray } from "react-hook-form"
import * as z from "zod"
import { format, parseISO, isValid, isSameMonth, isSameDay, startOfToday, isAfter, isBefore, isToday } from "date-fns"
import { Save, Camera, Trash2, X, Edit, PlusCircle, Calendar as CalendarIcon, Loader2, Check, ChevronsUpDown } from "lucide-react"
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import Image from "next/image"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { SignatureDialog } from "./signature-dialog"
import type { CoverageEntry, Doctor, Q4Allocation, Plan } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { Textarea } from "./ui/textarea"
import { RadioGroup, RadioGroupItem } from "./ui/radio-group"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Autocomplete } from "./autocomplete"
import { ScrollArea } from "./ui/scroll-area"
import { Calendar } from "./ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { Badge } from "./ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command"


const formSchema = z.object({
  id: z.string().optional(),
  callType: z.enum(["unplanned", "planned"]),
  plannedDoctorId: z.string().optional(),
  firstName: z.string().min(1, "Doctor first name is required."),
  lastName: z.string().min(1, "Doctor last name is required."),
  specialty: z.string().optional(),
  clinic: z.string().optional(),
  hacme: z.enum(["YES", "NO"]).optional(),
  coverageType: z.enum(["inbase", "outbase", "joint"]).optional(),
  coverageDate: z.date().optional(),
  photos: z.array(z.string()).max(1, "You can only capture one photo.").optional(),
  signature: z.string().nullable().optional(),
  jointCallSignature: z.string().nullable().optional(),
  jointCallWith: z.string().optional(),
  callObjective: z.string().optional(),
  primaryProduct: z.string().optional(),
  secondaryProduct: z.string().optional(),
  primarySampleName: z.string().optional(),
  primaryProductQty: z.coerce.number().optional(),
  primaryProductBal: z.coerce.number().optional(),
  secondarySampleName: z.string().optional(),
  secondaryProductQty: z.coerce.number().optional(),
  secondaryProductBal: z.coerce.number().optional(),
  reminderProducts: z.array(z.object({
    productName: z.string().optional(),
    sampleName: z.string().optional(),
    quantity: z.coerce.number().optional(),
    balance: z.coerce.number().optional(),
  })).optional(),
  topicsDiscussed: z.string().optional(),
  doctorsIssue: z.string().optional(),
  planOfAction: z.string().optional(),
  whatWentWell: z.string().optional(),
  areasForImprovement: z.string().optional(),
  isOffline: z.boolean().optional(),
}).superRefine((data, ctx) => {
    if (!data.signature && (!data.photos || data.photos.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Either a signature or a photo is required as proof of coverage.",
            path: ["signature"],
        });
    }
    if (data.coverageType === 'joint') {
        if (!data.jointCallWith) {
             ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Please select the person you are with.",
                path: ["jointCallWith"],
            });
        }
        if (!data.jointCallSignature) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "A signature for the joint call companion is required.",
                path: ["jointCallSignature"],
            });
        }
    }
});


type CoverageFormProps = {
  onSave: (entry: Omit<CoverageEntry, 'id' | 'submittedAt' | 'userId'>) => Promise<boolean>;
  onUpdate: (entry: Omit<CoverageEntry, 'submittedAt'>) => void;
  isOnline: boolean;
  doctors: Doctor[];
  allocations: Q4Allocation[];
  masterEntries: CoverageEntry[];
  initialDoctor?: Doctor | null;
  entryToEdit?: (CoverageEntry & { isOffline?: boolean }) | null;
  onFormSubmit?: (isOnline: boolean) => void;
  todaysPlans: Plan[];
  offlineEntries: CoverageEntry[];
  initialDate?: Date | null;
  usedQuantities?: Record<string, number>;
}

const jointCallRoles = [
    "DSM",
    "General Manager",
    "Head of Sales",
    "SFE",
    "Product Manager"
];

const compressImage = (dataUrl: string, quality = 0.5, maxWidth = 800): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.src = dataUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = (maxWidth / width) * height;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Failed to get canvas context'));
            
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = (error) => reject(error);
    });
};

const SearchableSelect = ({ 
    options, 
    value, 
    onValueChange, 
    placeholder, 
    disabled,
    showBalance = false
}: { 
    options: { value: string, label: string, balance?: number }[], 
    value?: string, 
    onValueChange: (val: string) => void, 
    placeholder?: string,
    disabled?: boolean,
    showBalance?: boolean
}) => {
    const [open, setOpen] = useState(false);
    const validOptions = useMemo(() => options.filter(o => o.value && o.value.trim() !== ""), [options]);
    const selectedOption = validOptions.find((o) => o.value === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between font-normal text-left h-auto min-h-[40px] py-2", !value && "text-muted-foreground")}
                    disabled={disabled}
                >
                    <span className="truncate">
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandInput placeholder={`Search ${placeholder?.toLowerCase()}...`} />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            {validOptions.map((option) => (
                                <CommandItem
                                    key={option.value}
                                    value={option.label}
                                    onSelect={() => {
                                        onValueChange(option.value === value ? "" : option.value);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4 shrink-0",
                                            value === option.value ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div className="flex justify-between w-full items-center gap-2">
                                        <span className="truncate">{option.label}</span>
                                        {showBalance && option.balance !== undefined && (
                                            <Badge variant={option.balance <= 0 ? "destructive" : "outline"} className="text-[10px] shrink-0">
                                                Bal: {option.balance}
                                            </Badge>
                                        )}
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};

export function CoverageForm({ 
    onSave, 
    onUpdate, 
    isOnline, 
    doctors, 
    allocations, 
    masterEntries, 
    initialDoctor, 
    entryToEdit,
    onFormSubmit, 
    todaysPlans, 
    offlineEntries, 
    initialDate,
    usedQuantities = {}
}: CoverageFormProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [autocompleteValue, setAutocompleteValue] = useState('');
  const [proofMethod, setProofMethod] = useState<'photo' | 'signature' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [signatureState, setSignatureState] = useState<{
    isOpen: boolean;
    target: 'signature' | 'jointCallSignature' | null;
    title: string;
    initialValue: string | null | undefined;
  }>({ isOpen: false, target: null, title: '', initialValue: null });
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      callType: "unplanned",
      firstName: "",
      lastName: "",
      specialty: "",
      clinic: "",
      hacme: "NO",
      coverageType: "inbase",
      coverageDate: undefined,
      photos: [],
      signature: null,
      jointCallSignature: null,
      jointCallWith: "",
      callObjective: "",
      primaryProduct: "",
      secondaryProduct: "",
      primarySampleName: "",
      primaryProductQty: 0,
      primaryProductBal: 0,
      secondarySampleName: "",
      secondaryProductQty: 0,
      secondaryProductBal: 0,
      reminderProducts: [],
      topicsDiscussed: "",
      doctorsIssue: "",
      planOfAction: "",
      whatWentWell: "",
      areasForImprovement: "",
      isOffline: false,
    },
  })

  useEffect(() => {
      setMounted(true);
      form.setValue("coverageDate", initialDate || new Date());
  }, [initialDate, form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "reminderProducts"
  });

  const callType = form.watch("callType");
  const coverageType = form.watch("coverageType");
  const jointCallWith = form.watch("jointCallWith");
  const photos = form.watch("photos");
  const primaryProduct = form.watch("primaryProduct");
  const secondaryProduct = form.watch("secondaryProduct");
  const reminderProducts = form.watch("reminderProducts");
  const plannedDoctorId = form.watch("plannedDoctorId");

  const dynamicProductList = useMemo(() => {
    const categories = new Set(
        allocations
            .map(a => a.prodGroupProdSubGroup)
            .filter(val => !!val && val.trim() !== "")
    );
    return Array.from(categories).sort().map(cat => ({ value: cat, label: cat }));
  }, [allocations]);

  const primarySampleOptions = useMemo(() => {
    if (!primaryProduct) return [];
    return allocations
        .filter(s => s.prodGroupProdSubGroup === primaryProduct && !!s.displayMaterialName && s.displayMaterialName.trim() !== "")
        .map(s => {
            const used = Math.round(usedQuantities[s.displayMaterialName] || 0);
            const alloc = Math.round(s.allocationQuantity || 0);
            const balance = Math.max(0, alloc - used);
            return { value: s.displayMaterialName, label: s.displayMaterialName, balance };
        });
  }, [primaryProduct, allocations, usedQuantities]);

  const secondarySampleOptions = useMemo(() => {
    if (!secondaryProduct) return [];
    return allocations
        .filter(s => s.prodGroupProdSubGroup === secondaryProduct && !!s.displayMaterialName && s.displayMaterialName.trim() !== "")
        .map(s => {
            const used = Math.round(usedQuantities[s.displayMaterialName] || 0);
            const alloc = Math.round(s.allocationQuantity || 0);
            const balance = Math.max(0, alloc - used);
            return { value: s.displayMaterialName, label: s.displayMaterialName, balance };
        });
  }, [secondaryProduct, allocations, usedQuantities]);
  
  useEffect(() => {
    if (proofMethod === 'photo') {
        form.setValue('signature', null);
    } else if (proofMethod === 'signature') {
        form.setValue('photos', []);
    }
  }, [proofMethod, form]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
            const dataUrl = e.target?.result as string;
            const compressedDataUrl = await compressImage(dataUrl);
            form.setValue('photos', [compressedDataUrl], { shouldValidate: true });
            form.setValue('signature', null);
            setProofMethod('photo');
        } catch (err) {
            toast({ variant: "destructive", title: "Image Error", description: "Failed to process the photo." });
        }
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleSignatureButtonClick = () => {
    setProofMethod('signature');
    form.setValue('photos', []);
    setSignatureState({ 
        isOpen: true, 
        target: 'signature', 
        title: 'Doctor Signature',
        initialValue: form.getValues('signature') 
    });
  };

  const clearProof = () => {
    form.setValue('photos', [], { shouldValidate: true });
    form.setValue('signature', null, { shouldValidate: true });
    setProofMethod(null);
  };

  useEffect(() => {
    if (initialDoctor && !entryToEdit) {
      const isPastOrToday = initialDate ? (isToday(initialDate) || isBefore(initialDate, startOfToday())) : true;
      form.reset({
        callType: isPastOrToday ? "unplanned" : "planned",
        firstName: initialDoctor.firstName,
        lastName: initialDoctor.lastName,
        specialty: initialDoctor.specialty,
        clinic: initialDoctor.clinic,
        hacme: initialDoctor.hacme,
        coverageType: "inbase",
        coverageDate: initialDate || new Date(),
        photos: [],
        signature: null,
        jointCallSignature: null,
        jointCallWith: "",
        callObjective: "",
        primaryProduct: "",
        secondaryProduct: "",
        primarySampleName: "",
        primaryProductQty: 0,
        primaryProductBal: 0,
        secondarySampleName: "",
        secondaryProductQty: 0,
        secondaryProductBal: 0,
        reminderProducts: [],
        topicsDiscussed: "",
        doctorsIssue: "",
        planOfAction: "",
        whatWentWell: "",
        areasForImprovement: "",
        isOffline: false,
        plannedDoctorId: initialDoctor.id, 
      });
      setAutocompleteValue(''); 
      setProofMethod(null);
    }
  }, [initialDoctor, entryToEdit, form, initialDate]);
  
  const resetForm = useCallback(() => {
    form.reset({
      callType: "unplanned",
      firstName: "",
      lastName: "",
      specialty: "",
      clinic: "",
      hacme: "NO",
      coverageType: "inbase",
      coverageDate: new Date(),
      photos: [],
      signature: null,
      jointCallSignature: null,
      jointCallWith: "",
      callObjective: "",
      primaryProduct: "",
      secondaryProduct: "",
      primarySampleName: "",
      primaryProductQty: 0,
      primaryProductBal: 0,
      secondarySampleName: "",
      secondaryProductQty: 0,
      secondaryProductBal: 0,
      reminderProducts: [],
      topicsDiscussed: "",
      doctorsIssue: "",
      planOfAction: "",
      whatWentWell: "",
      areasForImprovement: "",
    });
    setAutocompleteValue('');
    setProofMethod(null);
  }, [form]);

  useEffect(() => {
    if (entryToEdit) {
        const coverageDate = typeof entryToEdit.coverageDate === 'string' ? parseISO(entryToEdit.coverageDate) : entryToEdit.coverageDate;
        form.reset({
            ...entryToEdit,
            coverageDate: isValid(coverageDate) ? (coverageDate as Date) : new Date(),
        });
        setAutocompleteValue(`${entryToEdit.firstName} ${entryToEdit.lastName}`);
        if (entryToEdit.photos && entryToEdit.photos.length > 0) {
            setProofMethod("photo");
        } else if (entryToEdit.signature) {
            setProofMethod("signature");
        } else {
            setProofMethod(null);
        }
    } else if (!initialDoctor && mounted) {
        resetForm();
    }
  }, [entryToEdit, initialDoctor, form, resetForm, mounted]);

  useEffect(() => {
    if (callType === 'planned' && plannedDoctorId) {
        const doctor = doctors.find(d => d.id === plannedDoctorId);
        if (doctor) {
            form.setValue("firstName", doctor.firstName);
            form.setValue("lastName", doctor.lastName);
            form.setValue("specialty", doctor.specialty);
            form.setValue("clinic", doctor.clinic);
            form.setValue("hacme", doctor.hacme);
        }
    } else if (callType === 'unplanned' && !entryToEdit) {
        form.setValue("plannedDoctorId", undefined);
    }
  }, [callType, plannedDoctorId, doctors, form, entryToEdit]);

  const handleAutocompleteSelect = (doctor: Doctor) => {
    form.setValue("firstName", doctor.firstName);
    form.setValue("lastName", doctor.lastName);
    form.setValue("specialty", doctor.specialty);
    form.setValue("clinic", doctor.clinic);
    form.setValue("hacme", doctor.hacme);
    setAutocompleteValue(`${doctor.firstName} ${doctor.lastName}`);
  };
  
  const handleAutocompleteChange = (value: string) => {
    setAutocompleteValue(value);
    if(value === '') {
        form.setValue("firstName", "");
        form.setValue("lastName", "");
        form.setValue("specialty", "");
        form.setValue("clinic", "");
        form.setValue("hacme", "NO");
    }
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const isEditMode = !!entryToEdit;
      const allEntries = [...masterEntries, ...offlineEntries];
      const newCoverageDate = values.coverageDate || new Date();

      if (!isEditMode) {
        const docFirstNameLower = (values.firstName || "").toLowerCase();
        const docLastNameLower = (values.lastName || "").toLowerCase();
        
        const doctorInMasterlist = doctors.find(
          (d) =>
            d.firstName.toLowerCase() === docFirstNameLower &&
            d.lastName.toLowerCase() === docLastNameLower
        );
        
        let coveragesInMonth = 0;
        let alreadyCoveredToday = false;

        for (const entry of allEntries) {
            if ((entry.firstName || "").toLowerCase() === docFirstNameLower && (entry.lastName || "").toLowerCase() === docLastNameLower) {
                const entryDate = entry.coverageDate ? parseISO(entry.coverageDate) : null;
                if (entryDate && isValid(entryDate)) {
                    if (isSameMonth(entryDate, newCoverageDate)) {
                        coveragesInMonth++;
                    }
                    if (isSameDay(entryDate, newCoverageDate)) {
                        alreadyCoveredToday = true;
                    }
                }
            }
        }

        if (alreadyCoveredToday) {
            toast({ variant: "destructive", title: "Duplicate Coverage", description: `Report for today already exists for this doctor.` });
            setIsSubmitting(false);
            return;
        }

        if (doctorInMasterlist) {
            const freqTarget = parseInt(doctorInMasterlist.frequency.replace('x', ''), 10);
            if (coveragesInMonth >= freqTarget) {
              toast({ variant: "destructive", title: "Submission Limit Reached", description: `${values.firstName} ${values.lastName} has met the monthly frequency limit.` });
              setIsSubmitting(false);
              return; 
            }
        }
      }

      // CRITICAL: Firestore throws errors if the payload contains undefined values.
      // We clean the payload to ensure all optional fields are either present or omitted.
      const cleanPayload = (obj: any) => {
          const result: any = {};
          Object.keys(obj).forEach(key => {
              const val = obj[key];
              if (val !== undefined && val !== null) {
                  result[key] = val;
              }
          });
          return result;
      };

      if (isEditMode) {
          const updateData = cleanPayload({
              ...values,
              id: entryToEdit!.id,
              coverageDate: values.coverageDate ? values.coverageDate.toISOString() : new Date().toISOString(),
          });
          onUpdate(updateData);
          toast({ title: "Update Successful", description: "Coverage report updated." });
          resetForm();
          onFormSubmit?.(entryToEdit!.isOffline ? false : isOnline);
          setIsSubmitting(false);
          return;
      }
      
      const { plannedDoctorId: _pId, ...restOfValues } = values;

      const savePayload = cleanPayload({
        ...restOfValues,
        coverageDate: values.coverageDate ? values.coverageDate.toISOString() : new Date().toISOString(),
      });

      const savedOnline = await onSave(savePayload);
      resetForm();
      onFormSubmit?.(savedOnline);
    } catch (error) {
      console.error("Submission failed:", error);
      toast({ variant: 'destructive', title: 'Submission Error', description: 'Check data or connection.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!mounted) return null;

  const isEditMode = !!entryToEdit;

  return (
    <>
    <Card className="h-full flex flex-col">
        <CardHeader>
            <CardTitle className="font-headline">{isEditMode ? 'Edit Coverage' : 'Log Coverage'}</CardTitle>
            <CardDescription>{isEditMode ? 'Update details below.' : 'Fill in the details below.'}</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-1 pr-6 pb-10">
              <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                  {!isEditMode && (
                    <div className="space-y-4">
                        <FormField
                            control={form.control}
                            name="callType"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel className="text-base font-semibold font-headline">Call Type</FormLabel>
                                <FormControl>
                                    <RadioGroup
                                    onValueChange={(value) => {
                                        field.onChange(value);
                                        form.reset({ 
                                            ...form.getValues(),
                                            callType: value as 'planned' | 'unplanned',
                                            plannedDoctorId: undefined,
                                            firstName: '', lastName: '', specialty: '', clinic: '', hacme: 'NO'
                                        });
                                        setAutocompleteValue('');
                                    }}
                                    value={field.value}
                                    className="flex gap-4 pt-2"
                                    >
                                    <FormItem className="flex items-center space-x-3 space-y-0">
                                        <FormControl><RadioGroupItem value="planned" /></FormControl>
                                        <FormLabel className="font-normal text-sm">Planned Call</FormLabel>
                                    </FormItem>
                                    <FormItem className="flex items-center space-x-3 space-y-0">
                                        <FormControl><RadioGroupItem value="unplanned" /></FormControl>
                                        <FormLabel className="font-normal text-sm">Unplanned Call</FormLabel>
                                    </FormItem>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                            />

                        {callType === 'planned' && (
                            <FormField
                                control={form.control}
                                name="plannedDoctorId"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel className="font-headline">Select a Planned Doctor</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                        <FormControl>
                                            <SelectTrigger>
                                            <SelectValue placeholder="Select a doctor from today's plan..." />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {todaysPlans.length > 0 ? (
                                                todaysPlans.map(plan => (
                                                    <SelectItem key={plan.id} value={plan.doctorId}>
                                                        {plan.doctorFirstName} {plan.doctorLastName}
                                                    </SelectItem>
                                                ))
                                            ) : (
                                                <div className="p-4 text-sm text-center text-muted-foreground">No doctors planned for today.</div>
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
                    </div>
                  )}


                  <div className={cn((callType === 'planned' && !plannedDoctorId && !isEditMode) && 'hidden', 'space-y-6')}>
                      
                      <div>
                          <h3 className="mb-4 text-lg font-semibold border-b font-headline">Provider Information</h3>
                          {(callType === 'unplanned' || isEditMode) && (
                            <div className="space-y-4 mb-4">
                              <FormItem>
                                  <FormLabel className="font-headline">Search Doctor</FormLabel>
                                  <Autocomplete
                                      doctors={doctors}
                                      value={autocompleteValue}
                                      onChange={handleAutocompleteChange}
                                      onSelect={handleAutocompleteSelect}
                                      placeholder="Search masterlist..."
                                      disabled={isEditMode}
                                  />
                                  <FormMessage>{form.formState.errors.firstName?.message}</FormMessage>
                              </FormItem>
                            </div>
                          )}
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                              <FormField
                                  control={form.control}
                                  name="firstName"
                                  render={({ field }) => (
                                  <FormItem>
                                      <FormLabel className="font-headline">First Name</FormLabel>
                                      <FormControl><Input {...field} disabled/></FormControl>
                                  </FormItem>
                                  )}
                              />
                              <FormField
                                  control={form.control}
                                  name="lastName"
                                  render={({ field }) => (
                                  <FormItem>
                                      <FormLabel className="font-headline">Last Name</FormLabel>
                                      <FormControl><Input {...field} disabled/></FormControl>
                                  </FormItem>
                                  )}
                              />
                              <FormField
                                  control={form.control}
                                  name="specialty"
                                  render={({ field }) => (
                                  <FormItem>
                                      <FormLabel className="font-headline">Specialty</FormLabel>
                                      <FormControl><Input {...field} disabled/></FormControl>
                                  </FormItem>
                                  )}
                              />
                              <FormField
                                  control={form.control}
                                  name="clinic"
                                  render={({ field }) => (
                                  <FormItem>
                                      <FormLabel className="font-headline">Clinic</FormLabel>
                                      <FormControl><Input {...field} disabled/></FormControl>
                                  </FormItem>
                                  )}
                              />
                              <FormField
                                  control={form.control}
                                  name="coverageType"
                                  render={({ field }) => (
                                  <FormItem>
                                      <FormLabel className="font-headline">Type of Coverage</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value || ""}>
                                      <FormControl>
                                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                          <SelectItem value="inbase">Inbase</SelectItem>
                                          <SelectItem value="outbase">Outbase</SelectItem>
                                          <SelectItem value="joint">Joint Call</SelectItem>
                                      </SelectContent>
                                      </Select>
                                      <FormMessage />
                                  </FormItem>
                                  )}
                              />
                               <FormField
                                  control={form.control}
                                  name="coverageDate"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="font-headline">Coverage Date</FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                <Button
                                                    variant={"outline"}
                                                    disabled={!!initialDate && !isEditMode}
                                                    className={cn(
                                                    "w-full pl-3 text-left font-normal",
                                                    !field.value && "text-muted-foreground"
                                                    )}
                                                >
                                                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                                    <CalendarIcon className="w-4 h-4 ml-auto opacity-50" />
                                                </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={field.value}
                                                    onSelect={field.onChange}
                                                    disabled={(date) => {
                                                        const today = startOfToday();
                                                        return isAfter(date, today);
                                                    }}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                          </div>
                      </div>

                      <Accordion type="multiple" defaultValue={['pre-call', 'post-call']} className="w-full">
                          <AccordionItem value="pre-call">
                              <AccordionTrigger className="text-lg font-semibold font-headline">Pre-call Planning</AccordionTrigger>
                              <AccordionContent className="pt-4">
                                  <div className="space-y-4">
                                      <FormField
                                          control={form.control}
                                          name="callObjective"
                                          render={({ field }) => (
                                              <FormItem>
                                              <FormLabel className="font-headline">Call Objective</FormLabel>
                                              <FormControl><Textarea placeholder="e.g. Discuss benefits" {...field} /></FormControl>
                                              <FormMessage />
                                              </FormItem>
                                          )}
                                      />
                                      <div className="grid grid-cols-2 gap-4">
                                          <FormField
                                              control={form.control}
                                              name="primaryProduct"
                                              render={({ field }) => (
                                                  <FormItem>
                                                  <FormLabel className="font-headline">Primary Product</FormLabel>
                                                  <FormControl>
                                                      <SearchableSelect 
                                                        options={dynamicProductList} 
                                                        value={field.value} 
                                                        onValueChange={(val) => {
                                                            field.onChange(val);
                                                            form.setValue("primarySampleName", "");
                                                            form.setValue("primaryProductQty", 0);
                                                        }}
                                                        placeholder="Search product..."
                                                      />
                                                  </FormControl>
                                                  <FormMessage />
                                                  </FormItem>
                                              )}
                                          />
                                          <FormField
                                              control={form.control}
                                              name="secondaryProduct"
                                              render={({ field }) => (
                                                  <FormItem>
                                                  <FormLabel className="font-headline">Secondary Product</FormLabel>
                                                  <FormControl>
                                                       <SearchableSelect 
                                                        options={dynamicProductList} 
                                                        value={field.value} 
                                                        onValueChange={(val) => {
                                                            field.onChange(val);
                                                            form.setValue("secondarySampleName", "");
                                                            form.setValue("secondaryProductQty", 0);
                                                        }}
                                                        placeholder="Search product..."
                                                      />
                                                  </FormControl>
                                                  <FormMessage />
                                                  </FormItem>
                                              )}
                                          />
                                      </div>
                                      <div className="grid grid-cols-2 gap-4">
                                          <FormField
                                              control={form.control}
                                              name="primarySampleName"
                                              render={({ field }) => (
                                                  <FormItem>
                                                      <FormLabel className="font-headline">Primary Samples</FormLabel>
                                                      <FormControl>
                                                          <SearchableSelect 
                                                            options={primarySampleOptions} 
                                                            value={field.value} 
                                                            onValueChange={field.onChange} 
                                                            placeholder="Search sample..."
                                                            disabled={!primaryProduct}
                                                            showBalance={true}
                                                          />
                                                      </FormControl>
                                                      <FormMessage />
                                                  </FormItem>
                                              )}
                                          />
                                          <FormField
                                              control={form.control}
                                              name="primaryProductQty"
                                              render={({ field }) => (
                                                  <FormItem>
                                                  <FormLabel className="font-headline">Quantity</FormLabel>
                                                  <FormControl><Input type="number" {...field} /></FormControl>
                                                  <FormMessage />
                                                  </FormItem>
                                              )}
                                          />
                                      </div>
                                      <div className="grid grid-cols-2 gap-4">
                                          <FormField
                                              control={form.control}
                                              name="secondarySampleName"
                                              render={({ field }) => (
                                                  <FormItem>
                                                      <FormLabel className="font-headline">Secondary Samples</FormLabel>
                                                      <FormControl>
                                                          <SearchableSelect 
                                                            options={secondarySampleOptions} 
                                                            value={field.value} 
                                                            onValueChange={field.onChange} 
                                                            placeholder="Search sample..."
                                                            disabled={!secondaryProduct}
                                                            showBalance={true}
                                                          />
                                                      </FormControl>
                                                      <FormMessage />
                                                  </FormItem>
                                              )}
                                          />
                                          <FormField
                                              control={form.control}
                                              name="secondaryProductQty"
                                              render={({ field }) => (
                                                  <FormItem>
                                                  <FormLabel className="font-headline">Quantity</FormLabel>
                                                  <FormControl><Input type="number" {...field} /></FormControl>
                                                  <FormMessage />
                                                  </FormItem>
                                              )}
                                          />
                                      </div>
                                      <div className="space-y-4 rounded-lg border p-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-medium font-headline text-primary">Reminder Products</h4>
                                            <Button type="button" size="sm" variant="ghost" onClick={() => append({})} disabled={fields.length >= 3}>
                                                <PlusCircle className="mr-2 h-4 w-4" /> Add Product
                                            </Button>
                                        </div>
                                        {fields.map((field, index) => (
                                            <div key={field.id} className="grid grid-cols-1 md:grid-cols-4 gap-2 p-2 border rounded-md relative">
                                                <FormField
                                                    control={form.control}
                                                    name={`reminderProducts.${index}.productName`}
                                                    render={({ field: f }) => (
                                                        <FormItem className="md:col-span-2">
                                                        <FormLabel className="text-xs">Product</FormLabel>
                                                        <FormControl>
                                                            <SearchableSelect 
                                                                options={dynamicProductList} 
                                                                value={f.value} 
                                                                onValueChange={(val) => {
                                                                    f.onChange(val);
                                                                    form.setValue(`reminderProducts.${index}.sampleName`, "");
                                                                    form.setValue(`reminderProducts.${index}.quantity`, 0);
                                                                }}
                                                                placeholder="Search..."
                                                            />
                                                        </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                                 <FormField
                                                    control={form.control}
                                                    name={`reminderProducts.${index}.sampleName`}
                                                    render={({ field: f }) => (
                                                        <FormItem className="md:col-span-2">
                                                        <FormLabel className="text-xs">Sample</FormLabel>
                                                        <FormControl>
                                                            <SearchableSelect 
                                                                options={allocations
                                                                    .filter(s => s.prodGroupProdSubGroup === reminderProducts?.[index]?.productName && !!s.displayMaterialName && s.displayMaterialName.trim() !== "")
                                                                    .map(s => {
                                                                        const used = Math.round(usedQuantities[s.displayMaterialName] || 0);
                                                                        const alloc = Math.round(s.allocationQuantity || 0);
                                                                        const balance = Math.max(0, alloc - used);
                                                                        return { value: s.displayMaterialName, label: s.displayMaterialName, balance };
                                                                    })
                                                                } 
                                                                value={f.value} 
                                                                onValueChange={f.onChange} 
                                                                placeholder="Search..."
                                                                disabled={!reminderProducts?.[index]?.productName}
                                                                showBalance={true}
                                                            />
                                                        </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                                 <FormField
                                                    control={form.control}
                                                    name={`reminderProducts.${index}.quantity`}
                                                    render={({ field }) => (
                                                        <FormItem><FormLabel className="text-xs">Qty</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                                                    )}
                                                />
                                                <Button type="button" variant="ghost" size="icon" className="absolute -top-2 -right-2 h-7 w-7" onClick={() => remove(index)}>
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                  </div>
                              </AccordionContent>
                          </AccordionItem>
                          <AccordionItem value="post-call">
                              <AccordionTrigger className="text-lg font-semibold font-headline">Post-call Analysis</AccordionTrigger>
                              <AccordionContent className="pt-4">
                                  <div className="space-y-4">
                                      <FormField control={form.control} name="topicsDiscussed" render={({ field }) => (<FormItem><FormLabel>Topics Discussed</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                                      <FormField control={form.control} name="doctorsIssue" render={({ field }) => (<FormItem><FormLabel>Doctor's Issue</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                                      <FormField control={form.control} name="planOfAction" render={({ field }) => (<FormItem><FormLabel>Plan of Action</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                                      <FormField control={form.control} name="whatWentWell" render={({ field }) => (<FormItem><FormLabel>What went well?</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                                      <FormField control={form.control} name="areasForImprovement" render={({ field }) => (<FormItem><FormLabel>Areas for Improvement</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                                  </div>
                              </AccordionContent>
                          </AccordionItem>
                      </Accordion>
                      
                      <div className="space-y-6">
                          <div>
                            <FormLabel className="text-lg font-semibold font-headline">Proof of Coverage</FormLabel>
                            <Card className="mt-2">
                                <CardContent className="p-4">
                                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                                    { (!photos || photos.length === 0) && !form.watch('signature') ? (
                                        <div className="grid grid-cols-2 gap-4">
                                            <Button type="button" variant="outline" className="h-24 flex-col gap-2" onClick={handleUploadClick}><Camera className="w-8 h-8" /> <span>Upload Photo</span></Button>
                                            <Button type="button" variant="outline" className="h-24 flex-col gap-2" onClick={handleSignatureButtonClick}><Edit className="w-8 h-8" /><span>Capture Signature</span></Button>
                                        </div>
                                    ) : (
                                        <div className="relative w-full p-2 border rounded-md min-h-[150px] flex items-center justify-center bg-muted/30">
                                            {photos && photos.length > 0 && proofMethod === 'photo' && (
                                                <Image src={photos[0]} alt="Proof" width={200} height={150} className="object-contain rounded-md" />
                                            )}
                                            {form.watch('signature') && proofMethod === 'signature' && (
                                                <Image src={form.watch('signature')!} alt="MD Signature" width={240} height={120} className="bg-white rounded-md p-1 border" />
                                            )}
                                            <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8" onClick={clearProof}><Trash2 className="w-4 h-4" /></Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            <FormMessage>{form.formState.errors.signature?.message}</FormMessage>
                          </div>

                          {coverageType === 'joint' && (
                              <div className="space-y-4">
                                  <FormField
                                      control={form.control}
                                      name="jointCallWith"
                                      render={({ field }) => (
                                      <FormItem>
                                          <FormLabel className="font-headline">Joint Call With</FormLabel>
                                          <Select onValueChange={field.onChange} value={field.value || ""}>
                                          <FormControl><SelectTrigger><SelectValue placeholder="Select companion..." /></SelectTrigger></FormControl>
                                          <SelectContent>
                                              {jointCallRoles.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                                          </SelectContent>
                                          </Select>
                                          <FormMessage />
                                      </FormItem>
                                      )}
                                  />
                                   <div className="space-y-2">
                                        <div className="flex items-center gap-4">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => setSignatureState({ 
                                                    isOpen: true, 
                                                    target: 'jointCallSignature', 
                                                    title: `${jointCallWith || 'Companion'} Signature`,
                                                    initialValue: form.getValues('jointCallSignature') 
                                                })}
                                            >
                                                <Edit className="mr-2 h-4 w-4" />
                                                {form.watch('jointCallSignature') ? `Edit Signature` : `Add Signature`}
                                            </Button>
                                            {form.watch('jointCallSignature') && (
                                                <div className="p-1 border rounded-md bg-white">
                                                    <Image src={form.watch('jointCallSignature')!} alt="Joint Signature" width={120} height={60} />
                                                </div>
                                            )}
                                        </div>
                                        <FormMessage>{form.formState.errors.jointCallSignature?.message}</FormMessage>
                                    </div>
                              </div>
                          )}
                      </div>
                      
                      <Button type="submit" size="lg" className="w-full font-headline" disabled={isSubmitting}>
                          {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2" />{isEditMode ? 'Update Report' : 'Save Report'}</>}
                      </Button>
                  </div>
              </form>
              </Form>
            </div>
          </ScrollArea>
        </CardContent>
    </Card>
    <SignatureDialog
        isOpen={signatureState.isOpen}
        onOpenChange={(open) => {
            setSignatureState(s => ({ ...s, isOpen: open }));
            if (!open && signatureState.target) form.trigger(signatureState.target);
        }}
        onSave={(sig) => {
            if (signatureState.target) {
                form.setValue(signatureState.target, sig, { shouldValidate: true, shouldDirty: true });
                form.trigger(signatureState.target);
            }
        }}
        initialSignature={signatureState.initialValue}
        title={signatureState.title}
    />
    </>
  )
}
