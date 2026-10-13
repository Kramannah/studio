
"use client"

import type { CoverageEntry, Doctor, NonCallDay } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO, isValid, isToday, isSameDay } from "date-fns";
import Image from "next/image";
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Download, MoreHorizontal, Trash2, ChevronDown, ChevronUp, Edit, Search, Calendar as CalendarIcon, List, Maximize2, Info, ChevronLeft, ChevronRight, Loader2, Camera, UserCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { cn, PH_HOLIDAYS, getHolidayName, parseAnyDate } from "@/lib/utils";
import * as XLSX from 'xlsx';
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

const DetailField = ({ label, value }: { label: string, value?: string | number | null }) => (
    <div className="space-y-1">
        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{label}</p>
        <p className="text-sm font-bold">{value || "—"}</p>
    </div>
)

const ZoomableImage = ({ src, alt, isSignature = false }: { src: string; alt: string; isSignature?: boolean }) => {
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      setOrigin({ x, y });

      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      setScale((s) => Math.min(Math.max(s + delta, 1), 8));
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden w-full aspect-[4/3] rounded-2xl bg-black/10 border-2 border-white/5 cursor-crosshair group"
    >
      <div
        className="w-full h-full transition-transform duration-150 ease-out"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: `${origin.x}% ${origin.y}%`,
        }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          className={cn(
            "object-contain",
            isSignature ? "bg-white p-12" : ""
          )}
        />
      </div>
      <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Badge variant="secondary" className="bg-black/60 backdrop-blur-md text-white border-none font-mono">
            {Math.round(scale * 100)}%
        </Badge>
        <Button 
            size="icon" 
            variant="secondary" 
            className="h-8 w-8 rounded-full bg-black/60 hover:bg-primary border-none text-white"
            onClick={(e) => { e.stopPropagation(); setScale(1); setOrigin({ x: 50, y: 50 }); }}
        >
            <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

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
    onPreview: (proofs: { photo?: string, signature?: string }, title: string) => void
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isFetchingProof, setIsFetchingProof] = useState(false);
    
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

    const handleViewProofs = useCallback(async () => {
        const title = `Proofs: ${entry.firstName} ${entry.lastName}`;
        
        if (entry.photos?.[0] || entry.signature) {
            return onPreview({ photo: entry.photos?.[0], signature: entry.signature || undefined }, title);
        }
        
        if (!db || isFetchingProof) return;
        
        setIsFetchingProof(true);
        try {
            const proofDocRef = doc(db, "coverageEntries", entry.id, "proofs", "data");
            const snap = await getDoc(proofDocRef);
            
            if (snap.exists()) {
                const data = snap.data();
                onPreview({ photo: data.photos?.[0], signature: data.signature }, title);
            } else {
                onPreview({ photo: entry.photos?.[0], signature: entry.signature || undefined }, title);
            }
        } catch (e) {
            console.error("Failed to load proof data:", e);
        } finally {
            setIsFetchingProof(false);
        }
    }, [entry, onPreview, isFetchingProof]);

    return (
        <React.Fragment>
            <TableRow className={cn("h-20 hover:bg-muted/30 border-b", isOpen && "bg-muted/10")}>
                <TableCell className="font-medium">
                    <div className="flex flex-col">
                        <span className="font-black text-base tracking-tight">{entry.firstName} {entry.lastName}</span>
                        <span className="text-[10px] text-primary font-black uppercase tracking-widest">{entry.specialty}</span>
                    </div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs font-medium text-muted-foreground">{entry.clinic}</TableCell>
                <TableCell className="whitespace-nowrap">
                    <div className="flex flex-col">
                        <span className="text-xs font-black uppercase tracking-tighter text-foreground">{entry.coverageDate ? format(parseISO(entry.coverageDate), "MMM do") : 'N/A'}</span>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase">{entry.submittedAt ? format(parseISO(entry.submittedAt), "h:mm a") : ''}</span>
                    </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-center">
                    {doctor?.frequency && <Badge variant="outline" className="font-mono text-[10px] font-black">{doctor.frequency}</Badge>}
                </TableCell>
                <TableCell>
                    <div className="flex items-center justify-center">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-10 w-10 p-0 rounded-lg relative overflow-hidden bg-muted group"
                            onClick={handleViewProofs}
                            disabled={isFetchingProof}
                        >
                            {isFetchingProof ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Camera className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />}
                        </Button>
                    </div>
                </TableCell>
                <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                        <AlertDialog>
                            <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-full"><MoreHorizontal size={18}/></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                    <DropdownMenuItem onClick={() => onEdit(entry)} disabled={!isEditable} className="gap-2 font-bold"><Edit size={14}/> Edit Report</DropdownMenuItem>
                                    {!readOnly && (
                                        <DropdownMenuItem className="text-destructive focus:text-destructive gap-2 font-bold">
                                            <AlertDialogTrigger className="flex items-center gap-2 w-full"><Trash2 size={14}/> Delete</AlertDialogTrigger>
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Delete this report?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone and will permanently remove this record from the system.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => onDelete(entry.id)} className="bg-destructive text-white">Confirm Delete</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setIsOpen(!isOpen)}>{isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</Button>
                    </div>
                </TableCell>
            </TableRow>
            {isOpen && (
                <TableRow className="bg-muted/20 border-b hover:bg-muted/20">
                    <TableCell colSpan={6} className="p-0">
                        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-10 text-xs animate-in slide-in-from-top-2 duration-300">
                            <div className="space-y-6">
                                <h4 className="font-black text-primary uppercase tracking-[0.2em] text-[10px]">Pre-call Strategy</h4>
                                <div className="grid grid-cols-2 gap-6">
                                    <DetailField label="Target Freq" value={doctor?.frequency} />
                                    <DetailField label="Call Result" value={entry.callType} />
                                    <DetailField label="Coverage" value={entry.coverageType} />
                                </div>
                                <DetailField label="Objective" value={entry.callObjective} />
                            </div>
                            <div className="space-y-6">
                                <h4 className="font-black text-primary uppercase tracking-[0.2em] text-[10px]">Samples & Allocation</h4>
                                <div className="space-y-4">
                                    <DetailField label="Primary Line" value={entry.primaryProduct} />
                                    <DetailField label="Item Disbursed" value={entry.primarySampleName} />
                                    <DetailField label="Units Issued" value={entry.primaryProductQty} />
                                </div>
                                {entry.reminderProducts && entry.reminderProducts.length > 0 && (
                                    <div className="pt-4 border-t border-white/5">
                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">Reminder Items</p>
                                        <div className="flex flex-wrap gap-2">{entry.reminderProducts.map((p, i) => (<Badge key={i} variant="secondary" className="text-[10px] h-6 px-3 bg-primary/10 text-primary border-primary/20">{p.sampleName} (x{p.quantity})</Badge>))}</div>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-6">
                                <h4 className="font-black text-primary uppercase tracking-[0.2em] text-[10px]">Post-call Intelligence</h4>
                                <div className="space-y-4">
                                    <DetailField label="Key Topics" value={entry.topicsDiscussed} />
                                    <DetailField label="Provider's Issue" value={entry.doctorsIssue} />
                                    <DetailField label="Forward Action" value={entry.planOfAction} />
                                </div>
                            </div>
                        </div>
                    </TableCell>
                </TableRow>
            )}
        </React.Fragment>
    )
}

export function SubmittedList({ 
    entries = [], 
    allEntries = [],
    doctors = [], 
    nonCallDays = [],
    onDelete, 
    onEdit, 
    readOnly = false,
    selectedMonth,
    onMonthChange,
    currentPage: serverCurrentPage,
    totalPages: serverTotalPages,
    goToNextPage,
    goToPreviousPage,
    loading = false
}: { 
    entries: CoverageEntry[], 
    allEntries?: CoverageEntry[],
    doctors: Doctor[], 
    nonCallDays?: NonCallDay[], 
    onDelete: (id: string) => void, 
    onEdit: (entry: CoverageEntry) => void, 
    readOnly?: boolean,
    selectedMonth?: string,
    onMonthChange?: (m: string) => void,
    currentPage?: number,
    totalPages?: number,
    goToNextPage?: () => void,
    goToPreviousPage?: () => void,
    loading?: boolean
}) {
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [previewProofs, setPreviewProofs] = useState<{ photo?: string, signature?: string, title: string } | null>(null);
    const [localPage, setLocalPage] = useState(1);
    const itemsPerPage = 10;

    const months = useMemo(() => {
        const list = [];
        const currentYear = new Date().getFullYear();
        for (let i = -6; i <= 6; i++) {
            const date = new Date(currentYear, new Date().getMonth() + i, 1);
            list.push({
                value: format(date, 'yyyy-MM'),
                label: format(date, 'MMMM yyyy')
            });
        }
        return list;
    }, []);

    const holidayDates = useMemo(() => {
        return Object.keys(PH_HOLIDAYS || {}).map(d => parseISO(d));
    }, []);

    const nonCallDates = useMemo(() => {
        return (nonCallDays || [])
            .filter(n => n.status === 'approved')
            .map(n => parseAnyDate(n.date))
            .filter((d): d is Date => d !== null && isValid(d));
    }, [nonCallDays]);

    const selectedHoliday = useMemo(() => selectedDate ? getHolidayName(selectedDate) : null, [selectedDate]);

    const filtered = useMemo(() => {
        const q = (searchQuery || "").toLowerCase().trim();
        const isCalSelection = viewMode === 'calendar' && selectedDate;
        const source = isCalSelection ? (allEntries || []) : (entries || []);
        
        return source.filter(e => {
            const matchesSearch = !q || `${e.firstName} ${e.lastName} ${e.clinic} ${e.specialty}`.toLowerCase().includes(q);
            
            if (isCalSelection) {
                const entryDate = e.coverageDate ? parseISO(e.coverageDate) : parseISO(e.submittedAt);
                return matchesSearch && isValid(entryDate) && isSameDay(entryDate, selectedDate!);
            }
            
            return matchesSearch;
        });
    }, [entries, allEntries, searchQuery, viewMode, selectedDate]);

    const isServerPaginated = !!goToNextPage;
    
    const paginatedEntries = useMemo(() => {
        if (viewMode === 'calendar' && selectedDate) return filtered;
        if (isServerPaginated) return filtered; 
        const start = (localPage - 1) * itemsPerPage;
        return filtered.slice(start, start + itemsPerPage);
    }, [filtered, localPage, isServerPaginated, viewMode, selectedDate]);

    const displayCurrentPage = isServerPaginated ? (serverCurrentPage || 1) : localPage;
    const displayTotalPages = isServerPaginated ? (serverTotalPages || 1) : Math.ceil(filtered.length / itemsPerPage);

    const calendarEntries = allEntries && allEntries.length > 0 ? allEntries : entries;

    const entryDates = useMemo(() => {
        return (calendarEntries || []).map(e => {
            const d = e.coverageDate ? parseISO(e.coverageDate) : parseISO(e.submittedAt);
            return isValid(d) ? d : null;
        }).filter(Boolean) as Date[];
    }, [calendarEntries]);

    const entriesCountByDate = useMemo(() => {
        const counts: Record<string, number> = {};
        (calendarEntries || []).forEach(e => {
            const d = e.coverageDate ? parseISO(e.coverageDate) : parseISO(e.submittedAt);
            if (isValid(d)) {
                const dateStr = format(d, 'yyyy-MM-dd');
                counts[dateStr] = (counts[dateStr] || 0) + 1;
            }
        });
        return counts;
    }, [calendarEntries]);

    const handleExportExcel = () => {
        const data = filtered.map(e => {
            const eFirst = (e.firstName || "").toLowerCase().trim();
            const eLast = (e.lastName || "").toLowerCase().trim();
            
            const doctor = (doctors || []).find(d => 
                (d.firstName || "").toLowerCase().trim() === eFirst && 
                (d.lastName || "").toLowerCase().trim() === eLast
            );

            return {
                "Provider": `${e.firstName} ${e.lastName}`,
                "Specialty": e.specialty,
                "Clinic": e.clinic,
                "Frequency": doctor?.frequency || "—",
                "Date": e.coverageDate ? format(parseISO(e.coverageDate), "yyyy-MM-dd") : "N/A",
                "Submitted": e.submittedAt ? format(parseISO(e.submittedAt), "Pp") : "N/A",
                "Type": e.coverageType,
                "Objective": e.callObjective
            };
        });
        const ws = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, ws, "Reports");
        XLSX.writeFile(workbook, `Submitted_Coverage.xlsx`);
    }

    const openPreview = (proofs: { photo?: string, signature?: string }, title: string) => {
        setPreviewProofs({ ...proofs, title });
    };

    return (
      <div className="space-y-6 animate-in fade-in duration-500 w-full">
         <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
                <h3 className="text-2xl font-black font-headline text-[#10b981]">Coverage Records</h3>
                <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Cursor-centric zoom active. Scroll to inspect.</p>
            </div>
            <div className="w-[240px] shrink-0">
                <Select value={selectedMonth} onValueChange={onMonthChange}>
                    <SelectTrigger className="bg-[#0a0c14] border-white/10 h-11 font-headline rounded-xl text-white">
                        <SelectValue placeholder="Select Month" />
                    </SelectTrigger>
                    <SelectContent>
                        {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
        </div>

        <Card className="p-4 border-2 shadow-xl bg-muted/5">
            <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                <div className="flex items-center gap-4 w-full max-w-xl">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder={viewMode === 'calendar' ? "Search provider for this date..." : "Search in current page..."} 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)} 
                            className="pl-10 h-11 border-2 focus-visible:ring-primary rounded-xl" 
                        />
                    </div>
                    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="shrink-0">
                        <TabsList className="grid grid-cols-2 w-[160px] h-11 p-1 rounded-xl bg-muted">
                            <TabsTrigger value="list" className="gap-2 font-bold"><List size={14}/> List</TabsTrigger>
                            <TabsTrigger value="calendar" className="gap-2 font-bold"><CalendarIcon size={14}/> Cal</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
                <Button variant="outline" size="sm" onClick={handleExportExcel} className="font-headline h-11 gap-2 border-2 w-full lg:w-auto rounded-xl"><Download size={16} /> Export Excel</Button>
            </div>
        </Card>

        <div className={cn("grid grid-cols-1 gap-8", viewMode === 'calendar' ? "lg:grid-cols-12" : "")}>
            {viewMode === 'calendar' && (
                <div className="lg:col-span-4 space-y-6">
                    <Card className="border-2 shadow-lg overflow-hidden sticky top-24 rounded-2xl">
                        <CardHeader className="bg-muted/30 border-b p-4 text-center">
                            <CardTitle className="text-xs font-black font-headline text-primary uppercase tracking-[0.2em]">History Inspector</CardTitle>
                        </CardHeader>
                        <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={setSelectedDate}
                            month={selectedMonth ? parseISO(selectedMonth + "-01") : undefined}
                            className="p-4"
                            modifiers={{ 
                                submitted: entryDates,
                                holiday: holidayDates,
                                nonCall: nonCallDates,
                            }}
                            modifiersStyles={{
                                submitted: { border: '3px solid hsl(var(--primary))', fontWeight: 'black' },
                                holiday: { backgroundColor: 'hsl(var(--accent) / 0.3)', color: 'hsl(var(--accent-foreground))', textDecoration: 'underline' },
                                nonCall: { backgroundColor: 'hsl(var(--destructive) / 0.2)', color: 'hsl(var(--destructive))', fontWeight: 'bold' }
                            }}
                            components={{
                                DayContent: ({ date, activeModifiers }) => {
                                    const dateStr = format(date, 'yyyy-MM-dd');
                                    const count = entriesCountByDate[dateStr];
                                    return (
                                        <div className="relative flex items-center justify-center w-full h-full font-black text-sm">
                                            {date.getDate()}
                                            {count > 0 && (
                                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] text-primary-foreground font-black shadow-sm ring-2 ring-background">
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
                        <Card className="border-2 border-orange-500/20 bg-orange-500/5 p-4 animate-in slide-in-from-left-2 duration-300 rounded-xl">
                            <div className="flex items-start gap-3">
                                <Info className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-500/70">Holiday Event</p>
                                    <p className="font-black text-sm text-orange-500">{selectedHoliday}</p>
                                </div>
                            </div>
                        </Card>
                    )}
                </div>
            )}

            <div className={cn(viewMode === 'calendar' ? "lg:col-span-8" : "w-full")}>
                <Card className="border-2 overflow-hidden shadow-2xl rounded-2xl">
                    <Table>
                        <TableHeader className="bg-muted/30 h-14">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="font-black uppercase tracking-widest text-[10px] pl-6">Medical Provider</TableHead>
                                <TableHead className="hidden md:table-cell font-black uppercase tracking-widest text-[10px]">Clinic/Hospital</TableHead>
                                <TableHead className="font-black uppercase tracking-widest text-[10px]">Coverage</TableHead>
                                <TableHead className="hidden sm:table-cell font-black uppercase tracking-widest text-[10px] text-center">Freq</TableHead>
                                <TableHead className="font-black uppercase tracking-widest text-[10px] text-center">Proofs</TableHead>
                                <TableHead className="text-right font-black uppercase tracking-widest text-[10px] pr-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedEntries.length > 0 ? (
                                paginatedEntries.map(e => (
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
                                    <TableCell colSpan={6} className="h-64 text-center">
                                        <div className="flex flex-col items-center gap-4 text-muted-foreground">
                                            {loading ? <Loader2 className="animate-spin w-10 h-10 text-primary" /> : <Search size={40} className="opacity-10" />}
                                            <p className="italic font-medium">
                                                {loading ? "Accessing Records..." : `No reports found for ${viewMode === 'calendar' && selectedDate ? format(selectedDate, "MMM d") : "this period"}.`}
                                            </p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Card>

                {viewMode === 'list' && displayTotalPages > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between mt-10 pb-10 gap-4">
                        <p className="text-xs text-muted-foreground font-black uppercase tracking-[0.2em]">
                            Page <span className="text-primary">{displayCurrentPage}</span> / {displayTotalPages}
                        </p>
                        <div className="flex items-center gap-3">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={isServerPaginated ? goToPreviousPage : () => setLocalPage(p => Math.max(1, p - 1))} 
                                disabled={(isServerPaginated ? displayCurrentPage === 1 : localPage === 1) || loading}
                                className="h-11 border-2 font-headline px-8 rounded-xl transition-all active:scale-95"
                            >
                                <ChevronLeft className="w-4 h-4 mr-2" />
                                Previous
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={isServerPaginated ? goToNextPage : () => setLocalPage(p => Math.min(displayTotalPages, p + 1))} 
                                disabled={(isServerPaginated ? displayCurrentPage === displayTotalPages : localPage === displayTotalPages) || loading}
                                className="h-11 border-2 font-headline px-8 rounded-xl transition-all active:scale-95"
                            >
                                Next
                                <ChevronRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>

        <Dialog open={!!previewProofs} onOpenChange={(open) => !open && setPreviewProofs(null)}>
            <DialogContent className="max-w-5xl p-0 overflow-hidden border-none bg-black/95 z-[1000] flex flex-col h-[90vh]">
                <DialogHeader className="p-4 border-b border-white/10 shrink-0">
                    <DialogTitle className="text-white font-headline text-lg">{previewProofs?.title}</DialogTitle>
                </DialogHeader>
                
                <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                    <div className="flex flex-col items-center gap-8 min-h-full">
                        {previewProofs?.photo && (
                            <div className="flex flex-col items-center gap-3 w-full animate-in fade-in zoom-in-95 duration-300">
                                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Capture Photo (Scroll to Zoom)</p>
                                <ZoomableImage src={previewProofs.photo} alt="Proof Photo" />
                            </div>
                        )}

                        {previewProofs?.signature && (
                            <div className="flex flex-col items-center gap-3 w-full animate-in fade-in zoom-in-95 duration-300">
                                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Doctor Signature (Scroll to Zoom)</p>
                                <ZoomableImage src={previewProofs.signature} alt="Signature" isSignature />
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-white/10 flex justify-end shrink-0">
                    <Button variant="ghost" className="text-white hover:bg-white/10 font-headline" onClick={() => setPreviewProofs(null)}>Close Proofs</Button>
                </div>
            </DialogContent>
        </Dialog>
      </div>
    );
}
