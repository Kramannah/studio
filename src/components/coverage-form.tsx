
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { format, isThisMonth, parseISO, isToday } from "date-fns"
import { Calendar as CalendarIcon, Save, Camera, X, Upload } from "lucide-react"
import React, { useState, useRef, useEffect, useCallback } from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
import Image from "next/image"
import { useToast } from "@/hooks/use-toast"
import { Textarea } from "./ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Autocomplete } from "./autocomplete"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "./ui/radio-group"
import { ScrollArea } from "./ui/scroll-area"

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
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "First name is too short", path: ["firstName"] });
        }
        if (!data.lastName || data.lastName.length < 2) {
             ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Last name is too short", path: ["lastName"] });
        }
    }
    if ((!data.photos || data.photos.length === 0) && !data.signature) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A photo or signature is required as proof of coverage.",
        path: ["photos"], 
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A photo or signature is required as proof of coverage.",
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

export function CoverageForm({ onSave, isOnline, doctors, masterEntries, initialDoctor, onFormSubmit, todaysPlans, offlineEntries }: CoverageFormProps) {
  const { toast } = useToast()
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isCameraDialogOpen, setIsCameraDialogOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
        // Optionally clear fields when switching to unplanned
        form.setValue("plannedDoctorId", undefined);
        // keep name fields if user switches back and forth
    }
  }, [callType, plannedDoctorId, doctors, form]);


  const handleDoctorSelect = useCallback((doctor: Doctor) => {
    form.setValue("firstName", doctor.firstName);
    form.setValue("lastName", doctor.lastName);
    form.setValue("specialty", doctor.specialty);
    form.setValue("clinic", doctor.clinic);
  }, [form]);


  const requestCameraPermission = async () => {
    if (hasCameraPermission) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHasCameraPermission(true);
      return true;
    } catch (error) {
      console.error("Error accessing camera:", error);
      setHasCameraPermission(false);
      toast({
        variant: "destructive",
        title: "Camera Access Denied",
        description: "Please enable camera permissions to capture photos.",
      });
      return false;
    }
  };

  useEffect(() => {
    return () => {
      // Stop camera stream when component unmounts
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !hasCameraPermission) return;
    
    const currentPhotos = form.getValues("photos") || [];
    if (currentPhotos.length >= 1) {
      toast({
        variant: "destructive",
        title: "Capture limit reached",
        description: "You can only save a maximum of 1 photo.",
      });
      return;
    }

    const context = canvas.getContext('2d');
    if(context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const dataUri = canvas.toDataURL('image/png');
        
        const updatedPhotos = [...currentPhotos, dataUri];
        form.setValue("photos", updatedPhotos, { shouldValidate: true });
        setPhotoPreviews(updatedPhotos);
        setIsCameraDialogOpen(false); // Close dialog after capture
    }
  };

  const removePhoto = (index: number) => {
    const currentPhotos = form.getValues("photos") || [];
    const updatedPhotos = currentPhotos.filter((_, i) => i !== index);
    form.setValue("photos", updatedPhotos, { shouldValidate: true });
    setPhotoPreviews(updatedPhotos);
  };

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
    setPhotoPreviews([]);
    onFormSubmit?.();
  }

  const handleCameraOpen = async (open: boolean) => {
    if (open) {
      const permissionGranted = await requestCameraPermission();
      if (permissionGranted) {
        setIsCameraDialogOpen(true);
      }
    } else {
      setIsCameraDialogOpen(false);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const currentPhotos = form.getValues("photos") || [];
    if (currentPhotos.length >= 1) {
      toast({
        variant: "destructive",
        title: "Upload limit reached",
        description: "You can only save a maximum of 1 photo.",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUri = e.target?.result as string;
      const updatedPhotos = [...currentPhotos, dataUri];
      form.setValue("photos", updatedPhotos, { shouldValidate: true });
      setPhotoPreviews(updatedPhotos);
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Log New Coverage Event</CardTitle>
        <CardDescription>Select the call type and fill in the details below.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

            <FormField
              control={form.control}
              name="callType"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="text-lg font-semibold font-headline">Call Type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
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
                        <FormLabel className="text-lg font-semibold font-headline">Select a Planned Doctor</FormLabel>
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

            <div className={cn(callType === 'planned' && !plannedDoctorId && 'hidden')}>
                <h3 className="text-lg font-semibold font-headline">Provider Information</h3>
                <div className="grid grid-cols-1 gap-4 mt-4 md:grid-cols-2">
                <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="font-headline">First Name</FormLabel>
                        <FormControl>
                        <Autocomplete
                            doctors={doctors}
                            value={field.value}
                            onChange={field.onChange}
                            onSelect={handleDoctorSelect}
                            placeholder="John"
                            disabled={callType === 'planned'}
                            />
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
                        <Autocomplete
                            doctors={doctors}
                            value={field.value}
                            onChange={field.onChange}
                            onSelect={handleDoctorSelect}
                            placeholder="Doe"
                            triggerOn="lastName"
                            disabled={callType === 'planned'}
                            />
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
                        <Input placeholder="Cardiology" {...field} disabled={callType === 'planned'} />
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
                        <Textarea placeholder="Community General Hospital" {...field} disabled={callType === 'planned'} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                </div>
                
                <h3 className="mt-6 text-lg font-semibold font-headline">Coverage Details</h3>
                <div className="grid grid-cols-1 gap-4 mt-4 md:grid-cols-2">
                <FormField
                    control={form.control}
                    name="coverageType"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="font-headline">Coverage Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                            <SelectTrigger>
                            <SelectValue placeholder="Select coverage type" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="inbase">Inbase</SelectItem>
                            <SelectItem value="outbase">Outbase</SelectItem>
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
                    <FormItem className="flex flex-col">
                        <FormLabel className="font-headline">Coverage Date</FormLabel>
                        <Popover>
                        <PopoverTrigger asChild>
                            <FormControl>
                            <Button
                                variant={"outline"}
                                className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                                )}
                            >
                                {field.value ? (
                                format(field.value, "PPP")
                                ) : (
                                <span>Pick a date</span>
                                )}
                                <CalendarIcon className="w-4 h-4 ml-auto opacity-50" />
                            </Button>
                            </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                                date > new Date() || date < new Date("1900-01-01")
                            }
                            initialFocus
                            />
                        </PopoverContent>
                        </Popover>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                </div>

                <FormField
                control={form.control}
                name="photos"
                render={({ field }) => (
                    <FormItem className="mt-6">
                    <FormLabel className="font-headline">Proof of Coverage</FormLabel>
                    <FormControl>
                        <div className="flex gap-2">
                            <Dialog open={isCameraDialogOpen} onOpenChange={handleCameraOpen}>
                                <DialogTrigger asChild>
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    disabled={(form.getValues("photos") || []).length >= 1}
                                    className="font-headline"
                                >
                                    <Camera className="mr-2" />
                                    Capture Photo
                                </Button>
                                </DialogTrigger>
                                <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Live Camera</DialogTitle>
                                </DialogHeader>
                                <div className="relative w-full overflow-hidden rounded-md aspect-video bg-background">
                                    <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                                    <canvas ref={canvasRef} className="hidden" />
                                    {hasCameraPermission === false && (
                                        <div className="absolute inset-0 flex items-center justify-center p-4 text-center bg-black/50">
                                            <Alert variant="destructive" className="max-w-sm">
                                                <AlertTitle>Camera Access Required</AlertTitle>
                                                <AlertDescription>
                                                Please allow camera access in your browser to use this feature.
                                                </AlertDescription>
                                            </Alert>
                                        </div>
                                    )}
                                </div>
                                <DialogFooter>
                                    <Button type="button" onClick={handleCapturePhoto} disabled={!hasCameraPermission}>
                                        <Camera className="mr-2" />
                                        Take Picture
                                    </Button>
                                </DialogFooter>
                                </DialogContent>
                            </Dialog>
                             <Button
                                type="button"
                                variant="outline"
                                disabled={(form.getValues("photos") || []).length >= 1}
                                className="font-headline"
                                onClick={() => fileInputRef.current?.click()}
                              >
                                <Upload className="mr-2" />
                                Upload Photo
                              </Button>
                              <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                accept="image/*"
                              />
                        </div>
                    </FormControl>
                    <FormDescription>You can capture or upload 1 photo.</FormDescription>
                    {photoPreviews.length > 0 && (
                        <div className="grid grid-cols-2 gap-4 mt-4 sm:grid-cols-3 md:grid-cols-5">
                        {photoPreviews.map((src, index) => (
                            <div key={index} className="relative group">
                            <Image src={src} alt={`Preview ${index + 1}`} width={150} height={150} className="object-cover w-full h-auto rounded-md aspect-square" />
                            <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => removePhoto(index)}>
                                <X size={16}/>
                            </Button>
                            </div>
                        ))}
                        </div>
                    )}
                    <FormMessage />
                    </FormItem>
                )}
                />

                <FormField
                control={form.control}
                name="signature"
                render={({ field }) => (
                    <FormItem className="mt-6">
                    <FormLabel className="font-headline">Provider Signature</FormLabel>
                    <FormControl>
                        <SignaturePad value={field.value} onChange={(value) => field.onChange(value)} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <Button type="submit" className="w-full mt-6 md:w-auto font-headline">
                <Save className="mr-2" />
                Save Coverage
                </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
