"use client"

import type { Doctor } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { useState, useMemo } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Plus, MoreHorizontal, Trash2, Edit } from "lucide-react";
import { DoctorFormDialog } from "./doctor-form-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

type MasterListProps = {
  doctors: Doctor[];
  onAddDoctor: (doctor: Omit<Doctor, 'id'>) => void;
  onUpdateDoctor: (doctor: Doctor) => void;
  onDeleteDoctor: (id: string) => void;
}

export function MasterList({ doctors, onAddDoctor, onUpdateDoctor, onDeleteDoctor }: MasterListProps) {
  const [filter, setFilter] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | undefined>(undefined);

  const filteredDoctors = useMemo(() => {
    return doctors.filter(doctor =>
      `${doctor.firstName} ${doctor.lastName}`.toLowerCase().includes(filter.toLowerCase()) ||
      doctor.clinic.toLowerCase().includes(filter.toLowerCase()) ||
      doctor.specialty.toLowerCase().includes(filter.toLowerCase())
    );
  }, [doctors, filter]);

  const handleSaveDoctor = (doctorData: Omit<Doctor, 'id'> | Doctor) => {
    if ('id' in doctorData) {
      onUpdateDoctor(doctorData);
    } else {
      onAddDoctor(doctorData);
    }
    setEditingDoctor(undefined);
    setIsFormOpen(false);
  }

  const handleEdit = (doctor: Doctor) => {
    setEditingDoctor(doctor);
    setIsFormOpen(true);
  }

  const handleAddNew = () => {
    setEditingDoctor(undefined);
    setIsFormOpen(true);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-headline">Doctor Masterlist</CardTitle>
            <CardDescription>Add, edit, or remove doctors from your list.</CardDescription>
          </div>
          <Button onClick={handleAddNew}>
            <Plus className="mr-2" />
            Add Doctor
          </Button>
        </div>
        <div className="mt-4">
          <Input 
            placeholder="Filter by name, clinic, or specialty..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Specialty</TableHead>
                        <TableHead>Clinic</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredDoctors.length > 0 ? (
                        filteredDoctors.map((doctor) => (
                            <TableRow key={doctor.id}>
                                <TableCell className="font-medium">{doctor.firstName} {doctor.lastName}</TableCell>
                                <TableCell>{doctor.specialty}</TableCell>
                                <TableCell>{doctor.clinic}</TableCell>
                                <TableCell className="text-right">
                                  <AlertDialog>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon">
                                          <MoreHorizontal />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => handleEdit(doctor)}>
                                          <Edit className="mr-2" /> Edit
                                        </DropdownMenuItem>
                                        <AlertDialogTrigger asChild>
                                          <DropdownMenuItem className="text-destructive focus:text-destructive">
                                            <Trash2 className="mr-2" /> Delete
                                          </DropdownMenuItem>
                                        </AlertDialogTrigger>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This action cannot be undone. This will permanently delete the doctor from your masterlist.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => onDeleteDoctor(doctor.id)}>Continue</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center">
                                {doctors.length > 0 ? "No doctors match your filter." : "No doctors in your masterlist yet."}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
        <DoctorFormDialog 
          isOpen={isFormOpen} 
          onOpenChange={setIsFormOpen}
          onSave={handleSaveDoctor}
          doctor={editingDoctor}
        />
      </CardContent>
    </Card>
  );
}
