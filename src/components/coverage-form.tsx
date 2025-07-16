"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Save, Upload, X } from "lucide-react"

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
import type { CoverageEntry } from "@/lib/types"
import Image from "next/image"
import { useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { Textarea } from "./ui/textarea"

const formSchema = z.object({
  firstName: z.string().min(2, "First name is too short"),
  lastName: z.string().min(2, "Last name is too short"),
  specialty: z.string().min(2, "Specialty is required"),
  clinic: z.string().min(2, "Clinic is required"),
  coverageType: z.enum(["inbase", "outbase"]),
  coverageDate: z.date(),
  photos: z.array(z.string()).optional(),
  signature: z.string().nullable(),
})

type CoverageFormProps = {
  onSave: (entry: Omit<CoverageEntry, 'id' | 'submittedAt'>) => void;
  isOnline: boolean;
}

export function CoverageForm({ onSave, isOnline }: CoverageFormProps) {
  const { toast } = useToast()
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

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

  async function onSubmit(values: z.infer<typeof formSchema>) {
    onSave({
      ...values,
      coverageDate: values.coverageDate.toISOString(),
    });
    form.reset();
    setPhotoPreviews([]);
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const currentPhotos = form.getValues("photos") || [];

      if (currentPhotos.length + files.length > 5) {
        toast({
          variant: "destructive",
          title: "Upload limit exceeded",
          description: "You can only upload a maximum of 5 photos.",
        });
        return;
      }
      
      const newPhotoPromises = files.map(file => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      Promise.all(newPhotoPromises).then(newBase64Photos => {
        const updatedPhotos = [...currentPhotos, ...newBase64Photos];
        form.setValue("photos", updatedPhotos);
        setPhotoPreviews(updatedPhotos);
      }).catch(err => {
        console.error("Error reading files:", err);
        toast({
          variant: "destructive",
          title: "Photo upload failed",
          description: "There was an error processing your photos.",
        });
      });
    }
  };
  
  const removePhoto = (index: number) => {
    const currentPhotos = form.getValues("photos") || [];
    const updatedPhotos = currentPhotos.filter((_, i) => i !== index);
    form.setValue("photos", updatedPhotos);
    setPhotoPreviews(updatedPhotos);
  };

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
                  <FormLabel className="font-headline">Upload Photos</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 px-4 py-2 text-white rounded-md cursor-pointer bg-primary hover:bg-primary/90">
                            <Upload size={16}/>
                            <span className="font-headline">Add Photos</span>
                            <Input type="file" multiple accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                        </label>
                    </div>
                  </FormControl>
                  <FormDescription>You can upload up to 5 photos.</FormDescription>
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
