"use client"

import type { CoverageEntry, Doctor, NonCallDay } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO, isValid, isToday, isSameDay, addMonths, subMonths } from "date-fns";
import Image from "next/image";
import React, { useState, useMemo, useCallback } from "react";
import { Download, MoreHorizontal, Trash2, ChevronDown, ChevronUp, Edit, Search, History, Loader2, FileSpreadsheet, Maximize2, Calendar as CalendarIcon, List as ListIcon, CheckCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { cn, parseAnyDate } from "@/lib/utils";
import * as XLSX from 'xlsx';

const DetailField = ({ label, value }: { label: string, value?: string | number | null }) => (
    <div className="space-y-1">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
    </div>
)

const EntryRow = ({ entry, doctors, onDelete, onEdit, readOnly, onShowHistory, onPreview }: { 
    entry: CoverageEntry, 
    doctors: Doctor[], 
    onDelete: (id: string) => void, 
    onEdit: (entry: CoverageEntry) => void, 
    readOnly?: boolean,
    onShowHistory: (firstName: string, lastName: string) => void,
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
            const date = parseAnyDate(entry.submittedAt);
            return date ? isToday(date) : false;
        } catch (e) { return false; }
    }, [entry.submittedAt, readOnly]);

    const formattedDate = useMemo(() => {
        const date = parseAnyDate(entry.coverageDate || entry.submittedAt);
        return date ? format(date, "MMM do, yyyy") : 'N/A';
    }, [entry.coverageDate, entry.submittedAt]);

    const formattedTime = useMemo(() => {
        const date = parseAnyDate(entry.submittedAt);
        return date ? format(date, "h:mm a") : 'N/A';
    }, [entry.submittedAt]);

    return (
        <React.Fragment>
            <TableRow className={cn("h-16 transition-colors border-b", isOpen ? "bg-muted/40" : "hover:bg-muted/20")}>
                <TableCell className="font-medium">
                    <div className="flex flex-col">
                        <span className="font-bold text-sm leading-tight uppercase">{entry.firstName} {entry.lastName}</span>
                        <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{entry.specialty || "PROVIDER"}</span>
                    </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                    <span className="text-xs font-bold uppercase tracking-tight opacity-80">{entry.clinic || "No Clinic Data"}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                    <div className="flex flex-col">
                        <span className="text-xs font-black">{formattedDate}</span>
                    </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                    <div className="flex flex-col">
                        <span className="text-xs font-black">{formattedTime}</span>
                        <span className="text-[10px] text-muted-foreground font-black uppercase tracking-tighter">SUBMITTED</span>
                    </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-center">
                    {doctor?.frequency && <Badge variant="outline" className="font-black border-2 h-7 w-10 flex items-center justify-center rounded-full text-[10px]">{doctor.frequency}</Badge>}
                </TableCell>
                <TableCell>
                    <div className="flex items-center gap-2">
                        {entry.photos?.[0] && (
                            <div 
                                className="h-9 w-12 rounded-md overflow-hidden border-2 border-primary/20 cursor-pointer hover:scale-105 transition-transform relative group bg-muted shadow-sm"
                                onClick={() => onPreview(entry.photos![0], `Proof: ${entry.firstName}`)}
                            >
                                <Image src={entry.photos[0]} alt="proof" fill className="object-cover" />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Maximize2 className="w-4 h-4 text-white" />
                                </div>
                            </div>
                        )}
                        {entry.signature && (
                            <div 
                                className="p-1 bg-white border-2 rounded-md shadow-sm flex items-center justify-center h-9 w-16 cursor-pointer hover:scale-105 transition-transform relative group"
                                onClick={() => onPreview(entry.signature!, `Signature: ${entry.firstName}`)}
                            >
                                <Image src={entry.signature} alt="sig" width={50} height={25} className="object-contain" />
                                <div className="absolute inset-0 bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Maximize2 className="w-4 h-4 text-primary" />
                                </div>
                            </div>
                        )}
                    </div>
                </TableCell>
                <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                        <AlertDialog>
                            <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-10 w-10"><MoreHorizontal className="w-5 h-5"/></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onClick={() => onShowHistory(entry.firstName || "", entry.lastName || "")} className="gap-2 py-3"><History className="w-4 h-4 text-primary"/> Visits History</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onEdit(entry)} disabled={!isEditable} className="gap-2 py-3"><Edit className="w-4 h-4 text-primary"/> Edit Report</DropdownMenuItem>
                                    {!readOnly && (
                                        <DropdownMenuItem className="text-destructive focus:text-destructive gap-2 py-3">
                                            <AlertDialogTrigger className="flex items-center gap-2 w-full text-left"><Trash2 className="w-4 h-4"/> Delete Entry</AlertDialogTrigger>
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Delete this report?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => onDelete(entry.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setIsOpen(!isOpen)}>{isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</Button>
                    </div>
                </TableCell>
            </TableRow>
            {isOpen && (
                <TableRow className="bg-muted/10 border-b hover:bg-muted/10">
                    <TableCell colSpan={7} className="p-0">
                        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-12 animate-in slide-in-from-top-2 duration-200">
                            <div className="space-y-6">
                                <h4 className="text-sm font-black text-primary font-headline tracking-tight mb-4">Pre-call Plan</h4>
                                <div className="space-y-4">
                                    <DetailField label="Target Frequency" value={doctor?.frequency} />
                                    <DetailField label="Call Type" value={entry.callType} />
                                    <DetailField label="Coverage Type" value={entry.coverageType} />
                                    <DetailField label="Call Objective" value={entry.callObjective} />
                                </div>
                            </div>
                            <div className="space-y-6">
                                <h4 className="text-sm font-black text-primary font-headline tracking-tight mb-4">Samples & Products</h4>
                                <div className="space-y-5">
                                    <DetailField label="Primary Product" value={entry.primaryProduct} />
                                    <DetailField label="Primary Sample" value={entry.primarySampleName} />
                                    <DetailField label="Primary Qty" value={entry.primaryProductQty} />
                                    {entry.reminderProducts && entry.reminderProducts.length > 0 && (
                                        <div className="pt-4 border-t border-primary/10">
                                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Reminder Items</p>
                                            <div className="flex flex-wrap gap-2">{entry.reminderProducts.map((p, i) => (<Badge key={i} variant="secondary" className="text-[10px] font-black h-6 bg-primary/10 text-primary border-none">{p.sampleName} (x{p.quantity})</Badge>))}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-6">
                                <h4 className="text-sm font-black text-primary font-headline tracking-tight mb-4">Post-call Analysis</h4>
                                <div className="space-y-4">
                                    <DetailField label="Topics Discussed" value={entry.topicsDiscussed} />
                                    <DetailField label="Doctor's Issue" value={entry.doctorsIssue} />
                                    <DetailField label="Plan of Action" value={entry.planOfAction} />
                                </div>
                            </div>
                        </div>
                    </TableCell>
                </TableRow>
            )}
        </React.Fragment>
    )
}

function DoctorHistoryDialog({ doctorName, isOpen, onOpenChange }: { 
    doctorName: { first: string, last: string } | null, 
    isOpen: boolean, 
    onOpenChange: (open: boolean) => void 
}) {
    const [history, setHistory] = useState<CoverageEntry[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchHistory = useCallback(async () => {
        if (!doctorName || !db) return;
        setLoading(true);
        try {
            const q = query(collection(db, "coverageEntries"), where("firstName", "==", doctorName.first), where("lastName", "==", doctorName.last), limit(50));
            const snapshot = await getDocs(q);
            const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoverageEntry));
            setHistory(fetched.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || '')));
        } catch (error) { console.warn("History fetch error", error); } finally { setLoading(false); }
    }, [doctorName]);

    React.useEffect(() => { if (isOpen && doctorName) fetchHistory(); else setHistory([]); }, [isOpen, doctorName, fetchHistory]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 border-none overflow-hidden">
                <DialogHeader className="p-6 bg-muted/20 border-b">
                    <DialogTitle className="text-2xl font-black font-headline text-primary">Visits History</DialogTitle>
                    <DialogDescription className="text-lg">Timeline for <span className="font-bold text-foreground">Dr. {doctorName?.first} {doctorName?.last}</span></DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-hidden">
                    {loading ? (<div className="flex items-center justify-center h-80"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>) : history.length > 0 ? (
                        <ScrollArea className="h-[60vh] p-6"><div className="space-y-4">{history.map((entry) => (<Card key={entry.id} className="overflow-hidden border-2 shadow-sm"><CardHeader className="bg-muted/30 py-3 px-4 flex-row items-center justify-between space-y-0"><CardTitle className="text-base font-black font-headline text-primary">{entry.submittedAt ? format(parseISO(entry.submittedAt), "MMMM d, yyyy") : "N/A"}</CardTitle><Badge variant="secondary" className="capitalize">{entry.coverageType}</Badge></CardHeader><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6"><div className="space-y-3"><DetailField label="Objective" value={entry.callObjective} /><DetailField label="Product" value={entry.primaryProduct} /></div><div className="space-y-3"><DetailField label="Issues" value={entry.doctorsIssue} /><DetailField label="Plan" value={entry.planOfAction} /></div></CardContent></Card>))}</div></ScrollArea>
                    ) : (<div className="flex flex-col items-center justify-center py-20 text-muted-foreground italic">No history found.</div>)}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function SubmittedList({ 
    entries = [], doctors = [], onDelete, onEdit, readOnly = false,
    selectedMonth = format(new Date(), 'yyyy-MM'), onMonthChange
}: { 
    entries: CoverageEntry[], doctors: Doctor[], onDelete: (id: string) => void, onEdit: (entry: CoverageEntry) => void, readOnly?: boolean,
    selectedMonth?: string, onMonthChange?: (m: string) => void
}) {
    const [searchQuery, setSearchQuery] = useState("");
    const [historyDoctor, setHistoryDoctor] = useState<{ first: string, last: string } | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("list");
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [previewData, setPreviewData] = useState<{ src: string, title: string } | null>(null);

    const filtered = useMemo(() => (entries || []).filter(e => {
        const q = (searchQuery || "").toLowerCase().trim();
        if (q && !`${e.firstName} ${e.lastName} ${e.clinic}`.toLowerCase().includes(q)) return false;
        if (activeTab === 'calendar' && selectedDate) {
            const entryDate = parseAnyDate(e.coverageDate || e.submittedAt);
            return entryDate ? isSameDay(entryDate, selectedDate) : false;
        }
        return true;
    }), [entries, searchQuery, activeTab, selectedDate]);

    const entryDates = useMemo(() => entries.map(e => parseAnyDate(e.coverageDate || e.submittedAt)).filter(Boolean) as Date[], [entries]);

    const handleMonthNavigate = (dir: 'prev' | 'next') => {
        if (!onMonthChange) return;
        const current = parseISO(selectedMonth + "-01");
        const next = dir === 'prev' ? subMonths(current, 1) : addMonths(current, 1);
        onMonthChange(format(next, 'yyyy-MM'));
    }

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
        XLSX.writeFile(wb, `Reports_${selectedMonth}.xlsx`);
    }

    return (
      <div className="space-y-6 animate-in fade-in duration-500 w-full">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <h2 className="text-2xl font-bold font-headline text-primary">Submitted Reports</h2>
            <Button variant="outline" size="sm" onClick={handleExportExcel} className="font-headline gap-2 border-2 h-10">
                <FileSpreadsheet size={16} /> Export Excel
            </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 bg-muted/50 border-2 rounded-lg p-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMonthNavigate('prev')}><ChevronLeft size={16}/></Button>
                        <div className="flex items-center gap-2 px-3 text-xs font-black uppercase tracking-widest text-primary min-w-[120px] justify-center">
                            {format(parseISO(selectedMonth + "-01"), 'MMMM yyyy')}
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMonthNavigate('next')}><ChevronRight size={16}/></Button>
                    </div>

                    <TabsList className="bg-muted/50 p-1 rounded-xl border-2 grid grid-cols-2 w-[180px] h-10">
                        <TabsTrigger value="list" className="rounded-lg font-headline flex items-center gap-1 text-xs"><ListIcon size={14} /> List</TabsTrigger>
                        <TabsTrigger value="calendar" className="rounded-lg font-headline flex items-center gap-1 text-xs"><CalendarIcon size={14} /> Calendar</TabsTrigger>
                    </TabsList>
                </div>
                <div className="relative w-full max-md:max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input placeholder="Search by name or clinic..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-12 h-11 text-sm rounded-xl focus-visible:ring-primary border-2 shadow-sm bg-card" />
                </div>
            </div>

            <TabsContent value="list" className="mt-0 w-full">
                <Card className="shadow-lg border-2 rounded-xl overflow-hidden w-full">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50 h-14">
                                <TableHead className="font-bold text-foreground pl-6">Provider</TableHead>
                                <TableHead className="hidden md:table-cell font-bold text-foreground">Clinic</TableHead>
                                <TableHead className="font-bold text-foreground">Date</TableHead>
                                <TableHead className="font-bold text-foreground">Submitted</TableHead>
                                <TableHead className="hidden sm:table-cell font-bold text-center text-foreground">Target</TableHead>
                                <TableHead className="font-bold text-foreground">Proof</TableHead>
                                <TableHead className="text-right font-bold text-foreground pr-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.length > 0 ? (filtered.map(e => <EntryRow key={e.id} entry={e} doctors={doctors} onDelete={onDelete} onEdit={onEdit} readOnly={readOnly} onShowHistory={(f, l) => { setHistoryDoctor({first:f,last:l}); setIsHistoryOpen(true); }} onPreview={(s, t) => setPreviewData({src:s,title:t})} />)) : (
                                <TableRow><TableCell colSpan={7} className="h-72 text-center text-muted-foreground text-lg italic">No reports found for this month.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Card>
            </TabsContent>

            <TabsContent value="calendar" className="mt-0 w-full">
                <div className="flex flex-col xl:flex-row gap-8 items-start w-full">
                    <div className="w-full xl:w-[420px] shrink-0"><Card className="shadow-md border-2 overflow-hidden bg-card"><Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} modifiers={{ hasEntry: entryDates }} modifiersStyles={{ hasEntry: { border: '3px solid hsl(var(--primary))', fontWeight: 'bold' } }} className="w-full p-4" /></Card></div>
                    <div className="flex-1 w-full space-y-6"><Card className="shadow-lg border-2 rounded-xl overflow-hidden bg-card"><Table><TableHeader><TableRow className="bg-muted/50 h-14"><TableHead className="font-bold pl-6">Activity for {selectedDate ? format(selectedDate, "MMM d") : ""}</TableHead><TableHead className="text-right pr-6">Actions</TableHead></TableRow></TableHeader><TableBody>{filtered.length > 0 ? (filtered.map(e => <EntryRow key={e.id} entry={e} doctors={doctors} onDelete={onDelete} onEdit={onEdit} readOnly={readOnly} onShowHistory={(f, l) => { setHistoryDoctor({first:f,last:l}); setIsHistoryOpen(true); }} onPreview={(s, t) => setPreviewData({src:s,title:t})} />)) : (<TableRow><TableCell colSpan={2} className="h-56 text-center text-muted-foreground italic">No activity recorded for this date.</TableCell></TableRow>)}</TableBody></Table></Card></div>
                </div>
            </TabsContent>
        </Tabs>
        
        <DoctorHistoryDialog doctorName={historyDoctor} isOpen={isHistoryOpen} onOpenChange={setIsHistoryOpen} />
        <Dialog open={!!previewData} onOpenChange={(open) => !open && setPreviewData(null)}><DialogContent className="max-w-4xl p-0 overflow-hidden border-none bg-black/90"><div className="relative w-full h-[80vh] flex items-center justify-center p-4">{previewData?.src && (<Image src={previewData.src} alt="Proof Preview" width={1200} height={800} className={cn("max-w-full max-h-full object-contain rounded-md shadow-2xl", previewData.title.includes("Signature") ? "bg-white p-8" : "")} />)}</div><div className="absolute top-4 left-4"><Badge className="bg-primary text-primary-foreground font-headline text-sm px-4 py-1.5 shadow-lg">{previewData?.title}</Badge></div></DialogContent></Dialog>
      </div>
    );
}
