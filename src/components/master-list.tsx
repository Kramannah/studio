
"use client"

import type { CoverageEntry, Doctor } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useState, useMemo, useRef, useCallback } from "react";
import { Button } from "./ui/button";
import { PlusCircle, Trash2, Upload, Download, Search } from "lucide-react";
import { Input } from "./ui/input";
import { DoctorFormDialog } from "./doctor-form-dialog";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
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
} from "@/components/ui/alert-dialog";
import { Checkbox } from "./ui/checkbox";
import { Badge } from "./ui/badge";

type MasterListProps = {
  doctors: Doctor[];
  entries: CoverageEntry[];
  onAddDoctor: (doctor: Omit<Doctor, 'id'>) => void;
  onUpdateDoctor: (doctor: Doctor) => void;
  onDeleteDoctor: (id: string) => void;
  onAddDoctorsBulk: (doctors: Omit<Doctor, 'id' | 'userId'>[]) => void;
  onDeleteDoctorsBulk: (ids: string[]) => void;
  readOnly?: boolean;
}

export function MasterList({ doctors, entries, onAddDoctor, onUpdateDoctor, onDeleteDoctor, onAddDoctorsBulk, onDeleteDoctorsBulk, readOnly = false }: MasterListProps) {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedDoctor, setSelectedDoctor] = useState<Doctor | undefined>(undefined);
    const [filter, setFilter] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const visitCountsThisMonth = useMemo(() => {
        return entries.reduce((acc, entry) => {
            const doctorName = `${entry.firstName} ${entry.lastName}`.toLowerCase();
            acc[doctorName] = (acc[doctorName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }, [entries]);

    const filteredDoctors = useMemo(() => {
        return doctors.filter(doctor =>
            `${doctor.firstName} ${doctor.lastName}`.toLowerCase().includes(filter.toLowerCase()) ||
            doctor.specialty.toLowerCase().includes(filter.toLowerCase()) ||
            doctor.clinic.toLowerCase().includes(filter.toLowerCase()) ||
            (doctor.province && doctor.province.toLowerCase().includes(filter.toLowerCase())) ||
            (doctor.municipality && doctor.municipality.toLowerCase().includes(filter.toLowerCase()))
        );
    }, [doctors, filter]);

    const frequencyCounts = useMemo(() => {
        return doctors.reduce((acc, doctor) => {
            const freq = doctor.frequency;
            acc[freq] = (acc[freq] || 0) + 1;
            return acc;
        }, {} as Record<'1x' | '2x' | '3x' | '4x', number>);
    }, [doctors]);

    const handleAddClick = () => {
        setSelectedDoctor(undefined);
        setIsFormOpen(true);
    };

    const handleEditClick = (doctor: Doctor) => {
        setSelectedDoctor(doctor);
        setIsFormOpen(true);
    };

    const handleSaveDoctor = (doctor: Omit<Doctor, 'id'> | Doctor) => {
        if ('id' in doctor) {
            onUpdateDoctor(doctor);
        } else {
            onAddDoctor(doctor);
        }
        setIsFormOpen(false);
    };
    
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
                const json: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                if (json.length < 2) {
                    toast({
                        variant: "destructive",
                        title: "Empty File",
                        description: "The Excel file is empty or has no data rows.",
                    });
                    return;
                }

                const headerRow: string[] = json[0].map((h: any) => String(h || '').toLowerCase().trim());
                const bodyRows = json.slice(1);

                const findColIndex = (possibleNames: string[]) => {
                    for (const name of possibleNames) {
                        const index = headerRow.findIndex((h) => h.includes(name.toLowerCase()));
                        if (index > -1) return index;
                    }
                    return -1;
                };

                const colMap = {
                    firstName: findColIndex(['firstname', 'first name']),
                    lastName: findColIndex(['lastname', 'last name']),
                    hcpCode: findColIndex(['hcpcode', 'hcp code']),
                    specialty: findColIndex(['specialty']),
                    clinic: findColIndex(['clinic', 'hospital', 'hospital/clinic']),
                    coverageType: findColIndex(['coverage', 'coveragetype', 'coverage type']),
                    province: findColIndex(['province']),
                    municipality: findColIndex(['municipality', 'city/municipality', 'city']),
                    placeOfPractice: findColIndex(['placeofpractice', 'place of practice']),
                    frequency: findColIndex(['target', 'frequency', 'freq']),
                    hacme: findColIndex(['hacme']),
                    dapavid: findColIndex(['dapavid']),
                    hofovir: findColIndex(['hofovir']),
                    inox: findColIndex(['inox']),
                    irinovid: findColIndex(['irinovid']),
                    ondavid: findColIndex(['ondavid']),
                    ricamTablet: findColIndex(['ricam tablet']),
                    tocovid100mg: findColIndex(['tocovid 100mg']),
                    tocovid200mg: findColIndex(['tocovid 200mg']),
                    tocovidVitality: findColIndex(['tocovid vitality']),
                    virestCream: findColIndex(['virest cream']),
                    virestTab: findColIndex(['virest tab']),
                };

                if (colMap.firstName === -1 || colMap.lastName === -1) {
                    toast({
                        variant: "destructive",
                        title: "Missing Required Columns",
                        description: "Please ensure your file includes 'First Name' and 'Last Name' columns.",
                    });
                    return;
                }

                const doctorsToUpload: Omit<Doctor, 'id' | 'userId'>[] = [];

                for (const row of bodyRows) {
                    const getVal = (i: number) => (i > -1 && row[i] ? String(row[i]).trim() : "");

                    const firstName = getVal(colMap.firstName);
                    const lastName = getVal(colMap.lastName);
                    if (!firstName || !lastName) continue;

                    const frequencyValue = getVal(colMap.frequency).toLowerCase();
                    const hacmeValue = getVal(colMap.hacme).toUpperCase();
                    const coverageTypeValue = getVal(colMap.coverageType).toLowerCase();

                    doctorsToUpload.push({
                        firstName,
                        lastName,
                        hcpCode: getVal(colMap.hcpCode),
                        specialty: getVal(colMap.specialty) || 'Unknown',
                        clinic: getVal(colMap.clinic) || 'Unknown',
                        province: getVal(colMap.province),
                        municipality: getVal(colMap.municipality),
                        placeOfPractice: getVal(colMap.placeOfPractice),
                        frequency: (["1x", "2x", "3x", "4x"].includes(frequencyValue) ? frequencyValue : "1x") as "1x" | "2x" | "3x" | "4x",
                        hacme: (["YES", "NO"].includes(hacmeValue) ? hacmeValue : "NO") as "YES" | "NO",
                        coverageType: (["inbase", "outbase"].includes(coverageTypeValue) ? coverageTypeValue : undefined) as "inbase" | "outbase" | undefined,
                        dapavid: getVal(colMap.dapavid),
                        hofovir: getVal(colMap.hofovir),
                        inox: getVal(colMap.inox),
                        irinovid: getVal(colMap.irinovid),
                        ondavid: getVal(colMap.ondavid),
                        ricamTablet: getVal(colMap.ricamTablet),
                        tocovid100mg: getVal(colMap.tocovid100mg),
                        tocovid200mg: getVal(colMap.tocovid200mg),
                        tocovidVitality: getVal(colMap.tocovidVitality),
                        virestCream: getVal(colMap.virestCream),
                        virestTab: getVal(colMap.virestTab),
                    });
                }

                if (doctorsToUpload.length === 0) {
                    toast({
                        variant: "destructive",
                        title: "Upload Failed",
                        description: "No valid doctor entries found in the file.",
                    });
                    return;
                }

                onAddDoctorsBulk(doctorsToUpload);
                toast({
                    variant: "default",
                    title: "Upload Success",
                    description: `${doctorsToUpload.length} doctor(s) processed for upload.`,
                });

            } catch (error) {
                console.error("Excel parse error", error);
                toast({
                    variant: "destructive",
                    title: "Upload Failed",
                    description: "Could not process your doctor master list file. Please check the file format.",
                });
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleDownloadTemplate = () => {
        const headers = [
            'First Name', 'Last Name', 'HCP Code', 'Specialty', 
            'Clinic', 'Province', 'Municipality', 'Place of Practice', 
            'Frequency', 'HACME', 'Coverage Type', 'Dapavid', 'Hofovir',
            'Inox', 'Irinovid', 'Ondavid', 'Ricam Tablet', 'Tocovid 100mg',
            'Tocovid 200mg', 'Tocovid Vitality', 'Virest Cream', 'Virest Tab'
        ];
        const sampleData = [
            { 
                'First Name': 'Juan', 'Last Name': 'Dela Cruz', 'HCP Code': '12345', 'Specialty': 'Cardiology',
                'Clinic': 'Philippine Heart Center', 'Province': 'Metro Manila', 'Municipality': 'Quezon City', 
                'Place of Practice': 'Hospital', 'Frequency': '3x', 'HACME': 'YES', 'Coverage Type': 'inbase',
                'Dapavid': 'Rx', 'Hofovir': '', 'Inox': '', 'Irinovid': '', 'Ondavid': '', 
                'Ricam Tablet': 'Sample', 'Tocovid 100mg': '', 'Tocovid 200mg': '', 'Tocovid Vitality': '',
                'Virest Cream': '', 'Virest Tab': ''
            }
        ];

        const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Doctors Template');

        worksheet['!cols'] = [
            { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 20 },
            { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
            { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, 
            { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
            { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
            { wch: 15 }, { wch: 15 }
        ];

        XLSX.writeFile(workbook, 'doctors_masterlist_template.xlsx');
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(filteredDoctors.map(d => d.id));
        } else {
            setSelectedIds([]);
        }
    };
    
    const handleRowSelect = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds(prev => [...prev, id]);
        } else {
            setSelectedIds(prev => prev.filter(i => i !== id));
        }
    };

    const handleDeleteSelected = () => {
        onDeleteDoctorsBulk(selectedIds);
        setSelectedIds([]);
    }


    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <CardTitle className="font-headline">Doctor Master List</CardTitle>
                            <CardDescription>A complete list of all doctors in your territory.</CardDescription>
                        </div>
                        {!readOnly && (
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
                                    Template
                                </Button>
                                <Button onClick={handleUploadClick}>
                                    <Upload className="mr-2" />
                                    Upload
                                </Button>
                                <Button onClick={handleAddClick}>
                                    <PlusCircle className="mr-2" />
                                    Add Doctor
                                </Button>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-4 mt-4">
                        <h3 className="text-sm font-semibold">Frequency Counts:</h3>
                        <div className="flex flex-wrap items-center gap-2">
                            {(Object.keys(frequencyCounts) as Array<keyof typeof frequencyCounts>).sort().map(freq => (
                                frequencyCounts[freq] > 0 && (
                                <Badge key={freq} variant="secondary" className="text-sm">
                                    {freq}: <span className="ml-1 font-bold">{frequencyCounts[freq]}</span>
                                </Badge>
                                )
                            ))}
                        </div>
                    </div>
                     <div className="flex flex-col items-start gap-4 mt-4 md:flex-row md:items-center md:justify-between">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute w-4 h-4 -translate-y-1/2 left-3 top-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Filter by name, specialty, or location..."
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        {!readOnly && selectedIds.length > 0 && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive">
                                        <Trash2 className="mr-2" />
                                        Delete Selected ({selectedIds.length})
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This action cannot be undone. This will permanently delete {selectedIds.length} doctor(s) from your master list.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDeleteSelected}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {!readOnly && (
                                        <TableHead className="w-12">
                                            <Checkbox
                                                checked={selectedIds.length > 0 && selectedIds.length === filteredDoctors.length}
                                                onCheckedChange={handleSelectAll}
                                            />
                                        </TableHead>
                                    )}
                                    <TableHead>Name</TableHead>
                                    <TableHead>Specialty</TableHead>
                                    <TableHead>HCP Code</TableHead>
                                    <TableHead>Clinic / Hospital</TableHead>
                                    <TableHead>Location</TableHead>
                                    <TableHead>Practice</TableHead>
                                    <TableHead>Target</TableHead>
                                    <TableHead>Coverage</TableHead>
                                    <TableHead>HACME</TableHead>
                                    <TableHead>Dapavid</TableHead>
                                    <TableHead>Hofovir</TableHead>
                                    <TableHead>Inox</TableHead>
                                    <TableHead>Irinovid</TableHead>
                                    <TableHead>Ondavid</TableHead>
                                    <TableHead>Ricam Tablet</TableHead>
                                    <TableHead>Tocovid 100mg</TableHead>
                                    <TableHead>Tocovid 200mg</TableHead>
                                    <TableHead>Tocovid Vitality</TableHead>
                                    <TableHead>Virest Cream</TableHead>
                                    <TableHead>Virest Tab</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredDoctors.length > 0 ? (
                                    filteredDoctors.map((doctor) => {
                                        return (
                                        <TableRow key={doctor.id} data-state={selectedIds.includes(doctor.id) ? "selected" : ""}>
                                            {!readOnly && (
                                                <TableCell>
                                                    <Checkbox 
                                                        checked={selectedIds.includes(doctor.id)}
                                                        onCheckedChange={(checked) => handleRowSelect(doctor.id, !!checked)}
                                                    />
                                                </TableCell>
                                            )}
                                            <TableCell className="font-medium">{doctor.firstName} {doctor.lastName}</TableCell>
                                            <TableCell>{doctor.specialty}</TableCell>
                                            <TableCell>{doctor.hcpCode || 'N/A'}</TableCell>
                                            <TableCell>{doctor.clinic}</TableCell>
                                            <TableCell>{doctor.municipality}, {doctor.province}</TableCell>
                                            <TableCell>{doctor.placeOfPractice || 'N/A'}</TableCell>
                                            <TableCell>{doctor.frequency}</TableCell>
                                            <TableCell className="capitalize">{doctor.coverageType || 'N/A'}</TableCell>
                                            <TableCell>
                                                <Badge variant={doctor.hacme === 'YES' ? 'default' : 'secondary'}>{doctor.hacme || 'NO'}</Badge>
                                            </TableCell>
                                            <TableCell>{doctor.dapavid}</TableCell>
                                            <TableCell>{doctor.hofovir}</TableCell>
                                            <TableCell>{doctor.inox}</TableCell>
                                            <TableCell>{doctor.irinovid}</TableCell>
                                            <TableCell>{doctor.ondavid}</TableCell>
                                            <TableCell>{doctor.ricamTablet}</TableCell>
                                            <TableCell>{doctor.tocovid100mg}</TableCell>
                                            <TableCell>{doctor.tocovid200mg}</TableCell>
                                            <TableCell>{doctor.tocovidVitality}</TableCell>
                                            <TableCell>{doctor.virestCream}</TableCell>
                                            <TableCell>{doctor.virestTab}</TableCell>
                                            <TableCell className="text-right">
                                                {!readOnly && (
                                                    <Button variant="ghost" size="sm" onClick={() => handleEditClick(doctor)}>Edit</Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )})
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={readOnly ? 21 : 22} className="h-24 text-center">
                                            No doctors found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
            {!readOnly && (
                <DoctorFormDialog
                    isOpen={isFormOpen}
                    onOpenChange={setIsFormOpen}
                    onSave={handleSaveDoctor}
                    doctor={selectedDoctor}
                />
            )}
        </>
    );
}
