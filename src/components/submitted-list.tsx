
"use client"

import type { CoverageEntry, Doctor } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay, isBefore, isSameDay, isValid, startOfWeek, addDays, getWeekOfMonth, endOfMonth, getHours, set, startOfMonth, isToday, parse } from "date-fns";
import Image from "next/image";
import { useState, useMemo, useRef, useEffect } from "react";
import { Calendar as CalendarIcon, Download, MoreHorizontal, Trash2, FileArchive, ChevronDown, ChevronUp, Edit, List, Calendar as CalendarViewIcon, Send, Sparkles, Loader2, Package } from "lucide-react";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';


import { Button } from "./ui/button";
import * as XLSX from 'xlsx';
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "@/lib/utils";
import { Calendar } from "./ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { analyzeReport, ReportAnalysisInput, ReportAnalysisOutput } from "@/ai/flows/analyze-report-flow";
import { Checkbox } from "./ui/checkbox";
import { USER_DATA_MAP } from "@/lib/user-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type SubmittedListProps = {
    entries: CoverageEntry[];
    doctors: Doctor[];
    onDelete: (id: string) => void;
    onDeleteBulk?: (ids: string[]) => void;
    onEdit: (entry: CoverageEntry) => void;
    readOnly?: boolean;
    isAdminView?: boolean;
    userMap?: Record<string, { code: string; firstName: string; lastName: string; }>;
};

type ViewMode = 'list' | 'calendar';


const DetailItem = ({ label, value }: { label: string, value?: string | number | null }) => {
    if (!value && typeof value !== 'number') return null;
    return (
        <div>
            <p className="text-xs font-semibold text-muted-foreground">{label}</p>
            <p className="text-sm">{value}</p>
        </div>
    )
}

