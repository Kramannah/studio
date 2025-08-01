
"use client"

import type { Doctor, CoverageEntry } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { useState, useMemo, useRef } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Plus, MoreHorizontal, Trash2, Edit, Upload, Download } from "lucide-react";
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
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { isThisMonth, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";


type MasterListProps = {
  doctors: Doctor[];
  entries: CoverageEntry[];
  onAddDoctor: (doctor: Omit<Doctor, 'id'>) => void;
  onAddDoctorsBulk: (doctors: Omit<Doctor, 'id'>[]) => void;
  onUpdateDoctor: (doctor: Doctor) => void;
  onDeleteDoctor: (id: string) => void;
}

export function MasterList({ doctors, entries, onAddDoctor, onAddDoctorsBulk, onUpdateDoctor, onDeleteDoctor }: MasterListProps) {
  const [filter, setFilter] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const visitCountsThisMonth = useMemo(() => {
    const thisMonthEntries = entries.filter(e => isThisMonth(parseISO(e.submittedAt)));
    return thisMonthEntries.reduce((acc, entry) => {
      const doctorName = `${entry.firstName} ${entry.lastName}`.toLowerCase();
      acc[doctorName] = (acc[doctorName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [entries]);

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
  
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const json = XLSX.utils.sheet_to_json<any>(worksheet);

        const requiredFields: (keyof Omit<Doctor, 'id'>)[] = ['firstName', 'lastName', 'specialty', 'clinic', 'frequency', 'hacme'];
        
        const mappedData = json.map(row => ({
            firstName: row.firstName,
            lastName: row.lastName,
            specialty: row.specialty,
            clinic: row.clinic,
            province: row.province,
            municipality: row.municipality,
            placeOfPractice: row.placeOfPractice,
            frequency: row.frequency,
            hacme: row.hacme,
        }));

        const isValid = mappedData.every(row => requiredFields.every(field => {
            if(field === 'hacme') {
                return row[field] === 'YES' || row[field] === 'NO';
            }
             if(field === 'frequency') {
                return ['1x', '2x', '3x', '4x'].includes(row[field]);
            }
            return row[field] !== undefined && row[field] !== null;
        }));


        if (!isValid) {
          toast({
            variant: "destructive",
            title: "Upload Failed",
            description: "The Excel file is missing required columns (firstName, lastName, specialty, clinic, frequency, hacme) or contains invalid data.",
          });
          return;
        }

        onAddDoctorsBulk(mappedData);
        toast({
          title: "Upload Successful",
          description: `${mappedData.length} doctors have been added to the masterlist.`,
        });
      } catch (error) {
        console.error("Failed to parse Excel file", error);
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: "There was an error processing the Excel file. Please ensure it is a valid .xlsx or .xls file.",
        });
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = () => {
    const headers = ['firstName', 'lastName', 'specialty', 'clinic', 'province', 'municipality', 'placeOfPractice', 'frequency', 'hacme'];
    const sampleData = [
      { firstName: 'John', lastName: 'Doe', specialty: 'Cardiology', clinic: 'Community General Hospital', province: 'Metro Manila', municipality: 'Quezon City', placeOfPractice: 'Hospital', frequency: '2x', hacme: 'NO' },
      { firstName: 'Jane', lastName: 'Smith', specialty: 'Pediatrics', clinic: 'City Children Clinic', province: 'Cebu', municipality: 'Cebu City', placeOfPractice: 'Clinic', frequency: '3x', hacme: 'YES' }
    ];
    
    const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Doctors Template');
  
    // Set column widths for better visibility
    worksheet['!cols'] = [
      { wch: 20 }, // firstName
      { wch: 20 }, // lastName
      { wch: 25 }, // specialty
      { wch: 40 }, // clinic
      { wch: 20 }, // province
      { wch: 20 }, // municipality
      { wch: 20 }, // placeOfPractice
      { wch: 10 },  // frequency
      { wch: 10 }  // hacme
    ];

    XLSX.writeFile(workbook, 'doctor_masterlist_template.xlsx');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="font-headline">Doctor Masterlist</CardTitle>
            <CardDescription>Add, edit, or remove doctors from your list.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".xlsx, .xls"
            />
             <Button onClick={handleDownloadTemplate} variant="outline">
              <Download className="mr-2" />
              Download Template
            </Button>
            <Button onClick={handleUploadClick} variant="outline">
              <Upload className="mr-2" />
              Upload Masterlist
            </Button>
            <Button onClick={handleAddNew}>
              <Plus className="mr-2" />
              Add Doctor
            </Button>
          </div>
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
                        <TableHead>Location</TableHead>
                        <TableHead className="text-center">HACME</TableHead>
                        <TableHead className="text-center">Target</TableHead>
                        <TableHead className="text-center">Actual (This Month)</TableHead>
                        <TableHead>Remarks</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredDoctors.length > 0 ? (
                        filteredDoctors.map((doctor) => {
                          const doctorName = `${doctor.firstName} ${doctor.lastName}`.toLowerCase();
                          const visitCount = visitCountsThisMonth[doctorName] || 0;
                          const targetCount = parseInt(doctor.frequency.replace('x', ''), 10);
                          const isCompleted = visitCount >= targetCount;
                          const isCovered = visitCount > 0;
                          
                          return (
                            <TableRow key={doctor.id} data-completed={isCompleted} className={cn(isCompleted && "bg-primary/10 hover:bg-primary/20")}>
                                <TableCell className="font-medium">{doctor.firstName} {doctor.lastName}</TableCell>
                                <TableCell>{doctor.specialty}</TableCell>
                                <TableCell>{doctor.clinic}</TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span>{doctor.municipality}, {doctor.province}</span>
                                        <span className="text-xs text-muted-foreground">{doctor.placeOfPractice}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-center">{doctor.hacme}</TableCell>
                                <TableCell className="text-center">{doctor.frequency}</TableCell>
                                <TableCell className="text-center">{visitCount}</TableCell>
                                <TableCell>
                                  {isCovered ? (
                                    <Badge variant="secondary" className="text-primary">Covered</Badge>
                                  ) : (
                                    <Badge variant="outline">Not Yet Covered</Badge>
                                  )}
                                </TableCell>
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
                          );
                        })
                    ) : (
                        <TableRow>
                            <TableCell colSpan={9} className="h-24 text-center">
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
