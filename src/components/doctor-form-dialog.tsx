"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { useEffect } from "react"
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

const doctorFormSchema = z.object({
  firstName: z.string().min(2, "First name is too short"),
  lastName: z.string().min(2, "Last name is too short"),
  specialty: z.string().min(2, "Specialty is required"),
  clinic: z.string().min(2, "Clinic is required"),
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
    },
  })

  useEffect(() => {
    if (doctor) {
      form.reset(doctor);
    } else {
      form.reset({
        firstName: "",
        lastName: "",
        specialty: "",
        clinic: "",
      });
    }
  }, [doctor, form, isOpen]);

  const onSubmit = (values: z.infer<typeof doctorFormSchema>) => {
    if (doctor) {
      onSave({ ...doctor, ...values });
    } else {
      onSave(values);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-headline">{doctor ? "Edit Doctor" : "Add New Doctor"}</DialogTitle>
          <DialogDescription>
            {doctor ? "Update the details for this doctor." : "Enter the details for the new doctor."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
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
            <DialogFooter>
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
