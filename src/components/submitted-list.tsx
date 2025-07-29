
"use client"

import type { CoverageEntry } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay, endOfWeek, isBefore, isSameDay } from "date-fns";
import Image from "next/image";
import { useState, useMemo } from "react";
import { DateRange } from "react-day-picker";
import { Calendar as CalendarIcon, Download, MoreHorizontal, Trash2, FileArchive, ChevronDown, ChevronUp, Edit, List, Calendar as CalendarViewIcon } from "lucide-react";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';


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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Badge } from "./ui/badge";

type SubmittedListProps = {
    entries: CoverageEntry[];
    onDelete: (id: string) => void;
    onEdit: (entry: CoverageEntry) => void;
};


const DetailItem = ({ label, value }: { label: string, value?: string | number | null }) => {
    if (!value && typeof value !== 'number') return null;
    return (
        <div>
            <p className="text-xs font-semibold text-muted-foreground">{label}</p>
            <p className="text-sm">{value}</p>
        </div>
    )
}

const EntryRow = ({ entry, onDelete, onEdit }: { entry: CoverageEntry, onDelete: (id: string) => void, onEdit: (entry: CoverageEntry) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    
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

        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, `attachments_${entry.firstName}_${entry.lastName}_${entry.id.substring(0, 8)}.zip`);
    };

    const isEditable = useMemo(() => {
        const submittedDate = parseISO(entry.submittedAt);
        // The deadline is Sunday midnight of the submission week.
        const deadline = endOfWeek(submittedDate, { weekStartsOn: 1 }); // week starts on Monday
        return isBefore(new Date(), deadline);
    }, [entry.submittedAt]);

    return (
         <Collapsible asChild>
            <TableBody>
            <TableRow>
                <TableCell className="font-medium">
                    <div className="flex flex-col">
                        <span>{entry.firstName} {entry.lastName}</span>
                        <span className="text-xs text-muted-foreground">{entry.specialty}</span>
                    </div>
                </TableCell>
                <TableCell>{entry.clinic}</TableCell>
                <TableCell>{format(parseISO(entry.submittedAt), "PPP")}</TableCell>
                <TableCell>
                    <div className="flex items-center gap-2">
                        {entry.photos && entry.photos.length > 0 && (
                            <div className="flex -space-x-4">
                                {entry.photos.map((photo, index) => (
                                    <Image key={index} src={photo} alt={`photo ${index}`} width={40} height={40} className="object-cover border-2 rounded-full border-background" />
                                ))}
                            </div>
                        )}
                        {entry.signature && (
                            <div className="p-1 bg-white border rounded-md">
                                <Image src={entry.signature} alt="signature" width={40} height={20} />
                            </div>
                        )}
                        {entry.dsmSignature && (
                            <div className="p-1 bg-white border rounded-md">
                                <Image src={entry.dsmSignature} alt="dsm signature" width={40} height={20} />
                            </div>
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
                                <AlertDialogTrigger asChild>
                                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                                        <Trash2 className="mr-2"/> Delete
                                    </DropdownMenuItem>
                                </AlertDialogTrigger>
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
                    <TableCell colSpan={5} className="p-0">
                        <div className="p-6 bg-muted/50">
                             <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                                <div className="space-y-4">
                                    <h4 className="font-bold font-headline text-primary">Pre-call Plan</h4>
                                    <DetailItem label="Call Type" value={entry.callType} />
                                    <DetailItem label="Coverage Type" value={entry.coverageType} />
                                    <DetailItem label="Call Objective" value={entry.callObjective} />
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
                            </div>
                        </div>
                    </TableCell>
                </TableRow>
            </CollapsibleContent>
            </TableBody>
        </Collapsible>
    )
}


export function SubmittedList({ entries, onDelete, onEdit }: SubmittedListProps) {
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    
    const entriesByDate = useMemo(() => {
        return entries.reduce((acc, entry) => {
            const date = format(parseISO(entry.submittedAt), 'yyyy-MM-dd');
            if (!acc[date]) {
                acc[date] = [];
            }
            acc[date].push(entry);
            return acc;
        }, {} as Record<string, CoverageEntry[]>);
    }, [entries]);

    const submittedDays = useMemo(() => {
        return Object.keys(entriesByDate).map(dateStr => parseISO(dateStr));
    }, [entriesByDate]);

    const filteredEntries = useMemo(() => {
        if (!dateRange || !dateRange.from) {
            // Default to showing all entries if no date is selected
            return [...entries].sort((a,b) => parseISO(b.submittedAt).getTime() - parseISO(a.submittedAt).getTime());
        }

        const from = startOfDay(dateRange.from);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);

        return entries
            .filter(entry => isWithinInterval(parseISO(entry.submittedAt), { start: from, end: to }))
            .sort((a, b) => parseISO(b.submittedAt).getTime() - parseISO(a.submittedAt).getTime());

    }, [entries, dateRange]);

    const selectedDayEntries = useMemo(() => {
        if (!selectedDate) return [];
        return entries.filter(entry => isSameDay(parseISO(entry.submittedAt), selectedDate));
    }, [entries, selectedDate]);
    

    const handleDownloadSubmitted = () => {
        if (viewMode === 'list' && (!dateRange || !dateRange.from)) return;
        if (viewMode === 'calendar' && !selectedDate) return;
        
        const entriesToExport = viewMode === 'list' ? filteredEntries : selectedDayEntries;
        
        const dataToExport = entriesToExport.map(entry => {
            const proofs = [];
            if (entry.photos && entry.photos.length > 0) proofs.push("Photo");
            if (entry.signature) proofs.push("Signature");
            if (entry.dsmSignature) proofs.push("DSM Signature");
            
            return {
                'First Name': entry.firstName,
                'Last Name': entry.lastName,
                'Specialty': entry.specialty,
                'Clinic': entry.clinic,
                'Call Type': entry.callType,
                'Coverage Type': entry.coverageType,
                'Coverage Date': format(parseISO(entry.coverageDate), 'yyyy-MM-dd'),
                'Submitted At': format(parseISO(entry.submittedAt), 'yyyy-MM-dd HH:mm:ss'),
                'Proof of Coverage': proofs.length > 0 ? proofs.join(', ') : 'None',
                'Call Objective': entry.callObjective,
                'Primary Product': entry.primaryProduct,
                'Primary Sample': entry.primarySampleName,
                'Primary Quantity': entry.primaryProductQty,
                'Secondary Product': entry.secondaryProduct,
                'Secondary Sample': entry.secondarySampleName,
                'Secondary Quantity': entry.secondaryProductQty,
                'Topics Discussed': entry.topicsDiscussed,
                'Doctors Issue': entry.doctorsIssue,
                'Plan of Action': entry.planOfAction,
                'What Went Well': entry.whatWentWell,
                'Areas for Improvement': entry.areasForImprovement,
            }
        });
    
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Submitted Coverage');

        worksheet['!cols'] = Object.keys(dataToExport[0] || {}).map(key => ({
             wch: key.length > 20 ? key.length : 20 
        }));
    
        const dateIdentifier = viewMode === 'list' 
            ? `${format(dateRange!.from!, 'yyyy-MM-dd')}_to_${format(dateRange!.to || dateRange!.from!, 'yyyy-MM-dd')}`
            : format(selectedDate!, 'yyyy-MM-dd');

        const fileName = `submitted_coverage_${dateIdentifier}.xlsx`;
        XLSX.writeFile(workbook, fileName);
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
        <Card>
            <CardHeader>
                <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <CardTitle className="font-headline">Submitted Coverage</CardTitle>
                        <CardDescription>
                            {viewMode === 'list'
                                ? 'Filter by date range and download reports.'
                                : 'View submissions by date on the calendar.'
                            }
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant={viewMode === 'list' ? 'secondary' : 'outline'} onClick={() => setViewMode('list')}>
                            <List className="mr-2"/> List View
                        </Button>
                        <Button variant={viewMode === 'calendar' ? 'secondary' : 'outline'} onClick={() => setViewMode('calendar')}>
                            <CalendarViewIcon className="mr-2"/> Calendar View
                        </Button>
                    </div>
                </div>
                {viewMode === 'list' && (
                    <div className="flex items-center gap-2 pt-4">
                         <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    id="date"
                                    variant={"outline"}
                                    className={cn(
                                    "w-[300px] justify-start text-left font-normal",
                                    !dateRange && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>
                                        {format(dateRange.from, "LLL dd, y")} -{" "}
                                        {format(dateRange.to, "LLL dd, y")}
                                        </>
                                    ) : (
                                        format(dateRange.from, "LLL dd, y")
                                    )
                                    ) : (
                                    <span>Pick a date range</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
                        <Button onClick={handleDownloadSubmitted} disabled={!dateRange || !dateRange.from}>
                            <Download className="mr-2" />
                            Download Report
                        </Button>
                    </div>
                )}
                 {viewMode === 'calendar' && (
                     <div className="flex items-center gap-2 pt-4">
                        <Button onClick={handleDownloadSubmitted} disabled={!selectedDate || selectedDayEntries.length === 0}>
                            <Download className="mr-2" />
                            Download Report for {selectedDate ? format(selectedDate, 'PPP') : ''}
                        </Button>
                     </div>
                 )}
            </CardHeader>
            <CardContent>
                {viewMode === 'list' && (
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Provider</TableHead>
                                    <TableHead>Clinic</TableHead>
                                    <TableHead>Submitted On</TableHead>
                                    <TableHead>Attachments</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            
                                {filteredEntries.length > 0 ? (
                                    filteredEntries.map((entry) => (
                                        <EntryRow key={entry.id} entry={entry} onDelete={onDelete} onEdit={onEdit} />
                                    ))
                                ) : (
                                    <TableBody>
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
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
                        <div>
                             <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={setSelectedDate}
                                modifiers={{ 
                                    submitted: submittedDays
                                }}
                                modifiersStyles={{
                                    submitted: { 
                                        fontWeight: 'bold',
                                        color: 'hsl(var(--primary-foreground))',
                                        backgroundColor: 'hsl(var(--primary))',
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
                                                    <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 justify-center p-0">{count}</Badge>
                                                )}
                                            </div>
                                        );
                                    },
                                }}
                                className="w-full p-4 border rounded-md"
                            />
                        </div>
                        <div>
                            <h3 className="mb-4 text-xl font-semibold font-headline">
                                Submissions for: {selectedDate ? format(selectedDate, "PPP") : "No date selected"}
                            </h3>
                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Provider</TableHead>
                                            <TableHead>Clinic</TableHead>
                                            <TableHead>Attachments</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                        {selectedDayEntries.length > 0 ? (
                                            selectedDayEntries.map((entry) => (
                                                <EntryRow key={entry.id} entry={entry} onDelete={onDelete} onEdit={onEdit} />
                                            ))
                                        ) : (
                                            <TableBody>
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center">
                                                    No submissions for this date.
                                                </TableCell>
                                            </TableRow>
                                            </TableBody>
                                        )}
                                </Table>
                            </div>
                        </div>
                    </div>
                 )}
            </CardContent>
        </Card>
    );
}
