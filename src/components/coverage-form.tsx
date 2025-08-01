
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { format, isThisMonth, parseISO, isToday } from "date-fns"
import { Save, ChevronDown, Camera, Upload, Trash2, X } from "lucide-react"
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
import { SignaturePad } from "./signature-pad"
import type { CoverageEntry, Doctor, Plan, MarketingSample } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { Textarea } from "./ui/textarea"
import { RadioGroup, RadioGroupItem } from "./ui/radio-group"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog"
import { Autocomplete } from "./autocomplete"


const formSchema = z.object({
  id: z.string().optional(),
  callType: z.enum(["unplanned", "planned"]),
  plannedDoctorId: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  specialty: z.string(),
  clinic: z.string(),
  hacme: z.enum(["YES", "NO"]),
  coverageType: z.enum(["inbase", "outbase", "joint"]),
  coverageDate: z.date(),
  photos: z.array(z.string()).max(1, "You can only capture one photo.").optional(),
  signature: z.string().nullable(),
  dsmSignature: z.string().nullable(),
  callObjective: z.string().optional(),
  primaryProduct: z.string().optional(),
  secondaryProduct: z.string().optional(),
  primarySampleName: z.string().optional(),
  primaryProductQty: z.coerce.number().optional(),
  primaryProductBal: z.coerce.number().optional(),
  secondarySampleName: z.string().optional(),
  secondaryProductQty: z.coerce.number().optional(),
  secondaryProductBal: z.coerce.number().optional(),
  topicsDiscussed: z.string().optional(),
  doctorsIssue: z.string().optional(),
  planOfAction: z.string().optional(),
  whatWentWell: z.string().optional(),
  areasForImprovement: z.string().optional(),
  isOffline: z.boolean().optional(),
}).superRefine((data, ctx) => {
    if (data.callType === 'planned' && !data.plannedDoctorId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Please select a planned doctor.",
            path: ["plannedDoctorId"],
        });
    }
    if (data.callType === 'unplanned') {
        if (!data.firstName || data.firstName.length < 2) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "First name is required", path: ["firstName"] });
        }
        if (!data.lastName || data.lastName.length < 2) {
             ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Last name is required", path: ["lastName"] });
        }
    }
    if (!data.signature && (!data.photos || data.photos.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Either a signature or a photo is required as proof of coverage.",
            path: ["signature"],
        });
    }
    if (data.coverageType === 'joint' && !data.dsmSignature) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A DSM signature is required for joint calls.",
            path: ["dsmSignature"],
        });
    }
});


type CoverageFormProps = {
  onSave: (entry: Omit<CoverageEntry, 'id' | 'submittedAt'>) => void;
  onUpdate: (entry: Omit<CoverageEntry, 'submittedAt'>) => void;
  isOnline: boolean;
  doctors: Doctor[];
  marketingSamples: MarketingSample[];
  masterEntries: CoverageEntry[];
  offlineEntries: Plan[];
  todaysPlans: Plan[];
  initialDoctor?: Doctor | null;
  entryToEdit?: (CoverageEntry & { isOffline?: boolean }) | null;
  onFormSubmit?: () => void;
}

const MAX_UNPLANNED_CALLS = 5;

const productList = [
  "Anti-Fungals-Difluvid",
  "Anti-Fungals-Inox",
  "Anti-Fungals-Ketovid",
  "Anti-Fungals-Terbivid",
  "Antihistamine-Ricam Syrup",
  "Antihistamine-Ricam Tablet",
  "Anti-Viral-Hofovir",
  "Anti-Viral-Virest Tab",
  "CNS/Pain-Biovid Forte",
  "CNS/Pain-Celevid",
  "CNS/Pain-Pengesic",
  "Dermatology-Calazin",
  "Dermatology-Hovicor",
  "Endocrine-Dapavid",
  "Endocrine-Hovideuform 500",
  "Endocrine-Hovideuform XRS5",
  "Gastro-Gascovid Double Action",
  "Gastro-Hovizol",
  "Tocovid-Tocovid 100mg",
  "Tocovid-Tocovid 200mg",
  "Tocovid-Tocovid 50mg",
  "Tocovid-Tocovid D'Repair",
  "Tocovid-Tocovid Vitality",
];


