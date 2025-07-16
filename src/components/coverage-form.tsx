"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Save, Camera, X } from "lucide-react"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SignaturePad } from "./signature-pad"
import type { CoverageEntry, Doctor } from "@/lib/types"
import Image from "next/image"
import { useToast } from "@/hooks/use-toast"
import { Textarea } from "./ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Autocomplete } from "./autocomplete"

const formSchema = z.object({
  firstName: z.string().min(2, "First name is too short"),
  lastName: z.string().min(2, "Last name is too short"),
  specialty: z.string().min(2, "Specialty is required"),
  clinic: z.string().min(2, "Clinic is required"),
  coverageType: z.enum(["inbase", "outbase"]),
  coverageDate: z.date(),
  photos: z.array(z.string()).max(1, "You can only capture one photo.").optional(),
  signature: z.string().nullable(),
})

type CoverageFormProps = {
  onSave: (entry: Omit<CoverageEntry, 'id' | 'submittedAt'>) => void;
  isOnline: boolean;
  doctors: Doctor[];
}

export function CoverageForm({ onSave, isOnline, doctors }: CoverageFormProps) {
  const { toast } = useToast()
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
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

  const handleDoctorSelect = useCallback((doctor: Doctor) => {
    form.setValue("firstName", doctor.firstName);
    form.setValue("lastName", doctor.lastName);
    form.setValue("specialty", doctor.specialty);
    form.setValue("clinic", doctor.clinic);
  }, [form]);


  useEffect(() => {
    const getCameraPermission = async () => {
      if (hasCameraPermission === null) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          setHasCameraPermission(true);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (error) {
          console.error("Error accessing camera:", error);
          setHasCameraPermission(false);
          toast({
            variant: "destructive",
            title: "Camera Access Denied",
            description: "Please enable camera permissions to capture photos.",
          });
        }
      }
    };
    getCameraPermission();
    
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [hasCameraPermission, toast]);

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
        form.setValue("photos", updatedPhotos);
        setPhotoPreviews(updatedPhotos);
    }
  };

  const removePhoto = (index: number) => {
    const currentPhotos = form.getValues("photos") || [];
    const updatedPhotos = currentPhotos.filter((_, i) => i !== index);
    form.setValue("photos", updatedPhotos);
    setPhotoPreviews(updatedPhotos);
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    onSave({
      ...values,
      coverageDate: values.coverageDate.toISOString(),
    });
    form.reset();
    setPhotoPreviews([]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Log New Coverage Event</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <h3 className="text-lg font-semibold font-headline">Provider Information</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                      <Input placeholder="Cardiology" {...field} />
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
                      <Textarea placeholder="Community General Hospital" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <h3 className="mt-6 text-lg font-semibold font-headline">Coverage Details</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                <FormItem>
                  <FormLabel className="font-headline">Capture Photo</FormLabel>
                   <FormControl>
                    <div className="p-4 space-y-4 border rounded-md bg-muted">
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
                        <Button type="button" onClick={handleCapturePhoto} disabled={!hasCameraPermission || (form.getValues("photos") || []).length >= 1} className="w-full md:w-auto font-headline">
                            <Camera className="mr-2" />
                            Capture Photo
                        </Button>
                    </div>
                  </FormControl>
                  <FormDescription>You can capture 1 photo.</FormDescription>
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
                <FormItem>
                  <FormLabel className="font-headline">Provider Signature</FormLabel>
                  <FormControl>
                    <SignaturePad value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full mt-6 md:w-auto font-headline">
              <Save className="mr-2" />
              Save Coverage
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
