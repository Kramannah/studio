
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { useEffect, useMemo, useState } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import type { Doctor } from "@/lib/types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { provinces } from "@/lib/philippine-locations";

const doctorFormSchema = z.object({
  firstName: z.string().min(2, "First name is too short"),
  lastName: z.string().min(2, "Last name is too short"),
  specialty: z.string().min(2, "Specialty is required"),
  clinic: z.string().min(2, "Clinic is required"),
  hcpCode: z.string().optional(),
  coverageType: z.enum(['inbase', 'outbase']).optional(),
  province: z.string().optional(),
  municipality: z.string().optional(),
  placeOfPractice: z.string().optional(),
  frequency: z.enum(['1x', '2x', '3x', '4x']),
  hacme: z.enum(['YES', 'NO']).optional().default('NO'),
})

type DoctorFormDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (doctor: Omit<Doctor, 'id'> | Doctor) => void;
  doctor?: Doctor;
}

export function DoctorFormDialog({ isOpen, onOpenChange, onSave, doctor }: DoctorFormDialogProps) {
  const form = useForm<z.infer<typeof doctorFormSchema>>({
    resolver: zodResolver(doctorFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      specialty: "",
      clinic: "",
      hcpCode: "",
      coverageType: undefined,
      province: "",
      municipality: "",
      placeOfPractice: "",
      frequency: "1x",
      hacme: "NO",
    },
  })

  const selectedProvince = form.watch("province");

  const municipalities = useMemo(() => {
    if (!selectedProvince) return [];
    const provinceData = provinces.find(p => p.name === selectedProvince);
    return provinceData ? provinceData.municipalities : [];
  }, [selectedProvince]);


  useEffect(() => {
    if (isOpen) {
      if (doctor) {
        form.reset({
            ...doctor,
            province: doctor.province || "",
            municipality: doctor.municipality || ""
        });
      } else {
        form.reset({
          firstName: "",
          lastName: "",
          specialty: "",
          clinic: "",
          hcpCode: "",
          coverageType: undefined,
          province: "",
          municipality: "",
          placeOfPractice: "",
          frequency: "1x",
          hacme: "NO",
        });
      }
    }
  }, [doctor, form, isOpen]);
  
  useEffect(() => {
    if (selectedProvince && !municipalities.includes(form.getValues('municipality') || '')) {
       form.setValue('municipality', '');
    }
  }, [selectedProvince, municipalities, form]);

  const onSubmit = (values: z.infer<typeof doctorFormSchema>) => {
    if (doctor) {
      onSave({ ...doctor, ...values });
    } else {
      onSave(values);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">{doctor ? "Edit Doctor" : "Add New Doctor"}</DialogTitle>
          <DialogDescription>
            {doctor ? "Update the details for this doctor." : "Enter the details for the new doctor."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
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
             <FormField
                control={form.control}
                name="hcpCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-headline">HCP Code</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter HCP code" {...field} />
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
            <FormField
              control={form.control}
              name="province"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-headline">Province</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select province" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {provinces.map(p => (
                        <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="municipality"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-headline">Municipality</FormLabel>
                   <Select onValueChange={field.onChange} value={field.value} disabled={!selectedProvince}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select municipality" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {municipalities.map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="placeOfPractice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-headline">Place of Practice</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Hospital" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
                 <FormField
                    control={form.control}
                    name="coverageType"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="font-headline">Type of Coverage</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                            <SelectTrigger>
                            <SelectValue placeholder="Select type..." />
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
                    name="frequency"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="font-headline">Frequency</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                            <SelectTrigger>
                            <SelectValue placeholder="Select target frequency" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="1x">1x</SelectItem>
                            <SelectItem value="2x">2x</SelectItem>
                            <SelectItem value="3x">3x</SelectItem>
                            <SelectItem value="4x">4x</SelectItem>
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
                        <Select onValueChange={field.onChange} value={field.value}>
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
            <DialogFooter>
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
