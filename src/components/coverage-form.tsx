
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { format, isThisMonth, parseISO, isToday } from "date-fns"
import { Save, Eraser, Upload } from "lucide-react"
import React, { useState, useEffect, useCallback, useRef } from "react"

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
      topicsDiscussed: "",
      doctorsIssue: "",
      planOfAction: "",
      whatWentWell: "",
      areasForImprovement: "",
    },
  })

  const callType = form.watch("callType");
  const plannedDoctorId = form.watch("plannedDoctorId");
  
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
          description: `${values.firstName} ${values.lastName} has already met the monthly coverage frequency of ${doctorInMasterlist.frequency}.`,
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

  return (
    <Card>
        <CardHeader>
            <CardTitle className="font-headline">Log New Coverage Event</CardTitle>
            <CardDescription>Select the call type and fill in the details below.</CardDescription>
        </CardHeader>
        <CardContent>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

                <div className={cn((callType === 'planned' && !plannedDoctorId) && 'hidden', 'space-y-4')}>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField
                            control={form.control}
                            name="firstName"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel className="font-headline">First Name</FormLabel>
                                <FormControl>
                                    <Input placeholder="John" {...field} disabled={callType === 'planned'}/>
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
                                    <Input placeholder="Doe" {...field} disabled={callType === 'planned'}/>
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
                                    <Input placeholder="Cardiology" {...field} disabled={callType === 'planned'}/>
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
                                    <Input placeholder="Community General Hospital" {...field} disabled={callType === 'planned'}/>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                         <FormField
                            control={form.control}
                            name="coverageType"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel className="font-headline">Type of Coverage</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
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
                         {/* Placeholder for alignment */}
                         <div></div>
                    </div>
                
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold border-b font-headline">Pre-call Planning</h3>
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
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                                    name="primaryProductQty"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel className="font-headline">Primary Samples</FormLabel>
                                        <FormControl>
                                            <Input type="number" placeholder="0" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="primaryProductBal"
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
                                    name="secondaryProductQty"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel className="font-headline">Secondary Samples</FormLabel>
                                        <FormControl>
                                            <Input type="number" placeholder="0" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="secondaryProductBal"
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

                         <div className="space-y-4">
                            <h3 className="text-lg font-semibold border-b font-headline">Post-call Analysis</h3>
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
                    </div>

                    <FormField
                        control={form.control}
                        name="signature"
                        render={({ field }) => (
                            <FormItem className="mt-6">
                            <FormLabel className="font-headline">Provider Signature</FormLabel>
                            <FormControl>
                                <SignaturePad value={field.value} onChange={(value) => field.onChange(value)} className="h-[200px]" />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    
                    <Button type="submit" className="w-full mt-4 font-headline">
                        <Save className="mr-2" />
                        Save Coverage Report
                    </Button>
                </div>
            </form>
            </Form>
        </CardContent>
    </Card>
  )
}
