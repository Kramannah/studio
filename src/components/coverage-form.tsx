
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { format, isThisMonth, parseISO, isToday } from "date-fns"
import { Save, Eraser } from "lucide-react"
import React, { useState, useEffect, useCallback } from "react"

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
import type { CoverageEntry, Doctor, Plan } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { Textarea } from "./ui/textarea"
import { RadioGroup, RadioGroupItem } from "./ui/radio-group"

const formSchema = z.object({
  callType: z.enum(["unplanned", "planned"]),
  plannedDoctorId: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  specialty: z.string(),
  clinic: z.string(),
  coverageType: z.enum(["inbase", "outbase"]),
  coverageDate: z.date(),
  photos: z.array(z.string()).max(1, "You can only capture one photo.").optional(),
  signature: z.string().nullable(),
  callObjective: z.string().optional(),
  primaryProduct: z.string().optional(),
  secondaryProduct: z.string().optional(),
  primaryProductQty: z.coerce.number().optional(),
  primaryProductBal: z.coerce.number().optional(),
  secondaryProductQty: z.coerce.number().optional(),
  secondaryProductBal: z.coerce.number().optional(),
  topicsDiscussed: z.string().optional(),
  doctorsIssue: z.string().optional(),
  planOfAction: z.string().optional(),
  whatWentWell: z.string().optional(),
  areasForImprovement: z.string().optional(),
  reminderProduct: z.string().optional(),
  reminderProductQty: z.coerce.number().optional(),
  reminderProductBal: z.coerce.number().optional(),
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
    if (!data.signature) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A signature is required as proof of coverage.",
        path: ["signature"], 
      });
    }
});


type CoverageFormProps = {
  onSave: (entry: Omit<CoverageEntry, 'id' | 'submittedAt'>) => void;
  isOnline: boolean;
  doctors: Doctor[];
  masterEntries: CoverageEntry[];
  offlineEntries: CoverageEntry[];
  todaysPlans: Plan[];
  initialDoctor?: Doctor | null;
  onFormSubmit?: () => void;
}

const MAX_UNPLANNED_CALLS = 5;

const SectionHeader = ({ title, className }: { title: string, className?: string }) => (
    <div className={cn("py-1 px-2 bg-blue-900 text-white", className)}>
        <h3 className="text-sm font-bold text-center uppercase">{title}</h3>
    </div>
);

