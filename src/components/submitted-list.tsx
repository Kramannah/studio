"use client"

import type { CoverageEntry, Doctor } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isValid, isToday, isSameDay, startOfMonth, endOfMonth, isWithinInterval, parse } from "date-fns";
import Image from "next/image";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Download, MoreHorizontal, Trash2, ChevronDown, ChevronUp, Edit, Search, CircleAlert, History, Loader2, List, Calendar as CalendarIcon, FileSpreadsheet } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { cn } from "@/lib/utils";
import * as XLSX from 'xlsx';

const DetailItem = ({ label, value }: { label: string, value?: string | number | null }) => {
    if (!value && typeof value !== 'number') return null;
    return (
        <div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{label}</p>
            <p className="text-sm font-medium text-foreground">{value}</p>
        </div>
    )
}

const EntryRow = ({ entry, doctors, onDelete, onEdit, readOnly, onShowHistory }: { 
    entry: CoverageEntry, 
    doctors: Doctor[], 
    onDelete: (id: string) => void, 
    onEdit: (entry: CoverageEntry) => void, 
    readOnly?: boolean,
    onShowHistory: (firstName: string, lastName: string) => void
}) => {
    const [isOpen, setIsOpen] = useState(false);
    
    const doctor = useMemo(() => {
        const eFirst = (entry.firstName ?? "").toLowerCase().trim();
        const eLast = (entry.lastName ?? "").toLowerCase().trim();
        return doctors.find(d => 
            (d.firstName ?? "").toLowerCase().trim() === eFirst && 
            (d.lastName ?? "").toLowerCase().trim() === eLast
        );
    }, [doctors, entry.firstName, entry.lastName]);

    const isEditable = useMemo(() => {
        if (readOnly) return false;
        const subDate = entry.submittedAt ? parseISO(entry.submittedAt) : null;
        return subDate && isValid(subDate) && isToday(subDate);
    }, [entry.submittedAt, readOnly]);

    const subDate = entry.submittedAt ? parseISO(entry.submittedAt) : null;

    return (
         <Collapsible asChild open={isOpen} onOpenChange={setIsOpen}>
            <TableBody>
            <TableRow className="h-16 hover:bg-muted/30 transition-colors">
                <TableCell className="font-medium">
                    <div className="flex flex-col">
                        <span className="font-bold text-primary">{entry.firstName} {entry.lastName}</span>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">{entry.specialty || "N/A"}</span>
                    </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                    <span className="text-sm font-medium">{entry.clinic || "N/A"}</span>
                </TableCell>
                <TableCell>
                    <span className="text-sm tabular-nums">
                        {subDate && isValid(subDate) ? format(subDate, "MMM d") : 'N/A'}
                    </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                    <Badge variant="secondary" className="text-[10px] font-bold">{doctor?.frequency || 'N/A'}</Badge>
                </TableCell>
                <TableCell>
                    <div className="flex items-center gap-2">
                        {entry.photos?.[0] && <Image src={entry.photos[0]} alt="proof" width={32} height={32} className="rounded-md object-cover border-2 border-primary/20" />}
                        {entry.signature && <div className="p-1 bg-white border rounded shadow-sm"><Image src={entry.signature} alt="sig" width={32} height={16} /></div>}
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
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-10 w-10">
                                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                </TableCell>
            </TableRow>
            <CollapsibleContent asChild>
                <TableRow className="bg-muted/10">
                    <TableCell colSpan={6} className="p-0 border-b">
                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-200">
                            <div className="space-y-4">
                                <h4 className="flex items-center gap-2 font-black text-primary text-[10px] uppercase tracking-widest"><List className="w-3 h-3" /> Call Details</h4>
                                <DetailItem label="Objective" value={entry.callObjective} />
                                <DetailItem label="Coverage Type" value={entry.coverageType} />
                            </div>
                            <div className="space-y-4">
                                <h4 className="flex items-center gap-2 font-black text-primary text-[10px] uppercase tracking-widest"><CircleAlert className="w-3 h-3" /> Sampling</h4>
                                <DetailItem label="Primary Product" value={entry.primaryProduct} />
                                <DetailItem label="Quantity Issued" value={entry.primaryProductQty} />
                                {entry.reminderProducts && entry.reminderProducts.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Reminder Items</p>
                                        <div className="mt-1 space-y-1">
                                            {entry.reminderProducts.map((p, i) => (
                                                <p key={i} className="text-xs font-medium">{p.sampleName} (x{p.quantity})</p>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-4">
                                <h4 className="flex items-center gap-2 font-black text-primary text-[10px] uppercase tracking-widest"><History className="w-3 h-3" /> Post-Call Analysis</h4>
                                <DetailItem label="Issues Encountered" value={entry.doctorsIssue} />
                                <DetailItem label="Next Steps" value={entry.planOfAction} />
                            </div>
                        </div>
                    </TableCell>
                </TableRow>
            </CollapsibleContent>
            </TableBody>
         </Collapsible>
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
                                                <DetailItem label="Objective" value={entry.callObjective} />
                                                <DetailItem label="Product" value={entry.primaryProduct} />
                                            </div>
                                            <div className="space-y-3">
                                                <DetailItem label="Issues" value={entry.doctorsIssue} />
                                                <DetailItem label="Plan" value={entry.planOfAction} />
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
    const itemsPerPage = 10;

    useEffect(() => {
        const now = new Date();
        setSelectedDate(now);
        setSelectedMonth(format(now, 'yyyy-MM'));
        setMounted(true);
    }, []);
    
    const availableMonths = useMemo(() => {
        if (!mounted) return [];
        const monthSet = new Set<string>();
        entries.forEach(entry => {
            const dateStr = String(entry.coverageDate ?? "");
            if (dateStr) {
                const date = parseISO(dateStr);
                if (date && isValid(date)) monthSet.add(format(date, 'yyyy-MM'));
            }
        });
        monthSet.add(format(new Date(), 'yyyy-MM'));
        return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
    }, [entries, mounted]);

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
        return entries.filter(e => {
            const dateStr = String(e.coverageDate ?? "");
            if (!dateStr) return false;
            const date = parseISO(dateStr);
            return date && isValid(date) && isWithinInterval(date, monthRange);
        });
    }, [entries, monthRange, mounted]);

    const entriesCountByDate = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredByMonth.forEach(e => {
            const dateStr = String(e.coverageDate ?? "");
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

    const filtered = useMemo(() => {
        if (!mounted) return [];
        let res = [...filteredByMonth];
        const q = (searchQuery ?? "").toLowerCase().trim();
        if (q) {
            res = res.filter(e => {
                const first = (e.firstName ?? "").toLowerCase();
                const last = (e.lastName ?? "").toLowerCase();
                const clinic = (e.clinic ?? "").toLowerCase();
                return first.includes(q) || last.includes(q) || clinic.includes(q);
            });
        }
        if (activeTab === 'calendar' && selectedDate) {
            res = res.filter(e => {
                const dateStr = String(e.coverageDate ?? "");
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
            const dateStr = String(entry.coverageDate ?? "");
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
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full mb-8">
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
                <div className="relative w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input 
                        placeholder="Search by name or clinic..." 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        className="pl-12 h-12 text-lg rounded-xl focus-visible:ring-primary border-2 shadow-sm bg-card" 
                    />
                </div>
                <TabsList className="grid grid-cols-2 h-12 p-1 bg-muted/50 rounded-xl border-2 shadow-sm shrink-0 w-full sm:auto overflow-hidden">
                    <TabsTrigger value="list" className="rounded-lg h-full px-5 flex items-center justify-center transition-all duration-200"><List className="w-7 h-7" /></TabsTrigger>
                    <TabsTrigger value="calendar" className="rounded-lg h-full px-5 flex items-center justify-center transition-all duration-200"><CalendarIcon className="w-7 h-7" /></TabsTrigger>
                </TabsList>
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
                        {paginatedEntries.length > 0 ? (
                            paginatedEntries.map(e => <EntryRow key={e.id} entry={e} doctors={doctors} onDelete={onDelete} onEdit={onEdit} readOnly={readOnly} onShowHistory={handleShowHistory} />)
                        ) : (
                            <TableBody><TableRow><TableCell colSpan={6} className="h-72 text-center text-muted-foreground text-lg italic">No reports found.</TableCell></TableRow></TableBody>
                        )}
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
                                modifiers={{ hasEntry: entryDates }}
                                modifiersStyles={{ hasEntry: { border: '3px solid hsl(var(--primary))', fontWeight: 'bold' } }}
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
                                <TableHeader><TableRow className="bg-muted/50 h-14"><TableHead className="font-bold pl-6">Provider</TableHead><TableHead className="text-right pr-6">Actions</TableHead></TableRow></TableHeader>
                                <TableBody>
                                {filtered.length > 0 ? (
                                    filtered.map(e => <EntryRow key={e.id} entry={e} doctors={doctors} onDelete={onDelete} onEdit={onEdit} readOnly={readOnly} onShowHistory={handleShowHistory} />)
                                ) : (
                                    <TableRow><TableCell colSpan={2} className="h-56 text-center text-muted-foreground italic">No activity for this date.</TableCell></TableRow>
                                )}
                                </TableBody>
                            </Table>
                        </Card>
                    </div>
                </div>
            </TabsContent>
        </Tabs>
        <DoctorHistoryDialog doctorName={historyDoctor} isOpen={isHistoryOpen} onOpenChange={setIsHistoryOpen} />
      </div>
    );
}