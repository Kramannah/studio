
"use client"

import type { CoverageEntry, Doctor } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO, isValid, isToday, isSameDay, startOfMonth, endOfMonth, isWithinInterval, parse } from "date-fns";
import Image from "next/image";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Download, MoreHorizontal, Trash2, ChevronDown, ChevronUp, Edit, Search, History, Loader2, FileSpreadsheet, Maximize2, Calendar as CalendarIcon, List as ListIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, PH_HOLIDAYS_2026 } from "@/lib/utils";
import * as XLSX from 'xlsx';

const DetailField = ({ label, value }: { label: string, value?: string | number | null }) => {
    return (
        <div className="space-y-1">
            <p className="text-[11px] font-bold text-muted-foreground leading-none">{label}</p>
            <p className="text-sm font-medium text-foreground leading-tight">{value || "—"}</p>
        </div>
    )
}

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
        const eFirst = (entry.firstName ?? "").toString().toLowerCase().trim();
        const eLast = (entry.lastName ?? "").toString().toLowerCase().trim();
        return (doctors || []).find(d => 
            (d.firstName ?? "").toString().toLowerCase().trim() === eFirst && 
            (d.lastName ?? "").toString().toLowerCase().trim() === eLast
        );
    }, [doctors, entry.firstName, entry.lastName]);

    const isEditable = useMemo(() => {
        if (readOnly) return false;
        const subDate = entry.submittedAt ? parseISO(entry.submittedAt) : null;
        return subDate && isValid(subDate) && isToday(subDate);
    }, [entry.submittedAt, readOnly]);

    const displayDate = entry.coverageDate ? parseISO(entry.coverageDate) : (entry.submittedAt ? parseISO(entry.submittedAt) : null);

    return (
        <React.Fragment>
            <TableRow className={cn("h-16 transition-colors border-b", isOpen ? "bg-muted/40" : "hover:bg-muted/20")}>
                <TableCell className="font-medium min-w-[200px]">
                    <div className="flex flex-col">
                        <span className="font-bold text-base leading-tight">{entry.firstName} {entry.lastName}</span>
                        <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{entry.specialty || "PROVIDER"}</span>
                    </div>
                </TableCell>
                <TableCell className="hidden md:table-cell max-w-[250px]">
                    <span className="text-sm font-bold uppercase tracking-tight truncate block">{entry.clinic || "No Clinic Data"}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                    <div className="flex flex-col">
                        <span className="text-sm font-bold">{displayDate && isValid(displayDate) ? format(displayDate, "MMM do,") : 'N/A'}</span>
                        <span className="text-[10px] text-muted-foreground font-bold">{displayDate && isValid(displayDate) ? format(displayDate, "yyyy") : ''}</span>
                    </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-center">
                    {doctor?.frequency && <Badge variant="outline" className="font-black border-2 h-7 w-10 flex items-center justify-center rounded-full text-xs">{doctor.frequency}</Badge>}
                </TableCell>
                <TableCell>
                    <div className="flex items-center gap-2">
                        {entry.photos?.[0] && (
                            <div 
                                className="h-9 w-12 rounded-md overflow-hidden border-2 border-primary/20 cursor-pointer hover:scale-105 transition-transform relative group bg-muted"
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
                                    <DropdownMenuItem onClick={() => onShowHistory(entry.firstName || "", entry.lastName || "")} className="gap-2 py-3">
                                        <History className="w-4 h-4 text-primary"/> Visits History
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onEdit(entry)} disabled={!isEditable} className="gap-2 py-3">
                                        <Edit className="w-4 h-4 text-primary"/> Edit Report
                                    </DropdownMenuItem>
                                    {!readOnly && (
                                        <DropdownMenuItem className="text-destructive focus:text-destructive gap-2 py-3">
                                            <AlertDialogTrigger className="flex items-center gap-2 w-full">
                                                <Trash2 className="w-4 h-4"/> Delete Entry
                                            </AlertDialogTrigger>
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this report?</AlertDialogTitle>
                                    <AlertDialogDescription>This action cannot be undone and will remove the record from the server.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDelete(entry.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setIsOpen(!isOpen)}>
                            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                    </div>
                </TableCell>
            </TableRow>
            {isOpen && (
                <TableRow className="bg-muted/10 border-b hover:bg-muted/10">
                    <TableCell colSpan={6} className="p-0">
                        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-12 animate-in slide-in-from-top-2 duration-200">
                            <div className="space-y-6">
                                <h4 className="text-sm font-black text-primary font-headline tracking-tight mb-4">Pre-call Plan</h4>
                                <div className="space-y-4">
                                    <DetailField label="Target Frequency" value={doctor?.frequency} />
                                    <DetailField label="Call Type" value={entry.callType} />
                                    <DetailField label="Coverage Type" value={entry.coverageType} />
                                    <DetailField label="HACME" value={entry.hacme || doctor?.hacme} />
                                    <DetailField label="Call Objective" value={entry.callObjective} />
                                </div>
                            </div>
                            <div className="space-y-6">
                                <h4 className="text-sm font-black text-primary font-headline tracking-tight mb-4">Samples & Products</h4>
                                <div className="space-y-5">
                                    <div className="space-y-3">
                                        <DetailField label="Primary Product" value={entry.primaryProduct} />
                                        <DetailField label="Primary Sample" value={entry.primarySampleName} />
                                        <DetailField label="Primary Quantity" value={entry.primaryProductQty} />
                                    </div>
                                    <div className="pt-4 space-y-3 border-t border-primary/10">
                                        <DetailField label="Secondary Product" value={entry.secondaryProduct} />
                                        <DetailField label="Secondary Sample" value={entry.secondarySampleName} />
                                        <DetailField label="Secondary Quantity" value={entry.secondaryProductQty} />
                                    </div>
                                    {entry.reminderProducts && entry.reminderProducts.length > 0 && (
                                        <div className="pt-4 border-t border-primary/10">
                                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Reminder Items</p>
                                            <div className="flex flex-wrap gap-2">
                                                {entry.reminderProducts.map((p, i) => (
                                                    <Badge key={i} variant="secondary" className="text-[10px] font-black h-6 bg-primary/10 text-primary border-none">
                                                        {p.sampleName} (x{p.quantity})
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-6">
                                <h4 className="text-sm font-black text-primary font-headline tracking-tight mb-4">Post-call Analysis</h4>
                                <div className="space-y-4">
                                    <DetailField label="Topics Discussed" value={entry.topicsDiscussed} />
                                    <DetailField label="Doctor's Issue/Concern" value={entry.doctorsIssue} />
                                    <DetailField label="Plan of Action" value={entry.planOfAction} />
                                    <DetailField label="Reflection: What Went Well" value={entry.whatWentWell} />
                                    <DetailField label="Reflection: Improvement" value={entry.areasForImprovement} />
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
            const q = query(
                collection(db, "coverageEntries"),
                where("firstName", "==", doctorName.first),
                where("lastName", "==", doctorName.last),
                orderBy("coverageDate", "desc")
            );
            const snapshot = await getDocs(q);
            setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoverageEntry)));
        } catch (error) {
            console.error("History fetch error:", error);
        } finally {
            setLoading(false);
        }
    }, [doctorName]);

    useEffect(() => {
        if (isOpen && doctorName) fetchHistory();
        else setHistory([]);
    }, [isOpen, doctorName, fetchHistory]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 border-none overflow-hidden">
                <DialogHeader className="p-6 bg-muted/20 border-b">
                    <DialogTitle className="text-2xl font-black font-headline text-primary">Visits History</DialogTitle>
                    <DialogDescription className="text-lg">
                        Timeline for <span className="font-bold text-foreground">Dr. {doctorName?.first} {doctorName?.last}</span>
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-hidden">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-80 gap-4">
                            <Loader2 className="w-10 h-10 animate-spin text-primary" />
                        </div>
                    ) : history.length > 0 ? (
                        <ScrollArea className="h-[60vh] p-6">
                            <div className="space-y-4">
                                {history.map((entry) => (
                                    <Card key={entry.id} className="overflow-hidden border-2 shadow-sm">
                                        <CardHeader className="bg-muted/30 py-3 px-4 flex-row items-center justify-between space-y-0">
                                            <CardTitle className="text-base font-black font-headline text-primary">
                                                {entry.coverageDate ? format(parseISO(entry.coverageDate), "MMMM d, yyyy") : "N/A"}
                                            </CardTitle>
                                            <Badge variant="secondary" className="capitalize">{entry.coverageType}</Badge>
                                        </CardHeader>
                                        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-3">
                                                <DetailField label="Objective" value={entry.callObjective} />
                                                <DetailField label="Product" value={entry.primaryProduct} />
                                            </div>
                                            <div className="space-y-3">
                                                <DetailField label="Issues" value={entry.doctorsIssue} />
                                                <DetailField label="Plan" value={entry.planOfAction} />
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </ScrollArea>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground italic">No history found.</div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function SubmittedList({ 
    entries = [], 
    doctors = [], 
    onDelete, 
    onEdit, 
    readOnly = false,
    isAdminView = false,
    userMap
}: { 
    entries: CoverageEntry[], 
    doctors: Doctor[], 
    onDelete: (id: string) => void, 
    onEdit: (entry: CoverageEntry) => void, 
    readOnly?: boolean,
    isAdminView?: boolean,
    userMap?: Record<string, { code: string; firstName: string; lastName: string }>
}) {
    const [searchQuery, setSearchQuery] = useState("");
    const [historyDoctor, setHistoryDoctor] = useState<{ first: string, last: string } | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("list");
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    const [selectedMonth, setSelectedMonth] = useState<string>("");
    const [mounted, setMounted] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [previewData, setPreviewData] = useState<{ src: string, title: string } | null>(null);
    const itemsPerPage = 10;

    useEffect(() => {
        setMounted(true);
    }, []);

    const availableMonths = useMemo(() => {
        if (!mounted) return [];
        const monthSet = new Set<string>();
        (entries || []).forEach(entry => {
            const dateStr = (entry.coverageDate || entry.submittedAt || "").toString();
            if (dateStr) {
                const date = parseISO(dateStr);
                if (isValid(date)) monthSet.add(format(date, 'yyyy-MM'));
            }
        });
        monthSet.add(format(new Date(), 'yyyy-MM'));
        return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
    }, [entries, mounted]);

    useEffect(() => {
        if (!mounted) return;
        
        if (entries && entries.length > 0) {
            const monthsWithData = new Set<string>();
            entries.forEach(e => {
                const d = parseISO(String(e.coverageDate || e.submittedAt));
                if (isValid(d)) monthsWithData.add(format(d, 'yyyy-MM'));
            });

            const currentSelectionEmpty = !monthsWithData.has(selectedMonth);
            
            if (currentSelectionEmpty || !selectedMonth) {
                const sortedMonths = Array.from(monthsWithData).sort((a, b) => b.localeCompare(a));
                if (sortedMonths.length > 0) {
                    setSelectedMonth(sortedMonths[0]);
                    setSelectedDate(parse(sortedMonths[0], 'yyyy-MM', new Date()));
                    return;
                }
            }
        }
        
        if (!selectedMonth) {
            setSelectedMonth(format(new Date(), 'yyyy-MM'));
            setSelectedDate(new Date());
        }
    }, [entries, mounted, selectedMonth]);

    useEffect(() => {
        if (!selectedMonth || !mounted) return;
        try {
            const monthDate = parse(selectedMonth, 'yyyy-MM', new Date());
            if (isValid(monthDate)) {
                setSelectedDate(monthDate);
                setCurrentPage(1);
            }
        } catch (e) {}
    }, [selectedMonth, mounted]);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, searchQuery]);

    const handleShowHistory = (firstName: string, lastName: string) => {
        setHistoryDoctor({ first: firstName, last: lastName });
        setIsHistoryOpen(true);
    };

    const handlePreview = (src: string, title: string) => {
        setPreviewData({ src, title });
    };

    const monthRange = useMemo(() => {
        if (!selectedMonth || !mounted) return { start: new Date(), end: new Date() };
        try {
            const monthDate = parse(selectedMonth, 'yyyy-MM', new Date());
            return { start: startOfMonth(monthDate), end: endOfMonth(monthDate) };
        } catch (e) {
            return { start: new Date(), end: new Date() };
        }
    }, [selectedMonth, mounted]);

    const filteredByMonth = useMemo(() => {
        if (!mounted) return [];
        return (entries || []).filter(e => {
            const dateStr = (e.coverageDate || e.submittedAt || "").toString();
            if (!dateStr) return false;
            const date = parseISO(dateStr);
            return date && isValid(date) && isWithinInterval(date, monthRange);
        });
    }, [entries, monthRange, mounted]);

    const entriesCountByDate = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredByMonth.forEach(e => {
            const dateStr = (e.coverageDate || e.submittedAt || "").toString();
            if (dateStr) {
                const date = parseISO(dateStr);
                if (date && isValid(date)) {
                    const key = format(date, 'yyyy-MM-dd');
                    counts[key] = (counts[key] || 0) + 1;
                }
            }
        });
        return counts;
    }, [filteredByMonth]);

    const entryDates = useMemo(() => {
        return Object.keys(entriesCountByDate).map(d => parseISO(d));
    }, [entriesCountByDate]);

    const holidayDates = useMemo(() => {
        return Object.keys(PH_HOLIDAYS_2026).map(d => parseISO(d));
    }, []);

    const filtered = useMemo(() => {
        if (!mounted) return [];
        let res = [...filteredByMonth];
        const q = (searchQuery ?? "").toString().toLowerCase().trim();
        if (q) {
            res = res.filter(e => {
                const first = (e.firstName ?? "").toString().toLowerCase();
                const last = (e.lastName ?? "").toString().toLowerCase();
                const clinic = (e.clinic ?? "").toString().toLowerCase();
                return first.includes(q) || last.includes(q) || clinic.includes(q);
            });
        }
        if (activeTab === 'calendar' && selectedDate) {
            res = res.filter(e => {
                const dateStr = (e.coverageDate || e.submittedAt || "").toString();
                if (!dateStr) return false;
                const d = parseISO(dateStr);
                return d && isSameDay(d, selectedDate);
            });
        }
        return res;
    }, [filteredByMonth, searchQuery, activeTab, selectedDate, mounted]);

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginatedEntries = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filtered.slice(start, start + itemsPerPage);
    }, [filtered, currentPage]);

    const handleDownloadExcel = () => {
        const dataToExport = filtered.map(entry => {
            const dateStr = (entry.coverageDate || entry.submittedAt || "").toString();
            const covDate = dateStr ? parseISO(dateStr) : null;
            let userName = entry.userId;
            if (userMap?.[entry.userId]) {
                const u = userMap[entry.userId];
                userName = `${u.firstName} ${u.lastName} (${u.code})`;
            }
            return {
                "User": userName,
                "Doctor": `${entry.firstName} ${entry.lastName}`,
                "Specialty": entry.specialty || "N/A",
                "Clinic": entry.clinic || "N/A",
                "Coverage Date": covDate && isValid(covDate) ? format(covDate, "yyyy-MM-dd") : "N/A",
                "Type": entry.coverageType,
                "Product": entry.primaryProduct || "N/A",
                "Qty": entry.primaryProductQty || 0
            };
        });
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Reports");
        XLSX.writeFile(workbook, `Report_${selectedMonth || 'current'}.xlsx`);
    };

    if (!mounted) return (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Aggregating Reports...</p>
        </div>
    );

    return (
      <div className="space-y-6 animate-in fade-in duration-500 w-full">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <h2 className="text-2xl font-bold font-headline text-primary">Submitted Reports</h2>
            <Button onClick={handleDownloadExcel} variant="outline" className="border-2 font-headline h-11 w-full md:w-auto">
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
            </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                <TabsList className="bg-muted/50 p-1 rounded-xl border-2 grid grid-cols-2 w-full md:w-[320px] h-12">
                    <TabsTrigger value="list" className="rounded-lg font-headline flex items-center gap-2">
                        <ListIcon size={16} /> List
                    </TabsTrigger>
                    <TabsTrigger value="calendar" className="rounded-lg font-headline flex items-center gap-2">
                        <CalendarIcon size={16} /> Calendar
                    </TabsTrigger>
                </TabsList>
                
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto flex-1">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-full sm:w-[220px] h-12 border-2 rounded-xl bg-card shadow-sm font-headline text-base">
                            <SelectValue placeholder="Select month" />
                        </SelectTrigger>
                        <SelectContent>
                            {availableMonths.map(month => {
                                try {
                                    const label = format(parse(month, 'yyyy-MM', new Date()), 'MMMM yyyy');
                                    return <SelectItem key={month} value={month}>{label}</SelectItem>
                                } catch (e) { return null; }
                            })}
                        </SelectContent>
                    </Select>
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input 
                            placeholder="Search by name or clinic..." 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)} 
                            className="pl-12 h-12 text-lg rounded-xl focus-visible:ring-primary border-2 shadow-sm bg-card" 
                        />
                    </div>
                </div>
            </div>

            <TabsContent value="list" className="mt-0 w-full">
                <Card className="shadow-lg border-2 rounded-xl overflow-hidden w-full">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50 h-14">
                                <TableHead className="font-bold text-foreground">Provider</TableHead>
                                <TableHead className="hidden md:table-cell font-bold text-foreground">Clinic</TableHead>
                                <TableHead className="font-bold text-foreground">Date</TableHead>
                                <TableHead className="hidden sm:table-cell font-bold text-center text-foreground">Target</TableHead>
                                <TableHead className="font-bold text-foreground">Proof</TableHead>
                                <TableHead className="text-right font-bold text-foreground">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedEntries.length > 0 ? (
                                paginatedEntries.map(e => <EntryRow key={e.id} entry={e} doctors={doctors} onDelete={onDelete} onEdit={onEdit} readOnly={readOnly} onShowHistory={handleShowHistory} onPreview={handlePreview} />)
                            ) : (
                                <TableRow><TableCell colSpan={6} className="h-72 text-center text-muted-foreground text-lg italic">No reports found for this period.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Card>
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6 px-1">
                        <p className="text-sm text-muted-foreground font-medium">Page {currentPage} of {totalPages}</p>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="h-9 px-4 border-2 rounded-lg font-headline">Previous</Button>
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="h-9 px-4 border-2 rounded-lg font-headline">Next</Button>
                        </div>
                    </div>
                )}
            </TabsContent>

            <TabsContent value="calendar" className="mt-0 w-full">
                <div className="flex flex-col xl:flex-row gap-8 items-start w-full">
                    <div className="w-full xl:w-[420px] shrink-0">
                        <Card className="shadow-md border-2 overflow-hidden bg-card">
                            <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={setSelectedDate}
                                month={selectedMonth ? parse(selectedMonth, 'yyyy-MM', new Date()) : undefined}
                                modifiers={{ hasEntry: entryDates, holiday: holidayDates }}
                                modifiersStyles={{ 
                                    hasEntry: { border: '3px solid hsl(var(--primary))', fontWeight: 'bold' },
                                    holiday: { backgroundColor: 'hsl(var(--accent) / 0.3)', color: 'hsl(var(--accent-foreground))', textDecoration: 'underline' }
                                }}
                                components={{
                                    DayContent: ({ date }) => {
                                        const dateString = format(date, 'yyyy-MM-dd');
                                        const count = entriesCountByDate[dateString];
                                        return (
                                            <div className="relative flex items-center justify-center w-full h-full">
                                                {date.getDate()}
                                                {count && (
                                                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-black shadow-sm">
                                                        {count}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    },
                                }}
                                className="w-full p-4"
                            />
                        </Card>
                    </div>
                    <div className="flex-1 w-full space-y-6">
                        <Card className="shadow-lg border-2 rounded-xl overflow-hidden bg-card">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 h-14">
                                        <TableHead className="font-bold pl-6">Provider Activity for {selectedDate ? format(selectedDate, "MMM d") : ""}</TableHead>
                                        <TableHead className="text-right pr-6">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                {filtered.length > 0 ? (
                                    filtered.map(e => <EntryRow key={e.id} entry={e} doctors={doctors} onDelete={onDelete} onEdit={onEdit} readOnly={readOnly} onShowHistory={handleShowHistory} onPreview={handlePreview} />)
                                ) : (
                                    <TableRow><TableCell colSpan={2} className="h-56 text-center text-muted-foreground italic">No activity recorded for this date.</TableCell></TableRow>
                                )}
                                </TableBody>
                            </Table>
                        </Card>
                    </div>
                </div>
            </TabsContent>
        </Tabs>
        
        <DoctorHistoryDialog doctorName={historyDoctor} isOpen={isHistoryOpen} onOpenChange={setIsHistoryOpen} />
        
        <Dialog open={!!previewData} onOpenChange={(open) => !open && setPreviewData(null)}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden border-none bg-black/90">
                <DialogHeader className="p-4 bg-background border-b sr-only">
                    <DialogTitle>{previewData?.title}</DialogTitle>
                </DialogHeader>
                <div className="relative w-full h-[80vh] flex items-center justify-center p-4">
                    {previewData?.src && (
                        <Image 
                            src={previewData.src} 
                            alt="Proof Preview" 
                            width={1200} 
                            height={800} 
                            className={cn(
                                "max-w-full max-h-full object-contain rounded-md shadow-2xl transition-all duration-300",
                                previewData.title.includes("Signature") ? "bg-white p-8" : ""
                            )} 
                        />
                    )}
                </div>
                <div className="absolute top-4 left-4 pointer-events-none">
                    <Badge className="bg-primary text-primary-foreground font-headline text-sm px-4 py-1.5 shadow-lg">
                        {previewData?.title}
                    </Badge>
                </div>
            </DialogContent>
        </Dialog>
      </div>
    );
}
