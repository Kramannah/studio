
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { format, isThisMonth, parseISO, isToday, isValid, isSameMonth } from "date-fns"
import { Save, ChevronDown, Camera, Trash2, X, ImagePlus, Edit } from "lucide-react"
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
import { SignaturePad, SignaturePadFullScreen } from "./signature-pad"
import type { CoverageEntry, Doctor, Plan, MarketingSample } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { Textarea } from "./ui/textarea"
import { RadioGroup, RadioGroupItem } from "./ui/radio-group"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog"
import { Autocomplete } from "./autocomplete"
import { Label } from "./ui/label"


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
  dsmSignature: z.string().nullable().optional(),
  jointCallWith: z.enum(["HOS", "GM", "PM", "SFE"]).optional(),
  jointCallSignature: z.string().nullable().optional(),
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
    if (!data.signature && (!data.photos || data.photos.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Either a signature or a photo is required as proof of coverage.",
            path: ["signature"],
        });
    }
    if (data.coverageType === 'joint') {
        if (!data.dsmSignature) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "A DSM signature is required for joint calls.",
                path: ["dsmSignature"],
            });
        }
        if (!data.jointCallWith) {
             ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Please select the role of the person you are with.",
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
  marketingSamples: MarketingSample[];
  masterEntries: CoverageEntry[];
  offlineEntries: CoverageEntry[];
  todaysPlans: Plan[];
  initialDoctor?: Doctor | null;
  entryToEdit?: (CoverageEntry & { isOffline?: boolean }) | null;
  onFormSubmit?: (isOnline: boolean) => void;
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
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [autocompleteValue, setAutocompleteValue] = useState('');
  const [proofMethod, setProofMethod] = useState<'photo' | 'signature' | null>(null);
  const [isSignaturePadOpen, setIsSignaturePadOpen] = useState(false);
  const [signatureFieldToUpdate, setSignatureFieldToUpdate] = useState<'signature' | 'dsmSignature' | 'jointCallSignature' | null>(null);
  
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
      jointCallSignature: null,
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
  const jointCallWith = form.watch("jointCallWith");
  const plannedDoctorId = form.watch("plannedDoctorId");
  const photos = form.watch("photos");
  const primaryProduct = form.watch("primaryProduct");
  const secondaryProduct = form.watch("secondaryProduct");
  const signature = form.watch("signature");
  const dsmSignature = form.watch("dsmSignature");
  const jointCallSignature = form.watch("jointCallSignature");

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
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      toast({
        title: 'Camera Access Granted',
        description: 'You can now take a selfie.',
      });
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        variant: 'destructive',
        title: 'Camera Access Denied',
        description: 'Please enable camera permissions in your browser settings.',
      });
      setIsCameraOpen(false); // Close dialog if permission is denied
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
  
  useEffect(() => {
    if (initialDoctor && !entryToEdit) {
      const isPlanned = todaysPlans.some(p => p.doctorId === initialDoctor.id);
      form.reset({
        ...form.getValues(),
        callType: isPlanned ? 'planned' : 'unplanned',
        plannedDoctorId: isPlanned ? initialDoctor.id : undefined,
        firstName: initialDoctor.firstName,
        lastName: initialDoctor.lastName,
        specialty: initialDoctor.specialty,
        clinic: initialDoctor.clinic,
        hacme: initialDoctor.hacme,
        coverageDate: new Date(),
      });
      if (!isPlanned) {
        setAutocompleteValue(`${initialDoctor.firstName} ${initialDoctor.lastName}`);
      }
    }
  }, [initialDoctor, entryToEdit, form, todaysPlans]);
  
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
      jointCallWith: undefined,
      jointCallSignature: null,
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
    setProofMethod(null);
  }, [form]);

  useEffect(() => {
    if (entryToEdit) {
        const coverageDate = typeof entryToEdit.coverageDate === 'string' ? parseISO(entryToEdit.coverageDate) : entryToEdit.coverageDate;
        form.reset({
            ...entryToEdit,
            coverageDate: isValid(coverageDate) ? coverageDate : new Date(),
        });
        setAutocompleteValue(`${entryToEdit.firstName} ${entryToEdit.lastName}`);
        if (entryToEdit.photos && entryToEdit.photos.length > 0) {
            setProofMethod("photo");
        } else if (entryToEdit.signature) {
            setProofMethod("signature");
        }
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
    }
  }, [callType, plannedDoctorId, doctors, form, entryToEdit]);

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

  const handleProofMethodChange = (value: 'photo' | 'signature') => {
    setProofMethod(value);
    if (value === 'photo') {
        form.setValue('signature', null);
        handleOpenCamera();
    } else {
        form.setValue('photos', []);
        openSignaturePad('signature');
    }
  }

  const openSignaturePad = (fieldName: 'signature' | 'dsmSignature' | 'jointCallSignature') => {
    setSignatureFieldToUpdate(fieldName);
    setIsSignaturePadOpen(true);
  }

  const handleSaveSignature = (dataUrl: string | null) => {
      if(signatureFieldToUpdate) {
          form.setValue(signatureFieldToUpdate, dataUrl);
      }
      setIsSignaturePadOpen(false);
      setSignatureFieldToUpdate(null);
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const isEditMode = !!entryToEdit;

    if (isEditMode) {
        onUpdate({
            ...values,
            id: entryToEdit.id,
            coverageDate: values.coverageDate ? values.coverageDate.toISOString() : new Date().toISOString(),
        });
        toast({ title: "Update Successful", description: "Your changes to the coverage report have been saved." });
        resetForm();
        onFormSubmit?.(entryToEdit.isOffline ? false : isOnline);
        return;
    }

    const doctorInMasterlist = doctors.find(
      (d) =>
        d.firstName.toLowerCase() === values.firstName?.toLowerCase() &&
        d.lastName.toLowerCase() === values.lastName?.toLowerCase()
    );

    let finalValues = { ...values };
    if (doctorInMasterlist) {
        finalValues.hacme = doctorInMasterlist.hacme;
        form.setValue('hacme', doctorInMasterlist.hacme); // Ensure form state is updated too
    }

    const pilotTestingEndDate = new Date('2024-09-14T00:00:00'); // End of Sept 13
    const now = new Date();
    
    if (values.callType === 'unplanned' && now >= pilotTestingEndDate) {
      const allTodaysEntries = [...masterEntries, ...offlineEntries].filter(e => {
        const submittedDate = typeof e.submittedAt === 'string' ? parseISO(e.submittedAt) : e.submittedAt;
        return isValid(submittedDate) && isToday(submittedDate);
      });
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
      const newCoverageDate = values.coverageDate || new Date();
      
      const allEntries = [...masterEntries, ...offlineEntries];
      const coveragesInMonth = allEntries.filter(entry => {
        const entryCoverageDate = entry.coverageDate ? parseISO(entry.coverageDate) : new Date(0);
        return entry.firstName?.toLowerCase() === values.firstName?.toLowerCase() &&
               entry.lastName?.toLowerCase() === values.lastName?.toLowerCase() &&
               isValid(entryCoverageDate) && isSameMonth(entryCoverageDate, newCoverageDate);
      }).length;

      if (coveragesInMonth >= frequency) {
        toast({
          variant: "destructive",
          title: "Submission Limit Reached",
          description: `${values.firstName} ${values.lastName} has already met the monthly coverage frequency of ${doctorInMasterlist.frequency} for ${format(newCoverageDate, 'MMMM yyyy')}.`,
        });
        return; 
      }
    }
    
    const { plannedDoctorId, ...restOfValues } = finalValues;

    const savedOnline = await onSave({
      ...restOfValues,
      coverageDate: values.coverageDate ? values.coverageDate.toISOString() : new Date().toISOString(),
    });
    resetForm();
    onFormSubmit?.(savedOnline);
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
                         {(callType === 'unplanned' || isEditMode) && (
                          <div className="space-y-4 mb-4">
                            <FormItem>
                                <FormLabel className="font-headline">Search Doctor</FormLabel>
                                <Autocomplete
                                    doctors={doctors}
                                    value={autocompleteValue}
                                    onChange={handleAutocompleteChange}
                                    onSelect={handleAutocompleteSelect}
                                    placeholder="Type to search for a doctor from your masterlist..."
                                    disabled={isEditMode}
                                />
                                <FormMessage>{form.formState.errors.firstName?.message}</FormMessage>
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
                                        <Input placeholder="John" {...field} disabled/>
                                    </FormControl>
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
                                        <Input placeholder="Doe" {...field} disabled/>
                                    </FormControl>
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
                                        <Input placeholder="Cardiology" {...field} disabled/>
                                    </FormControl>
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
                                        <Input placeholder="Community General Hospital" {...field} disabled/>
                                    </FormControl>
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
                                    <Select onValueChange={field.onChange} value={field.value} disabled>
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
                        <div>
                            <FormLabel className="text-lg font-semibold font-headline">Proof of Coverage</FormLabel>
                            <Card className="mt-2">
                                <CardContent className="p-4">
                                    <RadioGroup
                                        value={proofMethod || ""}
                                        onValueChange={handleProofMethodChange}
                                        className="flex gap-4 pt-2"
                                    >
                                        <FormItem className="flex items-center space-x-3 space-y-0">
                                            <FormControl>
                                                <RadioGroupItem value="photo" />
                                            </FormControl>
                                            <FormLabel className="font-normal text-sm">Selfie Photo</FormLabel>
                                        </FormItem>
                                        <FormItem className="flex items-center space-x-3 space-y-0">
                                            <FormControl>
                                                <RadioGroupItem value="signature" />
                                            </FormControl>
                                            <FormLabel className="font-normal text-sm">MD Signature</FormLabel>
                                        </FormItem>
                                    </RadioGroup>

                                    {proofMethod === 'photo' && photos && photos.length > 0 && (
                                        <div className="relative w-full max-w-xs mx-auto mt-4">
                                            <Image src={photos[0]} alt="Proof" width={400} height={300} className="object-cover rounded-md" />
                                            <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2" onClick={() => form.setValue('photos', [])}>
                                                <Trash2 />
                                            </Button>
                                        </div>
                                    )}

                                    {proofMethod === 'signature' && signature && (
                                        <div className="mt-4 space-y-2">
                                            <Label>MD Signature</Label>
                                            <div className="p-2 border rounded-md bg-muted w-fit">
                                                <Image src={signature} alt="signature" width={200} height={100} className="bg-white rounded" />
                                            </div>
                                            <Button variant="outline" size="sm" onClick={() => openSignaturePad('signature')}><Edit className="mr-2"/> Edit Signature</Button>
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
                                        <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                            <SelectValue placeholder="Select role..." />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="HOS">HOS</SelectItem>
                                            <SelectItem value="GM">GM</SelectItem>
                                            <SelectItem value="PM">PM</SelectItem>
                                            <SelectItem value="SFE">SFE</SelectItem>
                                        </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                                 <div className="space-y-2">
                                    <Label>DSM Signature</Label>
                                    {dsmSignature ? (
                                        <div className="p-2 border rounded-md bg-muted w-fit">
                                            <Image src={dsmSignature} alt="DSM signature" width={200} height={100} className="bg-white rounded" />
                                        </div>
                                    ) : <p className="text-sm text-muted-foreground">No signature provided.</p>}
                                    <Button type="button" variant="outline" size="sm" onClick={() => openSignaturePad('dsmSignature')}>
                                        <Edit className="mr-2"/> {dsmSignature ? 'Edit' : 'Add'} Signature
                                    </Button>
                                    <FormMessage>{form.formState.errors.dsmSignature?.message}</FormMessage>
                                </div>
                                <div className="space-y-2">
                                    <Label>{jointCallWith || 'Companion'} Signature</Label>
                                    {jointCallSignature ? (
                                        <div className="p-2 border rounded-md bg-muted w-fit">
                                            <Image src={jointCallSignature} alt="Companion signature" width={200} height={100} className="bg-white rounded" />
                                        </div>
                                    ) : <p className="text-sm text-muted-foreground">No signature provided.</p>}
                                    <Button type="button" variant="outline" size="sm" onClick={() => openSignaturePad('jointCallSignature')}>
                                        <Edit className="mr-2"/> {jointCallSignature ? 'Edit' : 'Add'} Signature
                                    </Button>
                                    <FormMessage>{form.formState.errors.jointCallSignature?.message}</FormMessage>
                                </div>
                            </div>
                        )}
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
        <SignaturePadFullScreen 
            open={isSignaturePadOpen}
            onClose={() => setIsSignaturePadOpen(false)}
            onSave={handleSaveSignature}
            value={signatureFieldToUpdate ? form.getValues(signatureFieldToUpdate) : null}
        />
    </Card>
  )
}

    