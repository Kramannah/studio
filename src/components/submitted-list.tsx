
"use client"

import type { CoverageEntry, Doctor, NonCallDay } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO, isValid, isToday, isSameDay } from "date-fns";
import Image from "next/image";
import React, { useState, useMemo } from "react";
import { Download, MoreHorizontal, Trash2, ChevronDown, ChevronUp, Edit, Search, Calendar as CalendarIcon, List, Maximize2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { cn, PH_HOLIDAYS_2026, getHolidayName } from "@/lib/utils";
import * as XLSX from 'xlsx';

const DetailField = ({ label, value }: { label: string, value?: string | number | null }) => (
    <div className="space-y-1">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
    </div>
)

const EntryRow = ({ 
    entry, 
    doctors, 
    onDelete, 
    onEdit, 
    readOnly,
    onPreview
}: { 
    entry: CoverageEntry, 
    doctors: Doctor[], 
    onDelete: (id: string) => void, 
    onEdit: (entry: CoverageEntry) => void, 
    readOnly?: boolean,
    onPreview: (src: string, title: string) => void
}) => {
    const [isOpen, setIsOpen] = useState(false);
    
    const doctor = useMemo(() => {
        const eFirst = (entry.firstName || "").toLowerCase().trim();
        const eLast = (entry.lastName || "").toLowerCase().trim();
        return (doctors || []).find(d => 
            (d.firstName || "").toLowerCase().trim() === eFirst && 
            (d.lastName || "").toLowerCase().trim() === eLast
        );
    }, [doctors, entry.firstName, entry.lastName]);

    const isEditable = useMemo(() => {
        if (readOnly) return false;
        try {
            const date = parseISO(entry.submittedAt);
            return isToday(date);
        } catch (e) { return false; }
    }, [entry.submittedAt, readOnly]);

    return (
        <React.Fragment>
            <TableRow className="h-16 hover:bg-muted/30 border-b">
                <TableCell className="font-medium">
                    <div className="flex flex-col">
                        <span className="font-bold">{entry.firstName} {entry.lastName}</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-tighter">{entry.specialty}</span>
                    </div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs opacity-70">{entry.clinic}</TableCell>
                <TableCell className="whitespace-nowrap">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold">{entry.coverageDate ? format(parseISO(entry.coverageDate), "MMM do") : 'N/A'}</span>
                        <span className="text-[10px] text-muted-foreground">{entry.submittedAt ? format(parseISO(entry.submittedAt), "h:mm a") : ''}</span>
                    </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-center">
                    {doctor?.frequency && <Badge variant="outline" className="font-mono text-[10px]">{doctor.frequency}</Badge>}
                </TableCell>
                <TableCell>
                    <div className="flex items-center gap-1">
                        {entry.photos?.[0] && (
                            <div 
                                className="h-8 w-10 bg-muted rounded overflow-hidden relative border cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                                onClick={() => onPreview(entry.photos![0], `Photo: ${entry.firstName} ${entry.lastName}`)}
                            >
                                <Image src={entry.photos[0]} alt="proof" fill className="object-cover" />
                            </div>
                        )}
                        {entry.signature && (
                            <div 
                                className="h-8 w-14 bg-white rounded border flex items-center justify-center p-0.5 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                                onClick={() => onPreview(entry.signature!, `Signature: ${entry.firstName} ${entry.lastName}`)}
                            >
                                <Image src={entry.signature} alt="sig" width={40} height={20} className="object-contain" />
                            </div>
                        )}
                    </div>
                </TableCell>
                <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                        <AlertDialog>
                            <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal size={16}/></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => onEdit(entry)} disabled={!isEditable} className="gap-2"><Edit size={14}/> Edit</DropdownMenuItem>
                                    {!readOnly && (
                                        <DropdownMenuItem className="text-destructive focus:text-destructive gap-2">
                                            <AlertDialogTrigger className="flex items-center gap-2 w-full"><Trash2 size={14}/> Delete</AlertDialogTrigger>
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Delete this report?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => onDelete(entry.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)}>{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</Button>
                    </div>
                </TableCell>
            </TableRow>
            {isOpen && (
                <TableRow className="bg-muted/10 border-b hover:bg-muted/10">
                    <TableCell colSpan={6} className="p-0">
                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-xs animate-in slide-in-from-top-2 duration-200">
                            <div className="space-y-4">
                                <h4 className="font-bold text-primary uppercase tracking-widest text-[10px]">Pre-call Plan</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <DetailField label="Target" value={doctor?.frequency} />
                                    <DetailField label="Call Type" value={entry.callType} />
                                    <DetailField label="Coverage" value={entry.coverageType} />
                                </div>
                                <DetailField label="Objective" value={entry.callObjective} />
                            </div>
                            <div className="space-y-4">
                                <h4 className="font-bold text-primary uppercase tracking-widest text-[10px]">Samples & Products</h4>
                                <DetailField label="Primary Product" value={entry.primaryProduct} />
                                <DetailField label="Sample Name" value={entry.primarySampleName} />
                                <DetailField label="Quantity" value={entry.primaryProductQty} />
                                {entry.reminderProducts && entry.reminderProducts.length > 0 && (
                                    <div className="pt-2 border-t">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Reminders</p>
                                        <div className="flex flex-wrap gap-1">{entry.reminderProducts.map((p, i) => (<Badge key={i} variant="secondary" className="text-[9px] h-5">{p.sampleName} (x{p.quantity})</Badge>))}</div>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-4">
                                <h4 className="font-bold text-primary uppercase tracking-widest text-[10px]">Post-call Analysis</h4>
                                <DetailField label="Discussed" value={entry.topicsDiscussed} />
                                <DetailField label="Dr's Issue" value={entry.doctorsIssue} />
                                <DetailField label="Action Plan" value={entry.planOfAction} />
                            </div>
                        </div>
                    </TableCell>
                </TableRow>
            )}
        </React.Fragment>
    )
}

export function SubmittedList({ entries = [], doctors = [], onDelete, onEdit, readOnly = false }: { entries: CoverageEntry[], doctors: Doctor[], nonCallDays?: NonCallDay[], onDelete: (id: string) => void, onEdit: (entry: CoverageEntry) => void, readOnly?: boolean }) {
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [previewData, setPreviewData] = useState<{ src: string, title: string } | null>(null);

    const holidayDates = useMemo(() => {
        return Object.keys(PH_HOLIDAYS_2026).map(d => parseISO(d));
    }, []);

    const selectedHoliday = useMemo(() => selectedDate ? getHolidayName(selectedDate) : null, [selectedDate]);

    const filtered = useMemo(() => (entries || []).filter(e => {
        const q = (searchQuery || "").toLowerCase().trim();
        const matchesSearch = !q || `${e.firstName} ${e.lastName} ${e.clinic} ${e.specialty}`.toLowerCase().includes(q);
        
        if (viewMode === 'calendar' && selectedDate) {
            const entryDate = e.coverageDate ? parseISO(e.coverageDate) : parseISO(e.submittedAt);
            return matchesSearch && isValid(entryDate) && isSameDay(entryDate, selectedDate);
        }
        
        return matchesSearch;
    }), [entries, searchQuery, viewMode, selectedDate]);

    const entryDates = useMemo(() => {
        return (entries || []).map(e => {
            const d = e.coverageDate ? parseISO(e.coverageDate) : parseISO(e.submittedAt);
            return isValid(d) ? d : null;
        }).filter(Boolean) as Date[];
    }, [entries]);

    const entriesCountByDate = useMemo(() => {
        const counts: Record<string, number> = {};
        (entries || []).forEach(e => {
            const d = e.coverageDate ? parseISO(e.coverageDate) : parseISO(e.submittedAt);
            if (isValid(d)) {
                const dateStr = format(d, 'yyyy-MM-dd');
                counts[dateStr] = (counts[dateStr] || 0) + 1;
            }
        });
        return counts;
    }, [entries]);

    const handleExportExcel = () => {
        const data = filtered.map(e => ({
            "Provider": `${e.firstName} ${e.lastName}`,
            "Specialty": e.specialty,
            "Clinic": e.clinic,
            "Date": e.coverageDate ? format(parseISO(e.coverageDate), "yyyy-MM-dd") : "N/A",
            "Submitted": e.submittedAt ? format(parseISO(e.submittedAt), "Pp") : "N/A",
            "Type": e.coverageType,
            "Objective": e.callObjective
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reports");
        XLSX.writeFile(wb, `Submitted_Coverage.xlsx`);
    }

    const openPreview = (src: string, title: string) => {
        setPreviewData({ src, title });
    };

    if (entries.length === 0) return <Card className="p-20 text-center"><p className="text-muted-foreground italic">No reports found.</p></Card>;

    return (
      <div className="space-y-4 animate-in fade-in duration-500 w-full">
        <Card className="p-4 border-2 shadow-sm">
            <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                <div className="flex items-center gap-4 w-full max-w-xl">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search records..." 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)} 
                            className="pl-10 h-10 border-2" 
                        />
                    </div>
                    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="shrink-0">
                        <TabsList className="grid grid-cols-2 w-[160px] h-10">
                            <TabsTrigger value="list" className="gap-2"><List size={14}/> List</TabsTrigger>
                            <TabsTrigger value="calendar" className="gap-2"><CalendarIcon size={14}/> Cal</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
                <Button variant="outline" size="sm" onClick={handleExportExcel} className="font-headline h-10 gap-2 border-2 w-full lg:w-auto"><Download size={16} /> Export Excel</Button>
            </div>
        </Card>

        <div className={cn("grid grid-cols-1 gap-6", viewMode === 'calendar' ? "lg:grid-cols-12" : "")}>
            {viewMode === 'calendar' && (
                <div className="lg:col-span-4 space-y-4">
                    <Card className="border-2 shadow-sm overflow-hidden sticky top-24">
                        <CardHeader className="bg-muted/30 border-b p-4">
                            <CardTitle className="text-sm font-black font-headline text-primary uppercase tracking-widest">Submission History</CardTitle>
                        </CardHeader>
                        <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={setSelectedDate}
                            className="p-4"
                            modifiers={{ 
                                submitted: entryDates,
                                holiday: holidayDates,
                            }}
                            modifiersStyles={{
                                submitted: { border: '2px solid hsl(var(--primary))', fontWeight: 'bold' },
                                holiday: { backgroundColor: 'hsl(var(--accent) / 0.3)', color: 'hsl(var(--accent-foreground))', textDecoration: 'underline' }
                            }}
                            components={{
                                DayContent: ({ date }) => {
                                    const dateStr = format(date, 'yyyy-MM-dd');
                                    const count = entriesCountByDate[dateStr];
                                    return (
                                        <div className="relative flex items-center justify-center w-full h-full">
                                            {date.getDate()}
                                            {count > 0 && (
                                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] text-primary-foreground font-black shadow-sm">
                                                    {count}
                                                </span>
                                            )}
                                        </div>
                                    );
                                },
                            }}
                        />
                    </Card>
                    {selectedHoliday && (
                        <Card className="border-2 border-orange-500/20 bg-orange-500/5 p-4 animate-in slide-in-from-left-2 duration-300">
                            <div className="flex items-start gap-3">
                                <Info className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-500/70">Holiday Information</p>
                                    <p className="font-bold text-sm text-orange-500">{selectedHoliday}</p>
                                </div>
                            </div>
                        </Card>
                    )}
                </div>
            )}

            <div className={cn(viewMode === 'calendar' ? "lg:col-span-8" : "w-full")}>
                <Card className="border-2 overflow-hidden shadow-lg">
                    <Table>
                        <TableHeader className="bg-muted/50 h-14">
                            <TableRow>
                                <TableHead className="font-bold">Provider</TableHead>
                                <TableHead className="hidden md:table-cell font-bold">Clinic</TableHead>
                                <TableHead className="font-bold">Date</TableHead>
                                <TableHead className="hidden sm:table-cell font-bold text-center">Freq</TableHead>
                                <TableHead className="font-bold">Proof</TableHead>
                                <TableHead className="text-right font-bold">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.length > 0 ? (
                                filtered.map(e => (
                                    <EntryRow 
                                        key={e.id} 
                                        entry={e} 
                                        doctors={doctors} 
                                        onDelete={onDelete} 
                                        onEdit={onEdit} 
                                        readOnly={readOnly} 
                                        onPreview={openPreview}
                                    />
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-48 text-center">
                                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                            <Search size={32} className="opacity-20" />
                                            <p className="italic">No matching reports found for {viewMode === 'calendar' && selectedDate ? format(selectedDate, "MMM d") : "this period"}.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Card>
            </div>
        </div>

        {/* Full-screen Proof Preview Dialog */}
        <Dialog open={!!previewData} onOpenChange={(open) => !open && setPreviewData(null)}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden border-none bg-black/90 z-[1000]">
                <DialogHeader className="sr-only">
                    <DialogTitle>{previewData?.title || "Proof Preview"}</DialogTitle>
                    <DialogDescription>Full-screen inspection of the captured proof of coverage.</DialogDescription>
                </DialogHeader>
                <div className="relative w-full h-[85vh] flex items-center justify-center p-4">
                    {previewData?.src && (
                        <Image 
                            src={previewData.src} 
                            alt="Full Proof" 
                            width={1600} 
                            height={1200} 
                            className={cn(
                                "max-w-full max-h-full object-contain rounded-md shadow-2xl",
                                previewData.title.includes("Signature") ? "bg-white p-12" : ""
                            )} 
                        />
                    )}
                </div>
                <div className="absolute top-4 left-4 flex items-center gap-2">
                    <Badge className="bg-primary text-primary-foreground font-headline text-sm px-4 py-1.5 shadow-lg border-2 border-primary/20">
                        {previewData?.title}
                    </Badge>
                </div>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-4 right-4 text-white hover:bg-white/10"
                    onClick={() => setPreviewData(null)}
                >
                    <Maximize2 size={24} />
                </Button>
            </DialogContent>
        </Dialog>
      </div>
    );
}
