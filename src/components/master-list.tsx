
"use client"

import type { CoverageEntry, Doctor } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Button } from "./ui/button";
import { PlusCircle, Trash2, Upload, Download, Search, Edit } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";


type ProductKey = keyof Pick<Doctor, 'dapavid' | 'hofovir' | 'inox' | 'irinovid' | 'ondavid' | 'ricamTablet' | 'tocovid100mg' | 'tocovid200mg' | 'tocovidVitality' | 'virestCream' | 'virestTab'>;

const InlineInputCell = ({
  initialValue,
  onSave,
  placeholder = "N/A",
  className,
}: {
  initialValue: string | undefined;
  onSave: (newValue: string) => void;
  placeholder?: string;
  className?: string;
}) => {
  const [value, setValue] = useState(initialValue || "");

  useEffect(() => {
    setValue(initialValue || "");
  }, [initialValue]);

  const handleBlur = () => {
    if (value !== (initialValue || "")) {
      onSave(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={cn(
        "h-8 w-full min-w-[120px] border-transparent bg-transparent px-1 transition-colors duration-300 ease-in-out hover:border-input focus:border-input focus:bg-background focus:ring-1 focus:ring-ring",
        className
      )}
    />
  );
};


const productPrescriberOptions = [
    "Non-Prescriber",
    "Intermittent Prescriber",
    "Solid Prescriber",
    "Advocate"
];

const ProductPrescriberSelect = ({ doctor, productKey, onUpdateDoctor }: { doctor: Doctor, productKey: ProductKey, onUpdateDoctor: (doctor: Doctor) => void }) => {
    const currentValue = doctor[productKey] || "";

    const handleValueChange = (newValue: string) => {
        const updatedDoctor = {
            ...doctor,
            [productKey]: newValue,
        };
        onUpdateDoctor(updatedDoctor);
    };
    
    let colorClasses = "bg-transparent text-foreground";
    switch (currentValue) {
        case "Non-Prescriber":
            colorClasses = "bg-red-600/20 text-red-100 border-red-500/50";
            break;
        case "Intermittent Prescriber":
            colorClasses = "bg-yellow-500/20 text-yellow-100 border-yellow-500/50";
            break;
        case "Solid Prescriber":
            colorClasses = "bg-green-500/20 text-green-100 border-green-500/50";
            break;
        case "Advocate":
            colorClasses = "bg-blue-500/20 text-blue-100 border-blue-500/50";
            break;
    }

    return (
        <Select onValueChange={handleValueChange} value={currentValue}>
            <SelectTrigger className={cn("w-[180px]", colorClasses)}>
                <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
                {productPrescriberOptions.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};


type InlineSelectProps<T> = {
    doctor: Doctor;
    field: keyof Doctor;
    options: { value: T; label: string }[];
    onUpdateDoctor: (doctor: Doctor) => void;
    placeholder?: string;
    className?: string;
};

function InlineSelect<T extends string>({ doctor, field, options, onUpdateDoctor, placeholder, className }: InlineSelectProps<T>) {
    const handleValueChange = (newValue: string) => {
        const updatedDoctor = { ...doctor, [field]: newValue };
        onUpdateDoctor(updatedDoctor);
    };

    return (
        <Select onValueChange={handleValueChange} value={doctor[field] as string | undefined}>
            <SelectTrigger className={cn("w-[110px]", className)}>
                <SelectValue placeholder={placeholder || "Select..."} />
            </SelectTrigger>
            <SelectContent>
                {options.map(option => (
                    <SelectItem key={String(option.value)} value={String(option.value)}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

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
    const productKeys: ProductKey[] = ['dapavid', 'hofovir', 'inox', 'irinovid', 'ondavid', 'ricamTablet', 'tocovid100mg', 'tocovid200mg', 'tocovidVitality', 'virestCream', 'virestTab'];


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
            (doctor.specialty && doctor.specialty.toLowerCase().includes(filter.toLowerCase())) ||
            (doctor.clinic && doctor.clinic.toLowerCase().includes(filter.toLowerCase())) ||
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
                        specialty: getVal(colMap.specialty) || undefined,
                        clinic: getVal(colMap.clinic) || undefined,
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

    const handleDownloadExcel = () => {
        const dataToExport = filteredDoctors.map(doctor => ({
            "First Name": doctor.firstName,
            "Last Name": doctor.lastName,
            "HCP Code": doctor.hcpCode,
            "Specialty": doctor.specialty,
            "Clinic": doctor.clinic,
            "Province": doctor.province,
            "Municipality": doctor.municipality,
            "Place of Practice": doctor.placeOfPractice,
            "Frequency": doctor.frequency,
            "HACME": doctor.hacme,
            "Coverage Type": doctor.coverageType,
            "Dapavid": doctor.dapavid,
            "Hofovir": doctor.hofovir,
            "Inox": doctor.inox,
            "Irinovid": doctor.irinovid,
            "Ondavid": doctor.ondavid,
            "Ricam Tablet": doctor.ricamTablet,
            "Tocovid 100mg": doctor.tocovid100mg,
            "Tocovid 200mg": doctor.tocovid200mg,
            "Tocovid Vitality": doctor.tocovidVitality,
            "Virest Cream": doctor.virestCream,
            "Virest Tab": doctor.virestTab,
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Doctor Masterlist");
        XLSX.writeFile(workbook, `doctor_masterlist_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
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

    const frequencyOptions = [
        { value: '1x', label: '1x' },
        { value: '2x', label: '2x' },
        { value: '3x', label: '3x' },
        { value: '4x', label: '4x' },
    ];
    const coverageTypeOptions = [
        { value: 'inbase', label: 'Inbase' },
        { value: 'outbase', label: 'Outbase' },
    ];
    const hacmeOptions = [
        { value: 'YES', label: 'YES' },
        { value: 'NO', label: 'NO' },
    ];

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <CardTitle className="font-headline">Doctor Master List</CardTitle>
                            <CardDescription>A complete list of all doctors in your territory.</CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                             <Button onClick={handleDownloadExcel} variant="outline">
                                <Download className="mr-2" />
                                Download as Excel
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
                                </>
                            )}
                        </div>
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
                    <div className="relative w-full overflow-auto border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted hover:bg-muted">
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
                                            <TableCell>
                                                 <InlineInputCell
                                                    initialValue={doctor.specialty}
                                                    onSave={(newValue) => onUpdateDoctor({ ...doctor, specialty: newValue })}
                                                    placeholder="N/A"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <InlineInputCell
                                                    initialValue={doctor.hcpCode}
                                                    onSave={(newValue) => onUpdateDoctor({ ...doctor, hcpCode: newValue })}
                                                    placeholder="N/A"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <InlineInputCell
                                                    initialValue={doctor.clinic}
                                                    onSave={(newValue) => onUpdateDoctor({ ...doctor, clinic: newValue })}
                                                    placeholder="N/A"
                                                />
                                            </TableCell>
                                            <TableCell>{[doctor.municipality, doctor.province].filter(Boolean).join(', ') || 'N/A'}</TableCell>
                                            <TableCell>
                                                <InlineInputCell
                                                    initialValue={doctor.placeOfPractice}
                                                    onSave={(newValue) => onUpdateDoctor({ ...doctor, placeOfPractice: newValue })}
                                                    placeholder="N/A"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <InlineSelect
                                                    doctor={doctor}
                                                    field="frequency"
                                                    options={frequencyOptions}
                                                    onUpdateDoctor={onUpdateDoctor}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                 <InlineSelect
                                                    doctor={doctor}
                                                    field="coverageType"
                                                    options={coverageTypeOptions}
                                                    onUpdateDoctor={onUpdateDoctor}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <InlineSelect
                                                    doctor={doctor}
                                                    field="hacme"
                                                    options={hacmeOptions}
                                                    onUpdateDoctor={onUpdateDoctor}
                                                    className="w-[80px]"
                                                />
                                            </TableCell>
                                            {productKeys.map(key => (
                                                <TableCell key={key}>
                                                    <ProductPrescriberSelect doctor={doctor} productKey={key} onUpdateDoctor={onUpdateDoctor} />
                                                </TableCell>
                                            ))}
                                            <TableCell className="text-right">
                                                {!readOnly && (
                                                    <Button variant="ghost" size="icon" onClick={() => handleEditClick(doctor)} title="Edit Doctor Details">
                                                        <Edit className="w-4 h-4"/>
                                                    </Button>
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

    