const EntryRow = ({ entry, doctors, onDelete, onEdit, onAnalyze, readOnly, isSelected, onSelect, isAdminView, userMap, onOpenImageViewer }: { entry: CoverageEntry, doctors: Doctor[], onDelete: (id: string) => void, onEdit: (entry: CoverageEntry) => void, onAnalyze: (entry: CoverageEntry) => void, readOnly?: boolean, isSelected: boolean, onSelect: (id: string, checked: boolean) => void, isAdminView?: boolean, userMap?: Record<string, { code: string; firstName: string; lastName: string; }>, onOpenImageViewer: (imageUrl: string) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    
    const doctor = useMemo(() => {
        return doctors.find(d =>
            d.firstName.toLowerCase() === entry.firstName?.toLowerCase() &&
            d.lastName.toLowerCase() === entry.lastName?.toLowerCase()
        );
    }, [doctors, entry.firstName, entry.lastName]);

    const frequency = doctor?.frequency;

    const handleDownloadAttachments = async (entry: CoverageEntry) => {
        const zip = new JSZip();
        
        if (entry.photos && entry.photos.length > 0) {
            const photoData = entry.photos[0].split(',')[1];
            zip.file("photo.png", photoData, { base64: true });
        }
        
        if (entry.signature) {
            const signatureData = entry.signature.split(',')[1];
            zip.file("signature.png", signatureData, { base64: true });
        }
        
        if (entry.dsmSignature) {
            const dsmSignatureData = entry.dsmSignature.split(',')[1];
            zip.file("dsm_signature.png", dsmSignatureData, { base64: true });
        }
        if (entry.jointCallSignature) {
            const jointCallSignatureData = entry.jointCallSignature.split(',')[1];
            zip.file(`${entry.jointCallWith}_signature.png`, jointCallSignatureData, { base64: true });
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, `attachments_${entry.firstName}_${entry.lastName}_${entry.id.substring(0, 8)}.zip`);
    };

    const isEditable = useMemo(() => {
        if (readOnly) return false;
        const submittedDate = typeof entry.submittedAt === 'string' ? parseISO(entry.submittedAt) : entry.submittedAt;
        if (!isValid(submittedDate)) return false;

        // An entry is editable if it was submitted today before 11:00 PM.
        const now = new Date();
        const endOfEditWindow = set(startOfDay(now), { hours: 23 }); // 11:00 PM today

        return isToday(submittedDate) && isBefore(now, endOfEditWindow);
    }, [entry.submittedAt, readOnly]);

    const submittedDate = typeof entry.submittedAt === 'string' ? parseISO(entry.submittedAt) : entry.submittedAt;

    const getUserName = (userId: string) => {
        if (!userMap) return userId;
        const user = userMap[userId] || USER_DATA_MAP[userId];
        return user ? `${user.firstName} ${user.lastName}` : `User ID: ${userId.substring(0,6)}...`;
    }

    return (
         <Collapsible asChild>
            <TableBody>
            <TableRow data-state={isSelected ? "selected" : "unselected"}>
                <TableCell>
                    <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => onSelect(entry.id, Boolean(checked))}
                        aria-label="Select row"
                    />
                </TableCell>
                {isAdminView && (
                    <TableCell>
                        <Badge variant="secondary" className="font-sans">{getUserName(entry.userId)}</Badge>
                    </TableCell>
                )}
                <TableCell className="font-medium">
                    <div className="flex flex-col">
                        <span>{entry.firstName} {entry.lastName}</span>
                        <span className="text-xs text-muted-foreground">{entry.specialty}</span>
                    </div>
                </TableCell>
                <TableCell>{entry.clinic}</TableCell>
                <TableCell>{isValid(submittedDate) ? format(submittedDate, "PPP") : 'Invalid Date'}</TableCell>
                <TableCell>{frequency ? <Badge variant="outline">{frequency}</Badge> : 'N/A'}</TableCell>
                <TableCell>
                    <div className="flex items-center gap-2">
                        {entry.photos && entry.photos.length > 0 && (
                            <div className="flex -space-x-4">
                                {entry.photos.map((photo, index) => (
                                    <button type="button" key={index} onClick={() => onOpenImageViewer(photo)} className="transition-transform duration-200 ease-in-out rounded-full focus:outline-none focus:ring-2 focus:ring-ring hover:scale-110">
                                        <Image src={photo} alt={`photo ${index}`} width={40} height={40} className="object-cover border-2 rounded-full border-background" />
                                    </button>
                                ))}
                            </div>
                        )}
                        {entry.signature && (
                            <button type="button" onClick={() => onOpenImageViewer(entry.signature!)} className="p-1 transition-transform duration-200 ease-in-out bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-ring hover:scale-110">
                                <Image src={entry.signature} alt="signature" width={40} height={20} className="bg-white" />
                            </button>
                        )}
                        {entry.dsmSignature && (
                             <button type="button" onClick={() => onOpenImageViewer(entry.dsmSignature!)} className="p-1 transition-transform duration-200 ease-in-out bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-ring hover:scale-110">
                                <Image src={entry.dsmSignature} alt="dsm signature" width={40} height={20} className="bg-white" />
                            </button>
                        )}
                         {entry.jointCallSignature && (
                            <button type="button" onClick={() => onOpenImageViewer(entry.jointCallSignature!)} className="p-1 transition-transform duration-200 ease-in-out bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-ring hover:scale-110">
                                <Image src={entry.jointCallSignature} alt="joint call signature" width={40} height={20} className="bg-white" />
                            </button>
                        )}
                    </div>
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
                                <DropdownMenuItem onClick={() => onEdit(entry)} disabled={!isEditable}>
                                    <Edit className="mr-2"/> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDownloadAttachments(entry)}>
                                    <FileArchive className="mr-2"/> Download Attachments
                                </DropdownMenuItem>
                                {!readOnly && <AlertDialogTrigger asChild>
                                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                                        <Trash2 className="mr-2"/> Delete
                                    </DropdownMenuItem>
                                </AlertDialogTrigger>}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the submitted coverage entry.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => onDelete(entry.id)}>Continue</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                     <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)}>
                            {isOpen ? <ChevronUp /> : <ChevronDown />}
                        </Button>
                    </CollapsibleTrigger>
                </TableCell>
            </TableRow>
            <CollapsibleContent asChild>
                <TableRow>
                    <TableCell colSpan={isAdminView ? 8 : 7} className="p-0">
                        <div className="p-6 bg-muted/50">
                             <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                                <div className="space-y-4">
                                    <h4 className="font-bold font-headline text-primary">Pre-call Plan</h4>
                                    <DetailItem label="Target Frequency" value={frequency} />
                                    <DetailItem label="Call Type" value={entry.callType} />
                                    <DetailItem label="Coverage Type" value={entry.coverageType} />
                                    {entry.coverageType === 'joint' && <DetailItem label="Joint Call With" value={entry.jointCallWith} />}
                                    <DetailItem label="HACME" value={entry.hacme} />
                                    <DetailItem label="Call Objective" value={entry.callObjective} />
                                </div>
                                <div className="space-y-4">
                                    <h4 className="font-bold font-headline text-primary">Samples & Products</h4>
                                    <DetailItem label="Primary Product" value={entry.primaryProduct} />
                                    <DetailItem label="Primary Sample" value={entry.primarySampleName} />
                                    <DetailItem label="Primary Quantity" value={entry.primaryProductQty} />
                                    <DetailItem label="Secondary Product" value={entry.secondaryProduct} />
                                    <DetailItem label="Secondary Sample" value={entry.secondarySampleName} />
                                    <DetailItem label="Secondary Quantity" value={entry.secondaryProductQty} />
                                </div>
                                <div className="space-y-4">
                                     <h4 className="font-bold font-headline text-primary">Post-call Analysis</h4>
                                    <DetailItem label="Topics Discussed" value={entry.topicsDiscussed} />
                                    <DetailItem label="Doctor's Issue / Concern" value={entry.doctorsIssue} />
                                    <DetailItem label="Plan of Action" value={entry.planOfAction} />
                                    <DetailItem label="What Went Well?" value={entry.whatWentWell} />
                                    <DetailItem label="Areas for Improvement" value={entry.areasForImprovement} />
                                </div>
                                {entry.reminderProducts && entry.reminderProducts.length > 0 && (
                                    <div className="space-y-4 md:col-span-3">
                                        <h4 className="font-bold font-headline text-primary">Reminder Products</h4>
                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                            {entry.reminderProducts.map((prod, index) => (
                                                <div key={index} className="p-3 border rounded-md bg-background">
                                                    <p className="font-semibold">{prod.productName || 'N/A'}</p>
                                                    <DetailItem label="Sample" value={prod.sampleName} />
                                                    <DetailItem label="Quantity" value={prod.quantity} />
                                                    <DetailItem label="Balance" value={prod.balance} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </TableCell>
                </TableRow>
            </CollapsibleContent>
            </TableBody>
        </Collapsible>
    )
}


export function SubmittedList({ entries, doctors, onDelete, onDeleteBulk, onEdit, readOnly = false, isAdminView = false, userMap }: SubmittedListProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const [isAnalysisDialogOpen, setIsAnalysisDialogOpen] = useState(false);
    const [currentAnalysis, setCurrentAnalysis] = useState<ReportAnalysisOutput | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzedDoctor, setAnalyzedDoctor] = useState<string>('');
    const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
    const [appliedRange, setAppliedRange] = useState<{ start?: Date; end?: Date }>({});
    const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
    const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    
    const availableMonths = useMemo(() => {
        const monthSet = new Set<string>();
        entries.forEach(entry => {
            const submittedDate = typeof entry.submittedAt === 'string' ? parseISO(entry.submittedAt) : entry.submittedAt;
            if (isValid(submittedDate)) {
                monthSet.add(format(submittedDate, 'yyyy-MM'));
            }
        });
        monthSet.add(format(new Date(), 'yyyy-MM'));
        return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
    }, [entries]);
    
    useEffect(() => {
        if (selectedMonth) {
            const monthDate = parse(selectedMonth, 'yyyy-MM', new Date());
            const start = startOfMonth(monthDate);
            const end = endOfMonth(monthDate);
            setAppliedRange({ start, end });
        } else {
            setAppliedRange({});
        }
        setSelectedEntryIds([]);
    }, [selectedMonth]);


    const handleAnalyze = async (entry: CoverageEntry) => {
        setAnalyzedDoctor(`${entry.firstName} ${entry.lastName}`);
        setIsAnalysisDialogOpen(true);
        setIsAnalyzing(true);
        setCurrentAnalysis(null);

        try {
            const input: ReportAnalysisInput = {
                doctorFirstName: entry.firstName || '',
                doctorLastName: entry.lastName || '',
                callObjective: entry.callObjective,
                topicsDiscussed: entry.topicsDiscussed,
                doctorsIssue: entry.doctorsIssue,
                planOfAction: entry.planOfAction,
                whatWentWell: entry.whatWentWell,
                areasForImprovement: entry.areasForImprovement,
            };
            const result = await analyzeReport(input);
            setCurrentAnalysis(result);
        } catch (error) {
            console.error("AI Analysis failed", error);
            setCurrentAnalysis({
                summary: "An error occurred during analysis.",
                positiveFeedback: "Could not retrieve feedback.",
                improvementSuggestions: "Please try again later."
            });
        } finally {
            setIsAnalyzing(false);
        }
    };
    
    const filteredEntries = useMemo(() => {
        let sortedEntries = [...entries].sort((a, b) => {
            const dateA = typeof a.submittedAt === 'string' ? parseISO(a.submittedAt) : a.submittedAt;
            const dateB = typeof b.submittedAt === 'string' ? parseISO(b.submittedAt) : b.submittedAt;
            if (!isValid(dateA)) return 1;
            if (!isValid(dateB)) return -1;
            return dateB.getTime() - dateA.getTime();
        });

        if (!appliedRange.start || !appliedRange.end) {
            return sortedEntries;
        }

        const start = startOfDay(appliedRange.start);
        const end = endOfDay(appliedRange.end);
        return sortedEntries.filter(e => {
            const submittedDate = typeof e.submittedAt === 'string' ? parseISO(e.submittedAt) : e.submittedAt;
            return isValid(submittedDate) && isWithinInterval(submittedDate, { start, end });
        });
    }, [entries, appliedRange]);
    
    useEffect(() => {
        setSelectedEntryIds([]);
    }, [entries]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedEntryIds(filteredEntries.map(e => e.id));
        } else {
            setSelectedEntryIds([]);
        }
    };

    const handleSelectEntry = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedEntryIds(prev => [...prev, id]);
        } else {
            setSelectedEntryIds(prev => prev.filter(entryId => entryId !== id));
        }
    };

    const handleBulkDownloadAttachments = async () => {
        const zip = new JSZip();
        const selectedEntries = entries.filter(e => selectedEntryIds.includes(e.id));
        
        const entriesGroupedByDate: Record<string, CoverageEntry[]> = {};
        selectedEntries.forEach(entry => {
            const dateString = format(parseISO(entry.submittedAt), 'yyyy-MM-dd');
            if (!entriesGroupedByDate[dateString]) {
                entriesGroupedByDate[dateString] = [];
            }
            entriesGroupedByDate[dateString].push(entry);
        });

        for (const dateString in entriesGroupedByDate) {
            const dateFolder = zip.folder(dateString);
            if (!dateFolder) continue;

            entriesGroupedByDate[dateString].forEach(entry => {
                const folderName = `${entry.firstName}_${entry.lastName}_${format(parseISO(entry.submittedAt), 'HHmmss')}`;
                const entryFolder = dateFolder.folder(folderName);

                if (!entryFolder) return;
    
                if (entry.photos && entry.photos.length > 0) {
                    const photoData = entry.photos[0].split(',')[1];
                    entryFolder.file("photo.png", photoData, { base64: true });
                }
                
                if (entry.signature) {
                    const signatureData = entry.signature.split(',')[1];
                    entryFolder.file("signature.png", signatureData, { base64: true });
                }
                
                if (entry.dsmSignature) {
                    const dsmSignatureData = entry.dsmSignature.split(',')[1];
                    entryFolder.file("dsm_signature.png", dsmSignatureData, { base64: true });
                }
                if (entry.jointCallSignature) {
                    const jointCallSignatureData = entry.jointCallSignature.split(',')[1];
                    entryFolder.file(`${entry.jointCallWith}_signature.png`, jointCallSignatureData, { base64: true });
                }
            });
        }


        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, `bulk_attachments_${format(new Date(), 'yyyy-MM-dd')}.zip`);
    };

    const handleDeleteSelected = () => {
        if (onDeleteBulk) {
            onDeleteBulk(selectedEntryIds);
            setSelectedEntryIds([]);
        }
    };


    const entriesByDate = useMemo(() => {
        return entries.reduce((acc, entry) => {
            const submittedDate = typeof entry.submittedAt === 'string' ? parseISO(entry.submittedAt) : entry.submittedAt;
            if (!isValid(submittedDate)) {
                return acc;
            }
            const date = format(submittedDate, 'yyyy-MM-dd');
            if(!acc[date]){
                acc[date] = [];
            }
            acc[date].push(entry);
            return acc;
        }, {} as Record<string, CoverageEntry[]>);
    }, [entries]);
    
    const selectedDayEntries = useMemo(() => {
        if (!selectedDate) return [];
        const dateString = format(selectedDate, 'yyyy-MM-dd');
        return entriesByDate[dateString] || [];
    }, [selectedDate, entriesByDate]);

    const submittedDays = useMemo(() => {
        return Object.keys(entriesByDate).map(dateStr => parseISO(dateStr));
    }, [entriesByDate]);
    
    const handleDownloadExcel = () => {
        const getUserName = (userId: string) => {
            if (!userMap) return userId;
            const user = userMap[userId] || USER_DATA_MAP[userId];
            return user ? `${user.firstName} ${user.lastName}` : `User ID: ${userId.substring(0,6)}...`;
        }

        const dataToExport = filteredEntries.map(entry => {
            const submittedAt = typeof entry.submittedAt === 'string' ? parseISO(entry.submittedAt) : entry.submittedAt;
            const coverageDate = typeof entry.coverageDate === 'string' ? parseISO(entry.coverageDate) : entry.coverageDate;
            const doctor = doctors.find(d => 
                d.firstName.toLowerCase() === entry.firstName?.toLowerCase() && 
                d.lastName.toLowerCase() === entry.lastName?.toLowerCase()
            );
            const frequency = doctor ? doctor.frequency : 'N/A';
            
            const row: any = {};
            if (isAdminView) {
                row["User Name"] = getUserName(entry.userId);
            }

            return {
                ...row,
                "Doctor Name": `${entry.firstName} ${entry.lastName}`,
                "Specialty": entry.specialty,
                "Clinic": entry.clinic,
                "Target Frequency": frequency,
                "Coverage Date": isValid(coverageDate) ? format(coverageDate, "PPP") : "Invalid Date",
                "Submitted At": isValid(submittedAt) ? format(submittedAt, "Pp") : "Invalid Date",
                "Coverage Type": entry.coverageType,
                "Call Type": entry.callType,
                "Joint Call With": entry.jointCallWith || "N/A",
                "Call Objective": entry.callObjective,
                "Primary Product": entry.primaryProduct,
                "Primary Sample Name": entry.primarySampleName,
                "Primary Sample Qty": entry.primaryProductQty,
                "Secondary Product": entry.secondaryProduct,
                "Secondary Sample Name": entry.secondarySampleName,
                "Secondary Sample Qty": entry.secondaryProductQty,
                "Topics Discussed": entry.topicsDiscussed,
                "Doctor's Issue": entry.doctorsIssue,
                "Plan of Action": entry.planOfAction,
                "What Went Well": entry.whatWentWell,
                "Areas for Improvement": entry.areasForImprovement,
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Submitted Coverage");
        XLSX.writeFile(workbook, `submitted_coverage_report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

    const handleDownloadPdf = () => {
        if (!listRef.current) return;

        html2canvas(listRef.current, { scale: 2 }).then((canvas) => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const ratio = canvasWidth / canvasHeight;
            let imgHeight = pdfWidth / ratio;
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
            heightLeft -= pdfHeight;

            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
                heightLeft -= pdfHeight;
            }
            
            pdf.save(`submitted_coverage_report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        });
    };

    const handleSendEmail = () => {
        const dateRangeString = selectedMonth
            ? `for ${format(parse(selectedMonth, 'yyyy-MM', new Date()), 'MMMM yyyy')}`
            : "for All Time";

        const subject = `Submitted Coverage Report - ${dateRangeString}`;
        
        let body = `Hi Team,\n\nPlease find the submitted coverage report for the selected period.\n\nTotal entries: ${filteredEntries.length}\n\n`;
        
        filteredEntries.forEach((entry, index) => {
            const submittedAt = typeof entry.submittedAt === 'string' ? parseISO(entry.submittedAt) : entry.submittedAt;
            body += `--- Entry ${index + 1} ---\n`;
            body += `Doctor: ${entry.firstName} ${entry.lastName}\n`;
            body += `Clinic: ${entry.clinic}\n`;
            body += `Submitted At: ${isValid(submittedAt) ? format(submittedAt, "Pp") : "Invalid Date"}\n\n`;
        });
        
        const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoLink;
    };
    
    const handleOpenImageViewer = (imageUrl: string) => {
        setSelectedImage(imageUrl);
        setIsImageViewerOpen(true);
    };

    if (entries.length === 0) {
        return (
            <Card>
                <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground">No submitted coverage entries yet. Synced entries will appear here.</p>
                </CardContent>
            </Card>
        );
    }

    return (
      <>
        <Card>
            <CardHeader>
                <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <CardTitle className="font-headline">Submitted Coverage</CardTitle>
                        <CardDescription>
                            {selectedMonth
                                ? `Showing reports for ${format(parse(selectedMonth, 'yyyy-MM', new Date()), 'MMMM yyyy')}.`
                                : "A log of all your submitted coverage reports."
                            }
                        </CardDescription>
                    </div>
                     <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1 p-1 border rounded-lg bg-muted">
                            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')}><List/></Button>
                            <Button variant={viewMode === 'calendar' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('calendar')}><CalendarViewIcon/></Button>
                        </div>
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Select a month" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableMonths.map(month => (
                                    <SelectItem key={month} value={month}>
                                        {format(parse(month, 'yyyy-MM', new Date()), 'MMMM yyyy')}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {selectedEntryIds.length > 0 && onDeleteBulk && viewMode === 'list' && !readOnly && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive">
                                        <Trash2 className="mr-2" /> Delete ({selectedEntryIds.length})
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will permanently delete {selectedEntryIds.length} selected coverage report(s). This action cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDeleteSelected}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                        {selectedEntryIds.length > 0 && viewMode === 'list' && (
                             <Button onClick={handleBulkDownloadAttachments} variant="secondary">
                                <Package className="mr-2" />
                                Download Attachments ({selectedEntryIds.length})
                             </Button>
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline"><Download className="mr-2"/> Download</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem onClick={handleDownloadExcel}>Download as Excel</DropdownMenuItem>
                                <DropdownMenuItem onClick={handleDownloadPdf}>Download as PDF</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button onClick={handleSendEmail}><Send className="mr-2"/> Send via Email</Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent ref={listRef}>
                {viewMode === 'list' && (
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">
                                        <Checkbox 
                                            checked={selectedEntryIds.length === filteredEntries.length && filteredEntries.length > 0}
                                            onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                                            aria-label="Select all"
                                        />
                                    </TableHead>
                                    {isAdminView && <TableHead>User</TableHead>}
                                    <TableHead>Provider</TableHead>
                                    <TableHead>Clinic</TableHead>
                                    <TableHead>Submitted On</TableHead>
                                    <TableHead>Target</TableHead>
                                    <TableHead>Attachments</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            
                                {filteredEntries.length > 0 ? (
                                    filteredEntries.map((entry) => (
                                        <EntryRow key={entry.id} entry={entry} doctors={doctors} onDelete={onDelete} onEdit={onEdit} onAnalyze={handleAnalyze} readOnly={readOnly} isSelected={selectedEntryIds.includes(entry.id)} onSelect={handleSelectEntry} isAdminView={isAdminView} userMap={userMap} onOpenImageViewer={handleOpenImageViewer} />
                                    ))
                                ) : (
                                    <TableBody>
                                    <TableRow>
                                        <TableCell colSpan={isAdminView ? 8 : 7} className="h-24 text-center">
                                        No submitted entries found for the selected date range.
                                        </TableCell>
                                    </TableRow>
                                    </TableBody>
                                )}
                            
                        </Table>
                    </div>
                )}
                {viewMode === 'calendar' && (
                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                        <div className="space-y-4">
                            <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={setSelectedDate}
                                modifiers={{ submitted: submittedDays }}
                                modifiersStyles={{
                                    submitted: { 
                                        border: '2px solid hsl(var(--primary))',
                                        borderRadius: 'var(--radius)',
                                    },
                                }}
                                components={{
                                    DayContent: ({ date, activeModifiers }) => {
                                        const dateString = format(date, 'yyyy-MM-dd');
                                        const count = entriesByDate[dateString]?.length;
                                        return (
                                            <div className="relative flex items-center justify-center w-full h-full">
                                                {date.getDate()}
                                                {count && (
                                                    <Badge variant="primary" className="absolute w-5 h-5 p-0 -top-1 -right-1 justify-center">{count}</Badge>
                                                )}
                                            </div>
                                        );
                                    },
                                }}
                                className="w-full p-4 border rounded-md"
                            />
                        </div>
                        <div>
                             <h3 className="text-xl font-semibold font-headline">
                                Reports for: {selectedDate ? format(selectedDate, "PPP") : "No date selected"}
                            </h3>
                            <div className="mt-4 border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Provider</TableHead>
                                            <TableHead>Clinic</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selectedDayEntries.length > 0 ? (
                                            selectedDayEntries.map(entry => (
                                                <TableRow key={entry.id}>
                                                    <TableCell className="font-medium">{entry.firstName} {entry.lastName}</TableCell>
                                                    <TableCell>{entry.clinic}</TableCell>
                                                     <TableCell className="text-right">
                                                        <Button variant="ghost" size="icon" onClick={() => onEdit(entry)}>
                                                            <Edit className="w-4 h-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={3} className="h-24 text-center">
                                                    No reports for this day.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
        <Dialog open={isAnalysisDialogOpen} onOpenChange={setIsAnalysisDialogOpen}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="font-headline text-2xl flex items-center gap-2">
                        <Sparkles className="text-primary"/>
                        AI Analysis for Dr. {analyzedDoctor}
                    </DialogTitle>
                    <DialogDescription>
                        This analysis was generated by AI and may contain inaccuracies. Please verify important information.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-6">
                    {isAnalyzing ? (
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <span>Analyzing report...</span>
                        </div>
                    ) : currentAnalysis ? (
                        <div className="space-y-4 text-sm">
                            <div>
                                <h3 className="font-bold text-base font-headline text-primary">Summary</h3>
                                <p className="mt-1">{currentAnalysis.summary}</p>
                            </div>
                            <div>
                                <h3 className="font-bold text-base font-headline text-primary">Positive Feedback</h3>
                                <p className="mt-1">{currentAnalysis.positiveFeedback}</p>
                            </div>
                            <div>
                                <h3 className="font-bold text-base font-headline text-primary">Improvement Suggestions</h3>
                                <p className="mt-1">{currentAnalysis.improvementSuggestions}</p>
                            </div>
                        </div>
                    ) : (
                         <p>No analysis available.</p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
        <Dialog open={isImageViewerOpen} onOpenChange={setIsImageViewerOpen}>
            <DialogContent className="max-w-3xl h-[80vh] flex flex-col bg-white">
                <DialogHeader>
                    <DialogTitle>Attachment Viewer</DialogTitle>
                </DialogHeader>
                {selectedImage && (
                    <div className="relative flex-grow">
                        <Image src={selectedImage} alt="Enlarged attachment" layout="fill" objectFit="contain" />
                    </div>
                )}
            </DialogContent>
        </Dialog>
      </>
    );
}
