

"use client"

import type { CoverageEntry } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay, endOfWeek, isBefore, isSameDay, isValid } from "date-fns";
import Image from "next/image";
import { useState, useMemo } from "react";
import { DateRange } from "react-day-picker";
import { Calendar as CalendarIcon, Download, MoreHorizontal, Trash2, FileArchive, ChevronDown, ChevronUp, Edit, List, Calendar as CalendarViewIcon, Send, Sparkles, Loader2 } from "lucide-react";
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

const EntryRow = ({ entry, onDelete, onEdit, onAnalyze }: { entry: CoverageEntry, onDelete: (id: string) => void, onEdit: (entry: CoverageEntry) => void, onAnalyze: (entry: CoverageEntry) => void }) => {
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
        if (entry.jointCallSignature) {
            const jointCallSignatureData = entry.jointCallSignature.split(',')[1];
            zip.file(`${entry.jointCallWith}_signature.png`, jointCallSignatureData, { base64: true });
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
                         {entry.jointCallSignature && (
                            <div className="p-1 bg-white border rounded-md">
                                <Image src={entry.jointCallSignature} alt="joint call signature" width={40} height={20} />
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
                                <DropdownMenuItem onClick={() => onAnalyze(entry)}>
                                    <Sparkles className="mr-2"/> Analyze with AI
                                </DropdownMenuItem>
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
                             <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                                <div className="space-y-4">
                                    <h4 className="font-bold font-headline text-primary">Pre-call Plan</h4>
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
    const [selectedRange, setSelectedRange] = useState<DateRange | undefined>();
    const [isAnalysisDialogOpen, setIsAnalysisDialogOpen] = useState(false);
    const [currentAnalysis, setCurrentAnalysis] = useState<ReportAnalysisOutput | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzedDoctor, setAnalyzedDoctor] = useState<string>('');

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
        const sortedEntries = [...entries].sort((a,b) => parseISO(b.submittedAt).getTime() - parseISO(a.submittedAt).getTime());

        if (!dateRange || !dateRange.from) {
            return sortedEntries;
        }

        const from = startOfDay(dateRange.from);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);

        return sortedEntries.filter(entry => isWithinInterval(parseISO(entry.submittedAt), { start: from, end: to }));

    }, [entries, dateRange]);

    const selectedDayEntries = useMemo(() => {
        if (!selectedDate) return [];
        return entries.filter(entry => isSameDay(parseISO(entry.submittedAt), selectedDate));
    }, [entries, selectedDate]);
    
    const handleDateInputChange = (field: 'from' | 'to', value: string) => {
        const date = new Date(value);
        if (isValid(date)) {
            setSelectedRange(prev => ({ ...prev, [field]: date }));
        }
    };
    
    const handleApplyFilter = () => {
        setDateRange(selectedRange);
    };

    const handleDownloadSubmitted = () => {
        if (viewMode === 'list' && (!dateRange || !dateRange.from)) return;
        if (viewMode === 'calendar' && !selectedDate) return;
        
        const entriesToExport = viewMode === 'list' ? filteredEntries : selectedDayEntries;
        
        const dataToExport = entriesToExport.map(entry => {
            const proofs = [];
            if (entry.photos && entry.photos.length > 0) proofs.push("Photo");
            if (entry.signature) proofs.push("Signature");
            if (entry.dsmSignature) proofs.push("DSM Signature");
            if (entry.jointCallSignature) proofs.push(`${entry.jointCallWith} Signature`);

            
            return {
                'First Name': entry.firstName,
                'Last Name': entry.lastName,
                'Specialty': entry.specialty,
                'Clinic': entry.clinic,
                'HACME': entry.hacme,
                'Call Type': entry.callType,
                'Coverage Type': entry.coverageType,
                'Joint Call With': entry.jointCallWith,
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
      
    const handleSendEmail = () => {
        const entriesToEmail = viewMode === 'list' ? filteredEntries : selectedDayEntries;
        if (entriesToEmail.length === 0) return;

        let dateRangeString;
        if(viewMode === 'list'){
            if (!dateRange || !dateRange.from) return;
            dateRangeString = `${format(dateRange.from, 'PPP')} to ${dateRange.to ? format(dateRange.to, 'PPP') : format(dateRange.from, 'PPP')}`;
        } else {
            if (!selectedDate) return;
            dateRangeString = format(selectedDate, 'PPP');
        }

        const subject = `Submitted Coverage Report: ${dateRangeString}`;
        
        let body = `Submitted Coverage Report\n`;
        body += `Period: ${dateRangeString}\n\n`;

        entriesToEmail.forEach(entry => {
            body += `--- \n`;
            body += `Doctor: ${entry.firstName} ${entry.lastName}\n`;
            body += `Clinic: ${entry.clinic}\n`;
            body += `Specialty: ${entry.specialty}\n`;
            body += `Submitted At: ${format(parseISO(entry.submittedAt), 'PPP p')}\n`;
            body += `Coverage Date: ${format(parseISO(entry.coverageDate), 'PPP')}\n`;
            body += `Call Type: ${entry.callType}\n`;
            body += `Coverage Type: ${entry.coverageType}\n`;
            if (entry.coverageType === 'joint') {
                body += `Joint Call With: ${entry.jointCallWith}\n`;
            }
            body += `---\n\n`;
        });
    
        const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoLink;
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
                    <div className="flex flex-col items-stretch gap-2 pt-4 sm:flex-row sm:items-end">
                        <div className="flex gap-2">
                            <div className="space-y-2">
                                <Label htmlFor="start-date-submitted">Start Date</Label>
                                <Input 
                                    id="start-date-submitted"
                                    type="date"
                                    value={selectedRange?.from ? format(selectedRange.from, 'yyyy-MM-dd') : ''}
                                    onChange={(e) => handleDateInputChange('from', e.target.value)}
                                    className="w-full"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="end-date-submitted">End Date</Label>
                                <Input
                                    id="end-date-submitted"
                                    type="date"
                                    value={selectedRange?.to ? format(selectedRange.to, 'yyyy-MM-dd') : ''}
                                    onChange={(e) => handleDateInputChange('to', e.target.value)}
                                    className="w-full"
                                />
                            </div>
                        </div>
                        <Button onClick={handleApplyFilter} disabled={!selectedRange?.from}>Apply</Button>
                        <Button onClick={handleDownloadSubmitted} variant="outline" disabled={!dateRange || !dateRange.from}>
                            <Download className="mr-2" />
                            Download
                        </Button>
                         <Button onClick={handleSendEmail} variant="outline" disabled={!dateRange || !dateRange.from}>
                            <Send className="mr-2"/>
                            Send via Email
                        </Button>
                    </div>
                )}
                 {viewMode === 'calendar' && (
                     <div className="flex items-center gap-2 pt-4">
                        <Button onClick={handleDownloadSubmitted} disabled={!selectedDate || selectedDayEntries.length === 0}>
                            <Download className="mr-2" />
                            Download for {selectedDate ? format(selectedDate, 'PPP') : ''}
                        </Button>
                        <Button onClick={handleSendEmail} variant="outline" disabled={!selectedDate || selectedDayEntries.length === 0}>
                            <Send className="mr-2"/>
                            Send for {selectedDate ? format(selectedDate, 'PPP') : ''}
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
                                        <EntryRow key={entry.id} entry={entry} onDelete={onDelete} onEdit={onEdit} onAnalyze={handleAnalyze}/>
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
                                                <EntryRow key={entry.id} entry={entry} onDelete={onDelete} onEdit={onEdit} onAnalyze={handleAnalyze}/>
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
      </>
    );
}

    

    
