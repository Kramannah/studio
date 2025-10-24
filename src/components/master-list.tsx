
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
import { useState, useMemo, useRef, useEffect } from "react";
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
import { isThisMonth, parseISO, isValid, format } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { provinces } from "@/lib/philippine-locations";
import { Checkbox } from "./ui/checkbox";


type MasterListProps = {
  doctors: Doctor[];
  entries: CoverageEntry[];
  onAddDoctor: (doctor: Omit<Doctor, 'id'>) => void;
  onAddDoctorsBulk: (doctors: Omit<Doctor, 'id'>[]) => void;
  onUpdateDoctor: (doctor: Doctor) => void;
  onDeleteDoctor: (id: string) => void;
  onDeleteDoctorsBulk: (ids: string[]) => void;
  readOnly?: boolean;
}

export function MasterList({ doctors, entries, onAddDoctor, onAddDoctorsBulk, onUpdateDoctor, onDeleteDoctor, onDeleteDoctorsBulk, readOnly = false }: MasterListProps) {
  const [filter, setFilter] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | undefined>(undefined);
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const visitCountsThisMonth = useMemo(() => {
    const thisMonthEntries = entries.filter(e => {
        const submittedDate = typeof e.submittedAt === 'string' ? parseISO(e.submittedAt) : e.submittedAt;
        return isValid(submittedDate) && isThisMonth(submittedDate);
    });
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

  useEffect(() => {
    setSelectedDoctorIds([]);
  }, [doctors]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedDoctorIds(filteredDoctors.map(d => d.id));
    } else {
      setSelectedDoctorIds([]);
    }
  }

  const handleSelectDoctor = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedDoctorIds(prev => [...prev, id]);
    } else {
      setSelectedDoctorIds(prev => prev.filter(doctorId => doctorId !== id));
    }
  }

  const handleDeleteSelected = () => {
    onDeleteDoctorsBulk(selectedDoctorIds);
  }

  const frequencyCounts = useMemo(() => {
    return doctors.reduce((acc, doctor) => {
      acc[doctor.frequency] = (acc[doctor.frequency] || 0) + 1;
      return acc;
    }, {} as Record<'1x' | '2x' | '3x' | '4x', number>);
  }, [doctors]);

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

        const requiredFields: (keyof Omit<Doctor, 'id'>)[] = ['firstName', 'lastName'];
        
        const mappedData = json.map(row => {
            const frequencyValue = row.frequency ? String(row.frequency).toLowerCase() : '';
            const hacmeValue = row.hacme ? String(row.hacme).toUpperCase() : 'NO';
            const coverageTypeValue = row.coverageType ? String(row.coverageType).toLowerCase() : undefined;
            
            return {
                firstName: row.firstName || '',
                lastName: row.lastName || '',
                hcpCode: row.hcpCode || '',
                specialty: row.specialty || '',
                clinic: row.clinic || '',
                province: row.province || '',
                municipality: row.municipality || '',
                placeOfPractice: row.placeOfPractice || '',
                frequency: ['1x', '2x', '3x', '4x'].includes(frequencyValue) ? frequencyValue as '1x' | '2x' | '3x' | '4x' : '1x',
                hacme: ['YES', 'NO'].includes(hacmeValue) ? hacmeValue as 'YES' | 'NO' : 'NO',
                coverageType: ['inbase', 'outbase'].includes(coverageTypeValue) ? coverageTypeValue as 'inbase' | 'outbase' : undefined,
            }
        });

        const validDoctors = mappedData.filter(row => requiredFields.every(field => {
            const value = row[field as keyof typeof row];
            return value !== undefined && value !== null && String(value).trim() !== '';
        }));


        if (validDoctors.length !== mappedData.length) {
            const invalidCount = mappedData.length - validDoctors.length;
            toast({
                variant: "destructive",
                title: "Incomplete Data",
                description: `${invalidCount} doctor(s) were skipped due to missing first or last names.`,
            });
        }
        
        if (validDoctors.length === 0) {
          toast({
            variant: "destructive",
            title: "Upload Failed",
            description: "No valid doctor entries found in the file. Please ensure 'firstName' and 'lastName' are provided.",
          });
          return;
        }

        onAddDoctorsBulk(validDoctors);
        toast({
          title: "Upload Successful",
          description: `${validDoctors.length} doctors have been added or updated in the masterlist.`,
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
  
    const handleDownload = () => {
    const dataToExport = doctors.map(doctor => ({
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      hcpCode: doctor.hcpCode,
      specialty: doctor.specialty,
      clinic: doctor.clinic,
      coverageType: doctor.coverageType,
      province: doctor.province,
      municipality: doctor.municipality,
      placeOfPractice: doctor.placeOfPractice,
      frequency: doctor.frequency,
      hacme: doctor.hacme,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Doctor Masterlist");
    XLSX.writeFile(workbook, `doctor_masterlist_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const headers = ['firstName', 'lastName', 'hcpCode', 'specialty', 'clinic', 'coverageType', 'province', 'municipality', 'placeOfPractice', 'frequency', 'hacme'];
    const sampleData = [
      { firstName: 'John', lastName: 'Doe', hcpCode: 'P-12345', specialty: 'Cardiology', clinic: 'Community General Hospital', coverageType: 'inbase', province: 'Metro Manila', municipality: 'Quezon City', placeOfPractice: 'Hospital', frequency: '2x', hacme: 'NO' },
      { firstName: 'Jane', lastName: 'Smith', hcpCode: 'P-67890', specialty: 'Pediatrics', clinic: 'City Children Clinic', coverageType: 'outbase', province: 'Cebu', municipality: 'Cebu City', placeOfPractice: 'Clinic', frequency: '3x', hacme: 'YES' }
    ];
    
    const workbook = XLSX.utils.book_new();

    // Main template sheet
    const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    worksheet['!cols'] = [
      { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 40 }, 
      { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 10 }
    ];
    
    // Add data validation for frequency and hacme
    const addDataValidation = (worksheet: XLSX.WorkSheet, column: string, formula: string) => {
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
        const colIndex = headers.indexOf(column);
        if (colIndex === -1) return;

        for (let R = range.s.r + 1; R <= range.e.r + 100; ++R) { // Apply to 100 rows
            const cellRef = XLSX.utils.encode_cell({ r: R, c: colIndex });
            if (!worksheet[cellRef]) worksheet[cellRef] = { t: 's', v: undefined };
            if (!worksheet[cellRef].v) {
                worksheet[cellRef].v = undefined;
            }
            worksheet[cellRef].t = 's';
            if (!worksheet[cellRef].s) worksheet[cellRef].s = {};
            worksheet[cellRef].s.dataValidation = {
                type: 'list',
                allowBlank: true,
                showInputMessage: true,
                showErrorMessage: true,
                formula1: formula,
            };
        }
    };
    
    addDataValidation(worksheet, 'frequency', '"1x,2x,3x,4x"');
    addDataValidation(worksheet, 'hacme', '"YES,NO"');
    addDataValidation(worksheet, 'coverageType', '"inbase,outbase"');


    XLSX.utils.book_append_sheet(workbook, worksheet, 'Doctors Template');
    
    // Data validation sheet
    const validationData: (string | null)[][] = [];
    const provinceNames = provinces.map(p => p.name);
    const maxMunis = Math.max(...provinces.map(p => p.municipalities.length));

    // Header row for provinces
    validationData.push(provinceNames);

    // Data rows for municipalities
    for(let i = 0; i < maxMunis; i++) {
        const row: (string | null)[] = [];
        for(let j = 0; j < provinces.length; j++) {
            row.push(provinces[j].municipalities[i] || null);
        }
        validationData.push(row);
    }
    
    const validationSheet = XLSX.utils.aoa_to_sheet(validationData);
    
    // Hide the sheet
    if (!workbook.Workbook) workbook.Workbook = {};
    if (!workbook.Workbook.Sheets) workbook.Workbook.Sheets = [];
    
    const sheetIndex = workbook.SheetNames.length;
    XLSX.utils.book_append_sheet(workbook, validationSheet, 'DataValidationSheet');
    workbook.Workbook.Sheets[sheetIndex] = {
        name: 'DataValidationSheet',
        Hidden: 1 // 1 for hidden, 2 for very hidden
    };

    // Add data validation for Province
    addDataValidation(worksheet, 'province', `DataValidationSheet!$A$1:$${XLSX.utils.encode_col(provinceNames.length - 1)}$1`);
    
    // Note: Dependent dropdown for municipality is complex to set up via this library.
    // We add instructions on how to set it up manually.
    const instructionCell = "L1";
    if(!worksheet[instructionCell]) worksheet[instructionCell] = { t: 's', v: '' };
    worksheet[instructionCell].v = "To enable dependent municipality dropdowns, please follow these steps in Excel:\n1. Select the Municipality column (H).\n2. Go to Data > Data Validation.\n3. Choose 'List' from the Allow dropdown.\n4. In the Source formula box, enter: =INDIRECT(SUBSTITUTE(G2,\" \",\"_\"))\n(Assuming province is in column G, starting at row 2)\n5. You will also need to create Named Ranges for each province's municipality list on the DataValidationSheet.";


    XLSX.writeFile(workbook, 'doctor_masterlist_template.xlsx');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="font-headline">Doctor Masterlist ({doctors.length})</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              {readOnly ? "A read-only view of this user's masterlist." : "Add, edit, or remove doctors from your list."}
               <span className="hidden sm:inline">-</span>
               <div className="flex gap-2">
                  {(Object.keys(frequencyCounts) as ('1x'|'2x'|'3x'|'4x')[]).map(key => (
                    <Badge key={key} variant="secondary">{key}: {frequencyCounts[key] || 0}</Badge>
                  ))}
               </div>
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
              <Button onClick={handleDownload} variant="outline">
                <Download className="mr-2" />
                Download
              </Button>
              <Button onClick={handleDownloadTemplate} variant="outline">
                <Download className="mr-2" />
                Template
              </Button>
            {!readOnly && (
                <>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept=".xlsx, .xls"
                    />
                    {selectedDoctorIds.length > 0 && (
                        <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" disabled={readOnly}>
                            <Trash2 className="mr-2" />
                            Delete Selected ({selectedDoctorIds.length})
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently delete {selectedDoctorIds.length} doctor(s) from your masterlist. This action cannot be undone.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteSelected}>Continue</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                        </AlertDialog>
                    )}
                    <Button onClick={handleUploadClick} variant="outline" disabled={readOnly}>
                        <Upload className="mr-2" />
                        Upload
                    </Button>
                    <Button onClick={handleAddNew} disabled={readOnly}>
                        <Plus className="mr-2" />
                        Add Doctor
                    </Button>
                </>
            )}
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
                        {!readOnly && (
                          <TableHead className="w-[50px]">
                            <Checkbox 
                              checked={selectedDoctorIds.length === filteredDoctors.length && filteredDoctors.length > 0}
                              onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                            />
                          </TableHead>
                        )}
                        <TableHead>Name</TableHead>
                        <TableHead>HCP Code</TableHead>
                        <TableHead>Specialty</TableHead>
                        <TableHead>Clinic</TableHead>
                        <TableHead>Coverage</TableHead>
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
                            <TableRow key={doctor.id} data-completed={isCompleted} className={cn(isCompleted && "bg-primary/10 hover:bg-primary/20", selectedDoctorIds.includes(doctor.id) && "bg-secondary/50")}>
                                {!readOnly && (
                                  <TableCell>
                                    <Checkbox 
                                      checked={selectedDoctorIds.includes(doctor.id)}
                                      onCheckedChange={(checked) => handleSelectDoctor(doctor.id, Boolean(checked))}
                                    />
                                  </TableCell>
                                )}
                                <TableCell className="font-medium">{doctor.firstName} {doctor.lastName}</TableCell>
                                <TableCell>{doctor.hcpCode}</TableCell>
                                <TableCell>{doctor.specialty}</TableCell>
                                <TableCell>{doctor.clinic}</TableCell>
                                <TableCell className="capitalize">{doctor.coverageType}</TableCell>
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
                                  {!readOnly && (
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
                                  )}
                                </TableCell>
                            </TableRow>
                          );
                        })
                    ) : (
                        <TableRow>
                            <TableCell colSpan={readOnly ? 10 : 11} className="h-24 text-center">
                                {doctors.length > 0 ? "No doctors match your filter." : "No doctors in your masterlist yet."}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
        {!readOnly && <DoctorFormDialog 
          isOpen={isFormOpen} 
          onOpenChange={setIsFormOpen}
          onSave={handleSaveDoctor}
          doctor={editingDoctor}
        />}
      </CardContent>
    </Card>
  );
}