export function CoverageForm({ onSave, onUpdate, isOnline, doctors, marketingSamples, masterEntries, initialDoctor, onFormSubmit, todaysPlans, offlineEntries, entryToEdit }: CoverageFormProps) {
  const { toast } = useToast()
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [autocompleteValue, setAutocompleteValue] = useState('');
  const [isUnplannedManual, setIsUnplannedManual] = useState(false);
  
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
      coverageDate: new Date(),
      photos: [],
      signature: null,
      dsmSignature: null,
      callObjective: "",
      primaryProduct: "",
      secondaryProduct: "",
      primarySampleName: "",
      primaryProductQty: 0,
      primaryProductBal: 0,
      secondarySampleName: "",
      secondaryProductQty: 0,
      secondaryProductBal: 0,
      topicsDiscussed: "",
      doctorsIssue: "",
      planOfAction: "",
      whatWentWell: "",
      areasForImprovement: "",
      isOffline: false,
    },
  })

  const callType = form.watch("callType");
  const coverageType = form.watch("coverageType");
  const plannedDoctorId = form.watch("plannedDoctorId");
  const photos = form.watch("photos");
  const primaryProduct = form.watch("primaryProduct");
  const secondaryProduct = form.watch("secondaryProduct");

  const primarySampleOptions = useMemo(() => {
    if (!primaryProduct) return [];
    return marketingSamples.filter(s => s.productGroup === primaryProduct);
  }, [primaryProduct, marketingSamples]);

  const secondarySampleOptions = useMemo(() => {
    if (!secondaryProduct) return [];
    return marketingSamples.filter(s => s.productGroup === secondaryProduct);
  }, [secondaryProduct, marketingSamples]);

  useEffect(() => {
    form.setValue("primarySampleName", undefined);
  }, [primaryProduct, form]);

  useEffect(() => {
    form.setValue("secondarySampleName", undefined);
  }, [secondaryProduct, form]);

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };
  
  const handleOpenCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraOpen(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        variant: 'destructive',
        title: 'Camera Access Denied',
        description: 'Please enable camera permissions in your browser settings.',
      });
    }
  };

  const handleCloseCamera = () => {
    stopCamera();
    setIsCameraOpen(false);
  };

  const handleCapture = () => {
    const video = videoRef.current;
    if (video) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        form.setValue('photos', [dataUrl]);
      }
      handleCloseCamera();
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        form.setValue('photos', [dataUrl]);
      };
      reader.readAsDataURL(file);
    }
  };
  
  useEffect(() => {
    if (initialDoctor && !entryToEdit) {
      form.reset({
        ...form.getValues(),
        callType: 'planned',
        plannedDoctorId: initialDoctor.id,
        firstName: initialDoctor.firstName,
        lastName: initialDoctor.lastName,
        specialty: initialDoctor.specialty,
        clinic: initialDoctor.clinic,
        hacme: initialDoctor.hacme,
        coverageDate: new Date(),
      });
    }
  }, [initialDoctor, entryToEdit, form]);
  
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
      dsmSignature: null,
      callObjective: "",
      primaryProduct: "",
      secondaryProduct: "",
      primarySampleName: "",
      primaryProductQty: 0,
      primaryProductBal: 0,
      secondarySampleName: "",
      secondaryProductQty: 0,
      secondaryProductBal: 0,
      topicsDiscussed: "",
      doctorsIssue: "",
      planOfAction: "",
      whatWentWell: "",
      areasForImprovement: "",
    });
    setAutocompleteValue('');
    setIsUnplannedManual(false);
  }, [form]);

  useEffect(() => {
    if (entryToEdit) {
      form.reset({
        ...entryToEdit,
        coverageDate: parseISO(entryToEdit.coverageDate),
      });
    } else if (!initialDoctor) {
      resetForm();
    }
  }, [entryToEdit, initialDoctor, form, resetForm]);

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
        form.setValue("hacme", "NO"); // Reset HACME for unplanned
        if (!isUnplannedManual) {
            form.setValue("firstName", "");
            form.setValue("lastName", "");
            form.setValue("specialty", "");
            form.setValue("clinic", "");
        }
    }
  }, [callType, plannedDoctorId, doctors, form, entryToEdit, isUnplannedManual]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const handleAutocompleteSelect = (doctor: Doctor) => {
    form.setValue("firstName", doctor.firstName);
    form.setValue("lastName", doctor.lastName);
    form.setValue("specialty", doctor.specialty);
    form.setValue("clinic", doctor.clinic);
    form.setValue("hacme", doctor.hacme);
    setAutocompleteValue(`${doctor.firstName} ${doctor.lastName}`);
    setIsUnplannedManual(true);
  };
  
  const handleAutocompleteChange = (value: string) => {
    setAutocompleteValue(value);
    if (isUnplannedManual) {
      setIsUnplannedManual(false);
      form.setValue("firstName", "");
      form.setValue("lastName", "");
      form.setValue("specialty", "");
      form.setValue("clinic", "");
      form.setValue("hacme", "NO");
    }
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {

    if(entryToEdit){
      onUpdate({
        ...values,
        id: entryToEdit.id,
        coverageDate: values.coverageDate.toISOString(),
      });
      resetForm();
      onFormSubmit?.();
      return;
    }


    const doctorInMasterlist = doctors.find(
      (d) =>
        d.firstName.toLowerCase() === values.firstName.toLowerCase() &&
        d.lastName.toLowerCase() === values.lastName.toLowerCase()
    );

    let finalValues = { ...values };
    if (doctorInMasterlist) {
        finalValues.hacme = doctorInMasterlist.hacme;
    }

    if (values.callType === 'unplanned') {
        const allTodaysEntries = [...masterEntries, ...offlineEntries].filter(e => isToday(parseISO(e.submittedAt)));
        const todaysUnplannedCalls = allTodaysEntries.filter(e => e.callType === 'unplanned').length;

        if (todaysUnplannedCalls >= MAX_UNPLANNED_CALLS) {
            toast({
                variant: "destructive",
                title: "Unplanned Call Limit Reached",
                description: `You can only submit a maximum of ${MAX_UNPLANNED_CALLS} unplanned calls per day.`,
            });
            return;
        }
    }

    if (doctorInMasterlist) {
      const frequency = parseInt(doctorInMasterlist.frequency.replace('x', ''), 10);
      
      const allEntries = [...masterEntries, ...offlineEntries];
      const coveragesThisMonth = allEntries.filter(entry => 
        entry.firstName.toLowerCase() === values.firstName.toLowerCase() &&
        entry.lastName.toLowerCase() === values.lastName.toLowerCase() &&
        isThisMonth(parseISO(entry.submittedAt))
      ).length;

      if (coveragesThisMonth >= frequency) {
        toast({
          variant: "destructive",
          title: "Submission Limit Reached",
          description: `${values.firstName} ${values.lastName} has already met the monthly coverage frequency of ${doctorInMasterlist.frequency}.`,
        });
        return; 
      }
    }
    
    const { plannedDoctorId, ...restOfValues } = finalValues;

    onSave({
      ...restOfValues,
      coverageDate: values.coverageDate.toISOString(),
    });
    resetForm();
    onFormSubmit?.();
  }

  const isEditMode = !!entryToEdit;

  return (
    <Card>
        <CardHeader>
            <CardTitle className="font-headline">{isEditMode ? 'Edit Coverage Event' : 'Log New Coverage Event'}</CardTitle>
            <CardDescription>{isEditMode ? 'Update the details for this coverage event below.' : 'Select the call type and fill in the details below.'}</CardDescription>
        </CardHeader>
        <CardContent>
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
                                      setIsUnplannedManual(false);
                                  }}
                                  value={field.value}
                                  className="flex gap-4 pt-2"
                                  >
                                  <FormItem className="flex items-center space-x-3 space-y-0">
                                      <FormControl>
                                      <RadioGroupItem value="unplanned" />
                                      </FormControl>
                                      <FormLabel className="font-normal text-sm">
                                      Unplanned Call
                                      </FormLabel>
                                  </FormItem>
                                  <FormItem className="flex items-center space-x-3 space-y-0">
                                      <FormControl>
                                      <RadioGroupItem value="planned" />
                                      </FormControl>
                                      <FormLabel className="font-normal text-sm">
                                      Planned Call
                                      </FormLabel>
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
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                         {callType === 'unplanned' && !isEditMode && (
                          <div className="space-y-4 mb-4">
                            <FormItem>
                                <FormLabel className="font-headline">Search Doctor</FormLabel>
                                <Autocomplete
                                    doctors={doctors}
                                    value={autocompleteValue}
                                    onChange={handleAutocompleteChange}
                                    onSelect={handleAutocompleteSelect}
                                    placeholder="Type to search for a doctor..."
                                />
                            </FormItem>
                          </div>
                        )}
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="firstName"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-headline">First Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="John" {...field} disabled={callType === 'planned' || isEditMode || (callType === 'unplanned' && !isUnplannedManual && !!autocompleteValue) }/>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="lastName"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-headline">Last Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Doe" {...field} disabled={callType === 'planned' || isEditMode || (callType === 'unplanned' && !isUnplannedManual && !!autocompleteValue)} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="specialty"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-headline">Specialty</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Cardiology" {...field} disabled={callType === 'planned' || isEditMode || (callType === 'unplanned' && !isUnplannedManual && !!autocompleteValue)}/>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="clinic"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-headline">Clinic</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Community General Hospital" {...field} disabled={callType === 'planned' || isEditMode || (callType === 'unplanned' && !isUnplannedManual && !!autocompleteValue)}/>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="coverageType"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-headline">Type of Coverage</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                        <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
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
                                name="hacme"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-headline">HACME</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value} disabled={callType === 'planned' || isEditMode || (callType === 'unplanned' && !isUnplannedManual && !!autocompleteValue)}>
                                    <FormControl>
                                        <SelectTrigger>
                                        <SelectValue placeholder="Select..." />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="YES">YES</SelectItem>
                                        <SelectItem value="NO">NO</SelectItem>
                                    </SelectContent>
                                    </Select>
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
                                            <FormControl>
                                                <Textarea placeholder="e.g. Discuss new product benefits" {...field} />
                                            </FormControl>
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
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                        <SelectValue placeholder="Select..." />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {productList.map(product => (
                                                        <SelectItem key={product} value={product}>{product}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
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
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                        <SelectValue placeholder="Select..." />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {productList.map(product => (
                                                        <SelectItem key={product} value={product}>{product}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
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
                                                    <Select onValueChange={field.onChange} value={field.value} disabled={!primaryProduct}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select sample..." />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {primarySampleOptions.map(sample => (
                                                                <SelectItem key={sample.id} value={sample.materialName}>{sample.materialName}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
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
                                                <FormControl>
                                                    <Input type="number" placeholder="0" {...field} />
                                                </FormControl>
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
                                                    <Select onValueChange={field.onChange} value={field.value} disabled={!secondaryProduct}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select sample..." />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {secondarySampleOptions.map(sample => (
                                                                <SelectItem key={sample.id} value={sample.materialName}>{sample.materialName}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
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
                                                <FormControl>
                                                    <Input type="number" placeholder="0" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="post-call">
                            <AccordionTrigger className="text-lg font-semibold font-headline">Post-call Analysis</AccordionTrigger>
                            <AccordionContent className="pt-4">
                                <div className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="topicsDiscussed"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel className="font-headline">Topics Discussed</FormLabel>
                                            <FormControl>
                                                <Textarea placeholder="..." {...field} />
                                            </FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="doctorsIssue"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel className="font-headline">Doctor's Issue / Concern</FormLabel>
                                            <FormControl>
                                                <Textarea placeholder="..." {...field} />
                                            </FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="planOfAction"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel className="font-headline">Plan of Action</FormLabel>
                                            <FormControl>
                                                <Textarea placeholder="..." {...field} />
                                            </FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="whatWentWell"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel className="font-headline">What went well?</FormLabel>
                                            <FormControl>
                                                <Textarea placeholder="..." {...field} />
                                            </FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="areasForImprovement"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel className="font-headline">Areas for Improvement</FormLabel>
                                            <FormControl>
                                                <Textarea placeholder="..." {...field} />
                                            </FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                    
                    <div className="space-y-6">
                        <FormField
                            control={form.control}
                            name="photos"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-lg font-semibold font-headline">Photo Proof</FormLabel>
                                    <div className="p-4 border rounded-md">
                                        {photos && photos.length > 0 ? (
                                             <div className="relative w-full max-w-xs mx-auto">
                                                <Image src={photos[0]} alt="Proof" width={400} height={300} className="object-cover rounded-md" />
                                                <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2" onClick={() => form.setValue('photos', [])}>
                                                    <Trash2 />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center gap-4">
                                                <p className="text-sm text-center text-muted-foreground">Attach a photo as proof of visit.</p>
                                                <div className="flex gap-2">
                                                    <Button type="button" onClick={handleOpenCamera}>
                                                        <Camera className="mr-2" />
                                                        Capture Photo
                                                    </Button>
                                                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                                                        <Upload className="mr-2" />
                                                        Upload Photo
                                                    </Button>
                                                    <FormControl>
                                                      <Input 
                                                        type="file" 
                                                        className="hidden" 
                                                        ref={fileInputRef} 
                                                        accept="image/*"
                                                        onChange={handleFileUpload}
                                                      />
                                                    </FormControl>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-1 gap-6">
                            <FormField
                                control={form.control}
                                name="signature"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel className="text-lg font-semibold font-headline">MD Signature</FormLabel>
                                    <FormControl>
                                        <SignaturePad value={field.value} onChange={(value) => field.onChange(value)} className="h-[250px] w-full" />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                             {coverageType === 'joint' && (
                                <FormField
                                    control={form.control}
                                    name="dsmSignature"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel className="text-lg font-semibold font-headline">DSM Signature</FormLabel>
                                        <FormControl>
                                            <SignaturePad value={field.value} onChange={(value) => field.onChange(value)} className="h-[250px] w-full" />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                        </div>
                    </div>
                    
                    <Button type="submit" size="lg" className="w-full font-headline">
                        <Save className="mr-2" />
                        {isEditMode ? 'Update Coverage Report' : 'Save Coverage Report'}
                    </Button>
                </div>
            </form>
            </Form>
        </CardContent>
         <Dialog open={isCameraOpen} onOpenChange={handleCloseCamera}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Capture Photo</DialogTitle>
                </DialogHeader>
                <div className="relative">
                    <video ref={videoRef} className="w-full rounded-md" autoPlay muted playsInline />
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2" onClick={handleCloseCamera}>
                        <X />
                    </Button>
                </div>
                <DialogFooter>
                    <Button onClick={handleCapture} className="w-full">
                        <Camera className="mr-2" />
                        Capture
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </Card>
  )
}