export function CoverageForm({ onSave, isOnline, doctors, masterEntries, initialDoctor, onFormSubmit, todaysPlans, offlineEntries }: CoverageFormProps) {
  const { toast } = useToast()
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      callType: "unplanned",
      firstName: "",
      lastName: "",
      specialty: "",
      clinic: "",
      coverageType: "inbase",
      coverageDate: new Date(),
      photos: [],
      signature: null,
      callObjective: "",
      primaryProduct: "",
      secondaryProduct: "",
      primaryProductQty: 0,
      primaryProductBal: 0,
      secondaryProductQty: 0,
      secondaryProductBal: 0,
      reminderProduct: "",
      reminderProductQty: 0,
      reminderProductBal: 0,
      topicsDiscussed: "",
      doctorsIssue: "",
      planOfAction: "",
      whatWentWell: "",
      areasForImprovement: "",
    },
  })

  const callType = form.watch("callType");
  const plannedDoctorId = form.watch("plannedDoctorId");
  const selectedDoctor = callType === 'planned' 
    ? doctors.find(d => d.id === plannedDoctorId) 
    : doctors.find(d => d.firstName.toLowerCase() === form.watch('firstName').toLowerCase() && d.lastName.toLowerCase() === form.watch('lastName').toLowerCase());


  useEffect(() => {
    if (initialDoctor) {
      form.reset({
        ...form.getValues(),
        callType: 'planned',
        plannedDoctorId: initialDoctor.id,
        firstName: initialDoctor.firstName,
        lastName: initialDoctor.lastName,
        specialty: initialDoctor.specialty,
        clinic: initialDoctor.clinic,
        coverageDate: new Date(),
      });
    }
  }, [initialDoctor, form]);

  useEffect(() => {
    if (callType === 'planned' && plannedDoctorId) {
        const doctor = doctors.find(d => d.id === plannedDoctorId);
        if (doctor) {
            form.setValue("firstName", doctor.firstName);
            form.setValue("lastName", doctor.lastName);
            form.setValue("specialty", doctor.specialty);
            form.setValue("clinic", doctor.clinic);
        }
    } else if (callType === 'unplanned') {
        form.setValue("plannedDoctorId", undefined);
    }
  }, [callType, plannedDoctorId, doctors, form]);


  const handleDoctorSelect = useCallback((doctor: Doctor) => {
    form.setValue("firstName", doctor.firstName);
    form.setValue("lastName", doctor.lastName);
    form.setValue("specialty", doctor.specialty);
    form.setValue("clinic", doctor.clinic);
  }, [form]);


  async function onSubmit(values: z.infer<typeof formSchema>) {
    const doctorInMasterlist = doctors.find(
      (d) =>
        d.firstName.toLowerCase() === values.firstName.toLowerCase() &&
        d.lastName.toLowerCase() === values.lastName.toLowerCase()
    );

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
          description: `${values.firstName} ${values.lastName} has already met the monthly coverage frequency of ${doctorInmasterlist.frequency}.`,
        });
        return; 
      }
    }
    
    const { plannedDoctorId, ...restOfValues } = values;

    onSave({
      ...restOfValues,
      coverageDate: values.coverageDate.toISOString(),
    });
    form.reset();
    onFormSubmit?.();
  }
  

  const InfoField = ({ label, value }: { label: string, value: string | undefined }) => (
    <div>
        <span className="text-xs font-bold text-gray-400">{label}: </span>
        <span className="text-sm">{value || 'N/A'}</span>
    </div>
  );

  return (
    <Card>
        <CardHeader>
            <CardTitle className="font-headline">Log New Coverage Event</CardTitle>
            <CardDescription>Select the call type and fill in the details below.</CardDescription>
        </CardHeader>
        <CardContent>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="p-2 space-y-2 border rounded-md">
                     <FormField
                        control={form.control}
                        name="callType"
                        render={({ field }) => (
                            <FormItem className="mb-4">
                            <FormLabel className="text-base font-semibold font-headline">Call Type</FormLabel>
                            <FormControl>
                                <RadioGroup
                                onValueChange={(value) => {
                                    field.onChange(value);
                                    form.reset({ 
                                        ...form.getValues(),
                                        callType: value as 'planned' | 'unplanned',
                                        plannedDoctorId: undefined,
                                        firstName: '', lastName: '', specialty: '', clinic: ''
                                    });
                                }}
                                value={field.value}
                                className="flex gap-4"
                                >
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                    <FormControl>
                                    <RadioGroupItem value="unplanned" />
                                    </FormControl>
                                    <FormLabel className="font-normal">
                                    Unplanned Call
                                    </FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                    <FormControl>
                                    <RadioGroupItem value="planned" />
                                    </FormControl>
                                    <FormLabel className="font-normal">
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
                     {callType === 'unplanned' && (
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="firstName"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="font-headline">First Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="John" {...field} />
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
                                       <Input placeholder="Doe" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                        </div>
                    )}
                </div>

                <div className={cn((callType === 'planned' && !plannedDoctorId) && 'hidden', 'space-y-4')}>
                    {/* Doctor Info Header */}
                    <div className="p-2 text-white bg-green-700 rounded-md">
                        <SectionHeader title="Doctor's Information" className="bg-transparent"/>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 p-1 text-sm">
                            <InfoField label="HCP Name" value={selectedDoctor ? `${selectedDoctor.firstName} ${selectedDoctor.lastName}` : 'N/A'} />
                            <InfoField label="HCP Position" value={selectedDoctor?.specialty} />
                            <InfoField label="HCP ID" value={selectedDoctor?.id.substring(0,8)} />
                             <InfoField label="Subspecialty" value={'N/A'} />
                            <InfoField label="HACME NO" value={'N/A'} />
                            <InfoField label="Contact" value={'N/A'} />
                            <InfoField label="PRC #" value={'N/A'} />
                        </div>
                    </div>
                
                    {/* Main Content Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr] gap-4">
                        {/* Column 1: Pre-call */}
                        <div className="space-y-2 border border-gray-400 rounded-md">
                            <SectionHeader title="Pre-call Planning" />
                            <div className="p-2 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                     <FormField
                                        control={form.control}
                                        name="coverageType"
                                        render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-semibold">Type of Call</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="h-8">
                                                <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="inbase">In Person</SelectItem>
                                                <SelectItem value="outbase">Outbase</SelectItem>
                                            </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="callObjective"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel className="text-xs font-semibold">Call Objective</FormLabel>
                                            <FormControl>
                                                <Textarea placeholder="..." {...field} className="h-8"/>
                                            </FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <SectionHeader title="Product" />
                                <div className="grid grid-cols-2 gap-2">
                                     <FormField
                                        control={form.control}
                                        name="primaryProduct"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel className="text-xs font-semibold">Primary</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="h-8">
                                                    <SelectValue placeholder="Select..." />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="productA">Product A</SelectItem>
                                                    <SelectItem value="productB">Product B</SelectItem>
                                                    <SelectItem value="productC">Product C</SelectItem>
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
                                            <FormLabel className="text-xs font-semibold">Secondary</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="h-8">
                                                    <SelectValue placeholder="Select..." />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="productA">Product A</SelectItem>
                                                    <SelectItem value="productB">Product B</SelectItem>
                                                    <SelectItem value="productC">Product C</SelectItem>
                                                    <SelectItem value="none">None</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                        />
                                </div>
                                 <SectionHeader title="Promo / Display Materials" />
                                 <div className="space-y-1">
                                    <div className="grid grid-cols-[1fr_50px_50px] gap-1 items-center bg-blue-300 p-1 rounded-t-md">
                                        <FormLabel className="text-xs font-semibold">Primary Product</FormLabel>
                                        <FormLabel className="text-xs font-semibold">Qty</FormLabel>
                                        <FormLabel className="text-xs font-semibold">Bal</FormLabel>
                                    </div>
                                    <div className="grid grid-cols-[1fr_50px_50px] gap-1 items-center p-1">
                                        <p className="text-sm truncate">{form.watch('primaryProduct') || 'N/A'}</p>
                                        <FormField control={form.control} name="primaryProductQty" render={({ field }) => (<Input type="number" {...field} className="h-8"/>)} />
                                        <FormField control={form.control} name="primaryProductBal" render={({ field }) => (<Input type="number" {...field} className="h-8"/>)} />
                                    </div>
                                    <div className="grid grid-cols-[1fr_50px_50px] gap-1 items-center bg-blue-300 p-1">
                                        <FormLabel className="text-xs font-semibold">Secondary Product</FormLabel>
                                        <FormLabel className="text-xs font-semibold">Qty</FormLabel>
                                        <FormLabel className="text-xs font-semibold">Bal</FormLabel>
                                    </div>
                                     <div className="grid grid-cols-[1fr_50px_50px] gap-1 items-center p-1">
                                        <p className="text-sm truncate">{form.watch('secondaryProduct') || 'N/A'}</p>
                                        <FormField control={form.control} name="secondaryProductQty" render={({ field }) => (<Input type="number" {...field} className="h-8"/>)} />
                                        <FormField control={form.control} name="secondaryProductBal" render={({ field }) => (<Input type="number" {...field} className="h-8"/>)} />
                                    </div>
                                 </div>
                                <SectionHeader title="Reminder Products" />
                                 <div className="space-y-1">
                                    <div className="grid grid-cols-[1fr_60px_60px] gap-1 items-center p-1">
                                        <FormLabel className="text-xs font-semibold">Product</FormLabel>
                                        <FormLabel className="text-xs font-semibold">Quantity</FormLabel>
                                        <FormLabel className="text-xs font-semibold">Balance</FormLabel>
                                    </div>
                                     <div className="grid grid-cols-[1fr_60px_60px] gap-1 items-center p-1">
                                        <FormField control={form.control} name="reminderProduct" render={({ field }) => (<Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-8"><SelectValue placeholder="Select..."/></SelectTrigger></FormControl><SelectContent><SelectItem value="reminderA">Reminder A</SelectItem></SelectContent></Select>)} />
                                        <FormField control={form.control} name="reminderProductQty" render={({ field }) => (<Input type="number" {...field} className="h-8"/>)} />
                                        <FormField control={form.control} name="reminderProductBal" render={({ field }) => (<Input type="number" {...field} className="h-8"/>)} />
                                    </div>
                                 </div>
                            </div>
                        </div>

                        {/* Column 2: Signature */}
                        <div className="space-y-2 border border-gray-400 rounded-md">
                             <SectionHeader title="Signature" />
                             <div className="p-2 space-y-2">
                                <div className="flex justify-between">
                                    <Button type="button" size="sm" variant="outline" onClick={() => form.setValue('signature', null)}>
                                        <Eraser className="mr-2"/>
                                        Clear Signature
                                    </Button>
                                    <Button type="submit" size="sm">
                                        <Save className="mr-2" />
                                        Save Signature
                                    </Button>
                                </div>
                                <FormField
                                control={form.control}
                                name="signature"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel className="sr-only">Sign</FormLabel>
                                    <FormControl>
                                        <SignaturePad value={field.value} onChange={(value) => field.onChange(value)} className="h-[200px]" />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                             </div>
                        </div>

                        {/* Column 3: Post-call */}
                         <div className="space-y-2 border border-gray-400 rounded-md">
                            <SectionHeader title="Post Call Analysis" />
                            <div className="p-2 space-y-2">
                                <FormField
                                control={form.control}
                                name="topicsDiscussed"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel className="text-xs font-semibold">Topics Discussed</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="..." {...field} rows={3} />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <FormField
                                    control={form.control}
                                    name="doctorsIssue"
                                    render={({ field }) => (
                                        <FormItem>
                                            <SectionHeader title="Doctor's Issue/Concern" className="bg-red-600" />
                                            <FormControl>
                                                <Textarea placeholder="..." {...field} rows={2} />
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
                                            <SectionHeader title="Plan of Action" className="bg-cyan-400"/>
                                            <FormControl>
                                                <Textarea placeholder="..." {...field} rows={2} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                    />
                                </div>
                                 <SectionHeader title="Post-Call Notes" />
                                 <div className="grid grid-cols-2 gap-2">
                                    <FormField
                                        control={form.control}
                                        name="whatWentWell"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel className="text-xs font-semibold">What went well?</FormLabel>
                                            <FormControl>
                                                <Textarea placeholder="..." {...field} rows={2} />
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
                                            <FormLabel className="text-xs font-semibold">Areas for Improvement</FormLabel>
                                            <FormControl>
                                                <Textarea placeholder="..." {...field} rows={2} />
                                            </FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                 </div>
                            </div>
                        </div>
                    </div>

                    <Button type="submit" className="w-full mt-4 font-headline">
                        <Save className="mr-2" />
                        Save Full Coverage Report
                    </Button>
                </div>
            </form>
            </Form>
        </CardContent>
    </Card>
  )
}

    