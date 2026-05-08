"use client"

import type { CoverageEntry, Doctor } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { PlusCircle, Trash2, Upload, Download, Search, Edit, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, MapPin, Building2, Pill, Settings2 } from "lucide-react";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "./ui/checkbox";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import React from "react";

type ProductKey = keyof Pick<Doctor, 'dapavid' | 'hofovir' | 'inox' | 'irinovid' | 'ondavid' | 'ricamTablet' | 'tocovid100mg' | 'tocovid200mg' | 'tocovidVitality' | 'virestCream' | 'virestTab'>;

const productLabels: Record<ProductKey, string> = {
    dapavid: "Dapavid",
    hofovir: "Hofovir",
    inox: "Inox",
    irinovid: "Irinovid",
    ondavid: "Ondavid",
    ricamTablet: "Ricam Tablet",
    tocovid100mg: "Tocovid 100mg",
    tocovid200mg: "Tocovid 200mg",
    tocovidVitality: "Tocovid Vitality",
    virestCream: "Virest Cream",
    virestTab: "Virest Tab",
};

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
        "h-8 w-full border-transparent bg-transparent px-1 transition-colors duration-300 ease-in-out hover:border-input focus:border-input focus:bg-background focus:ring-1 focus:ring-ring",
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
        <div className="space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{productLabels[productKey]}</p>
            <Select onValueChange={handleValueChange} value={currentValue}>
                <SelectTrigger className={cn("w-full h-8 text-xs", colorClasses)}>
                    <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                    {productPrescriberOptions.map(option => (
                        <SelectItem key={option} value={option} className="text-xs">{option}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
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
        <Select onValueChange={handleValueChange} value={doctor[field] as string}>
            <SelectTrigger className={cn("h-8 text-xs", className)}>
                <SelectValue placeholder={placeholder || "Select..."} />
            </SelectTrigger>
            <SelectContent>
                {options.map(option => (
                    <SelectItem key={String(option.value)} value={String(option.value)} className="text-xs">
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

const DoctorRow = ({ 
    doctor, 
    onUpdateDoctor, 
    readOnly, 
    isSelected, 
    onSelect,
    onEdit
}: { 
    doctor: Doctor; 
    onUpdateDoctor: (d: Doctor) => void; 
    readOnly: boolean; 
    isSelected: boolean;
    onSelect: (id: string, checked: boolean) => void;
    onEdit: (d: Doctor) => void;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const productKeys: ProductKey[] = ['dapavid', 'hofovir', 'inox', 'irinovid', 'ondavid', 'ricamTablet', 'tocovid100mg', 'tocovid200mg', 'tocovidVitality', 'virestCream', 'virestTab'];

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
        <React.Fragment>
            <TableRow className={cn(isOpen && "bg-muted/30")}>
                {!readOnly && (
                    <TableCell className="w-10">
                        <Checkbox 
                            checked={isSelected}
                            onCheckedChange={(checked) => onSelect(doctor.id, !!checked)}
                        />
                    </TableCell>
                )}
                <TableCell className="font-medium">
                    <div className="flex flex-col">
                        <span>{doctor.firstName} {doctor.lastName}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{doctor.hcpCode || 'No HCP Code'}</span>
                    </div>
                </TableCell>
                <TableCell>
                    <InlineInputCell
                        initialValue={doctor.specialty}
                        onSave={(newValue) => onUpdateDoctor({ ...doctor, specialty: newValue })}
                        placeholder="N/A"
                        className="text-xs"
                    />
                </TableCell>
                <TableCell className="w-24">
                     <InlineSelect
                        doctor={doctor}
                        field="frequency"
                        options={frequencyOptions}
                        onUpdateDoctor={onUpdateDoctor}
                        className="w-full"
                    />
                </TableCell>
                <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                        {!readOnly && (
                            <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)} title="Toggle Details">
                                {isOpen ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                            </Button>
                        )}
                    </div>
                </TableCell>
            </TableRow>
            {isOpen && (
                <TableRow className="bg-muted/10">
                    <TableCell colSpan={readOnly ? 4 : 5} className="p-0">
                        <div className="p-4 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b pb-4">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-tight">
                                        <Building2 className="w-3 h-3" /> Facility Details
                                    </div>
                                    <InlineInputCell
                                        initialValue={doctor.clinic}
                                        onSave={(newValue) => onUpdateDoctor({ ...doctor, clinic: newValue })}
                                        placeholder="Clinic/Hospital Name"
                                        className="bg-background/50 text-xs"
                                    />
                                    <InlineInputCell
                                        initialValue={doctor.placeOfPractice}
                                        onSave={(newValue) => onUpdateDoctor({ ...doctor, placeOfPractice: newValue })}
                                        placeholder="Place of Practice"
                                        className="bg-background/50 text-xs"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-tight">
                                        <MapPin className="w-3 h-3" /> Location
                                    </div>
                                    <p className="text-xs px-1 text-muted-foreground">
                                        {[doctor.municipality, doctor.province].filter(Boolean).join(', ') || 'Address not set'}
                                    </p>
                                    <div className="flex gap-2 pt-1">
                                        <div className="flex-1 space-y-1">
                                            <p className="text-[10px] text-muted-foreground px-1">Coverage</p>
                                            <InlineSelect
                                                doctor={doctor}
                                                field="coverageType"
                                                options={coverageTypeOptions}
                                                onUpdateDoctor={onUpdateDoctor}
                                                className="w-full h-8"
                                            />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                             <p className="text-[10px] text-muted-foreground px-1">HACME</p>
                                             <InlineSelect
                                                doctor={doctor}
                                                field="hacme"
                                                options={hacmeOptions}
                                                onUpdateDoctor={onUpdateDoctor}
                                                className="w-full h-8"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col justify-end">
                                     <Button variant="outline" size="sm" className="w-full" onClick={() => onEdit(doctor)}>
                                        <Edit className="w-3 h-3 mr-2" /> Full Edit
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-tight">
                                    <Pill className="w-3 h-3" /> Product Prescriber Profile
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                                    {productKeys.map(key => (
                                        <ProductPrescriberSelect key={key} doctor={doctor} productKey={key} onUpdateDoctor={onUpdateDoctor} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </TableCell>
                </TableRow>
            )}
        </React.Fragment>
    );
};

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
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const filteredDoctors = useMemo(() => {
        const q = (filter ?? "").toLowerCase().trim();
        return (doctors || []).filter(d => {
            const name = `${(d.firstName ?? "")} ${(d.lastName ?? "")}`.toLowerCase();
            const specialty = (d.specialty ?? "").toLowerCase();
            const clinic = (d.clinic ?? "").toLowerCase();
            return name.includes(q) || specialty.includes(q) || clinic.includes(q);
        });
    }, [doctors, filter]);

    const totalPages = Math.ceil(filteredDoctors.length / itemsPerPage);
    
    useEffect(() => {
        setCurrentPage(1);
    }, [filter]);

    const paginatedDoctors = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredDoctors.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredDoctors, currentPage]);

    const frequencyCounts = useMemo(() => {
        return (doctors || []).reduce((acc, d) => {
            if (d.frequency) acc[d.frequency] = (acc[d.frequency] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }, [doctors]);

    const handleAddClick = () => {
        setSelectedDoctor(undefined);
        setIsFormOpen(true);
    };

    const handleEditDoctor = (doctor: Doctor) => {
        setSelectedDoctor(doctor);
        setIsFormOpen(true);
    };

    const handleSaveDoctor = (doctor: Omit<Doctor, 'id'> | Doctor) => {
        if ('id' in doctor) {
            onUpdateDoctor(doctor as Doctor);
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
                    toast({ variant: "destructive", title: "Empty File", description: "The Excel file is empty or has no data rows." });
                    return;
                }

                const headerRow: string[] = json[0].map((h: any) => String(h ?? '').toLowerCase().trim());
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
                    clinic: findColIndex(['clinic', 'hospital']),
                    coverageType: findColIndex(['coverage', 'coveragetype']),
                    province: findColIndex(['province']),
                    municipality: findColIndex(['municipality', 'city']),
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
                    toast({ variant: "destructive", title: "Missing Columns", description: "Please ensure your file includes 'First Name' and 'Last Name'." });
                    return;
                }

                const doctorsToUpload: Omit<Doctor, 'id' | 'userId'>[] = [];
                const productKeys: ProductKey[] = ['dapavid', 'hofovir', 'inox', 'irinovid', 'ondavid', 'ricamTablet', 'tocovid100mg', 'tocovid200mg', 'tocovidVitality', 'virestCream', 'virestTab'];

                for (const row of bodyRows) {
                    const getVal = (i: number) => (i > -1 && row[i] ? String(row[i]).trim() : "");
                    const firstName = getVal(colMap.firstName);
                    const lastName = getVal(colMap.lastName);
                    if (!firstName || !lastName) continue;

                    const freq = getVal(colMap.frequency).toLowerCase();
                    const doc: any = {
                        firstName,
                        lastName,
                        frequency: (["1x", "2x", "3x", "4x"].includes(freq) ? freq : "1x") as any,
                        hacme: (getVal(colMap.hacme).toUpperCase() === "YES" ? "YES" : "NO") as any,
                        specialty: getVal(colMap.specialty),
                        clinic: getVal(colMap.clinic),
                        hcpCode: getVal(colMap.hcpCode),
                        province: getVal(colMap.province),
                        municipality: getVal(colMap.municipality),
                        placeOfPractice: getVal(colMap.placeOfPractice),
                        coverageType: (getVal(colMap.coverageType) ?? "").toLowerCase() === 'outbase' ? 'outbase' : 'inbase'
                    };

                    productKeys.forEach(key => {
                        const val = getVal(colMap[key]);
                        if(val) doc[key] = val;
                    });

                    doctorsToUpload.push(doc);
                }

                if (doctorsToUpload.length > 0) {
                    onAddDoctorsBulk(doctorsToUpload);
                }
            } catch (error) {
                console.error("Excel parse error", error);
                toast({ variant: "destructive", title: "Upload Failed" });
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleDownloadTemplate = () => {
        const headers = ['First Name', 'Last Name', 'HCP Code', 'Specialty', 'Clinic', 'Province', 'Municipality', 'Place of Practice', 'Frequency', 'HACME', 'Coverage Type', 'Dapavid', 'Hofovir', 'Inox', 'Irinovid', 'Ondavid', 'Ricam Tablet', 'Tocovid 100mg', 'Tocovid 200mg', 'Tocovid Vitality', 'Virest Cream', 'Virest Tab'];
        const sampleData = [{ 'First Name': 'Juan', 'Last Name': 'Dela Cruz', 'HCP Code': '12345', 'Specialty': 'Cardiology', 'Clinic': 'Philippine Heart Center', 'Province': 'Metro Manila', 'Municipality': 'Quezon City', 'Place of Practice': 'Hospital', 'Frequency': '3x', 'HACME': 'YES', 'Coverage Type': 'inbase', 'Dapavid': 'Rx', 'Hofovir': '', 'Inox': '', 'Irinovid': '', 'Ondavid': '', 'Ricam Tablet': 'Sample', 'Tocovid 100mg': '', 'Tocovid 200mg': '', 'Tocovid Vitality': '', 'Virest Cream': '', 'Virest Tab': '' }];
        const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
        XLSX.writeFile(workbook, 'doctors_template.xlsx');
    };

    const handleDownloadExcel = () => {
        const worksheet = XLSX.utils.json_to_sheet(filteredDoctors);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Doctor Masterlist");
        XLSX.writeFile(workbook, `doctor_masterlist_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) setSelectedIds(filteredDoctors.map(d => d.id));
        else setSelectedIds([]);
    };
    
    const handleRowSelect = (id: string, checked: boolean) => {
        if (checked) setSelectedIds(prev => [...prev, id]);
        else setSelectedIds(prev => prev.filter(i => i !== id));
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex flex-col items-start gap-1 md:flex-row md:items-center md:justify-between">
                        <div>
                            <CardTitle className="font-headline">Doctor Master List</CardTitle>
                            <CardDescription>Territory data overview. Tap rows to view detailed product prescriber ratings.</CardDescription>
                        </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                        {Object.entries(frequencyCounts).map(([freq, count]) => (
                            <Badge key={freq} variant="secondary" className="text-[10px]">
                                {freq}: <span className="ml-1 font-bold">{count}</span>
                            </Badge>
                        ))}
                    </div>

                    <div className="flex flex-col items-start gap-3 mt-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-1 items-center gap-2 w-full max-xl:max-w-xl">
                            <div className="relative flex-1">
                                <Search className="absolute w-4 h-4 -translate-y-1/2 left-3 top-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Filter by name, specialty, or clinic..."
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                    className="pl-10 h-9 text-sm w-full"
                                />
                            </div>
                            
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls" />
                            <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-9">
                                        <Settings2 className="mr-2 w-4 h-4" />
                                        Actions
                                        <ChevronDown className="ml-2 w-4 h-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuLabel>Data Management</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={handleDownloadExcel}>
                                        <Download className="mr-2 w-4 h-4" /> Export Excel
                                    </DropdownMenuItem>
                                    {!readOnly && (
                                        <>
                                            <DropdownMenuItem onClick={handleDownloadTemplate}>
                                                <Download className="mr-2 w-4 h-4" /> Download Template
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuLabel>Modification</DropdownMenuLabel>
                                            <DropdownMenuItem onClick={handleUploadClick}>
                                                <Upload className="mr-2 w-4 h-4" /> Upload Masterlist
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={handleAddClick}>
                                                <PlusCircle className="mr-2 w-4 h-4" /> Add Single Doctor
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {!readOnly && selectedIds.length > 0 && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm" className="h-9">
                                        <Trash2 className="mr-2 w-4 h-4" />
                                        Delete ({selectedIds.length})
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                        <AlertDialogDescription>This will permanently delete {selectedIds.length} doctor(s).</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => { onDeleteDoctorsBulk(selectedIds); setSelectedIds([]); }}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-md overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted hover:bg-muted">
                                    {!readOnly && (
                                        <TableHead className="w-10">
                                            <Checkbox
                                                checked={selectedIds.length > 0 && selectedIds.length === paginatedDoctors.length}
                                                onCheckedChange={handleSelectAll}
                                            />
                                        </TableHead>
                                    )}
                                    <TableHead>Doctor</TableHead>
                                    <TableHead>Specialty</TableHead>
                                    <TableHead>Target</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                            {paginatedDoctors.length > 0 ? (
                                paginatedDoctors.map((doctor) => (
                                    <DoctorRow 
                                        key={doctor.id}
                                        doctor={doctor} 
                                        onUpdateDoctor={onUpdateDoctor} 
                                        readOnly={readOnly} 
                                        isSelected={selectedIds.includes(doctor.id)}
                                        onSelect={handleRowSelect}
                                        onEdit={handleEditDoctor}
                                    />
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={readOnly ? 4 : 5} className="h-32 text-center text-muted-foreground">
                                        No doctors found matching your filters.
                                    </TableCell>
                                </TableRow>
                            )}
                            </TableBody>
                        </Table>
                    </div>
                    
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4 px-1">
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                                Page {currentPage} of {totalPages}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
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
