"use client"

import type { CoverageEntry, Doctor } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isValid, isToday, isSameDay, startOfMonth, endOfMonth, isWithinInterval, parse } from "date-fns";
import Image from "next/image";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Download, MoreHorizontal, Trash2, ChevronDown, ChevronUp, Edit, Search, CircleAlert, History, Loader2, List, Calendar as CalendarIcon, Clock, CheckCheck, LayoutList } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const DetailItem = ({ label, value }: { label: string, value?: string | number | null }) => {
    if (!value && typeof value !== 'number') return null;
    return (
        <div>
            <p className="text-xs font-semibold text-muted-foreground">{label}</p>
            <p className="text-sm">{value}</p>
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
        return doctors.find(d => d.firstName.toLowerCase() === entry.firstName?.toLowerCase() && d.lastName.toLowerCase() === entry.lastName?.toLowerCase());
    }, [doctors, entry.firstName, entry.lastName]);

    const isEditable = useMemo(() => {
        if (readOnly) return false;
        const subDate = entry.submittedAt ? parseISO(entry.submittedAt) : null;
        if (!subDate || !isValid(subDate)) return false;
        return isToday(subDate);
    }, [entry.submittedAt, readOnly]);

    const subDate = entry.submittedAt ? parseISO(entry.submittedAt) : null;

    return (
         <Collapsible asChild open={isOpen} onOpenChange={setIsOpen}>
            <TableBody>
            <TableRow className="h-16">
                <TableCell className="font-medium">
                    <div className="flex flex-col">
                        <span className="font-bold text-primary">{entry.firstName} {entry.lastName}</span>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">{entry.specialty}</span>
                    </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                    <span className="text-sm font-medium">{entry.clinic}</span>
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
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-10 w-10"><MoreHorizontal /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onClick={() => onShowHistory(entry.firstName || '', entry.lastName || '')} className="gap-2 py-3">
                                        <History className="w-4 h-4 text-primary"/> Visits History
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onEdit(entry)} disabled={!isEditable} className="gap-2 py-3">
                                        <Edit className="w-4 h-4 text-primary"/> Edit Report
                                    </DropdownMenuItem>
                                    {!readOnly && (
                                        <>
                                            <DropdownMenuItem className="text-destructive focus:text-destructive gap-2 py-3">
                                                <AlertDialogTrigger className="flex items-center gap-2 w-full">
                                                    <Trash2 className="w-4 h-4"/> Delete Entry
                                                </AlertDialogTrigger>
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this report?</AlertDialogTitle>
                                    <AlertDialogDescription>This action cannot be undone. This visit will be removed from your monthly totals.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDelete(entry.id)} className="bg-destructive text-destructive-foreground">Delete Permanentely</AlertDialogAction>
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
                                <h4 className="flex items-center gap-2 font-bold text-primary text-xs uppercase tracking-widest"><List className="w-3 h-3" /> Call Details</h4>
                                <DetailItem label="Objective" value={entry.callObjective} />
                                <DetailItem label="Coverage Type" value={entry.coverageType} />
                                {entry.clinic && <DetailItem label="Clinic Address" value={entry.clinic} />}
                            </div>
                            <div className="space-y-4">
                                <h4 className="flex items-center gap-2 font-bold text-primary text-xs uppercase tracking-widest"><CircleAlert className="w-3 h-3" /> Sampling</h4>
                                <DetailItem label="Primary Product" value={entry.primaryProduct} />
                                <DetailItem label="Quantity Issued" value={entry.primaryProductQty} />
                                {entry.secondaryProduct && <DetailItem label="Secondary Product" value={entry.secondaryProduct} />}
                            </div>
                            <div className="space-y-4">
                                <h4 className="flex items-center gap-2 font-bold text-primary text-xs uppercase tracking-widest"><History className="w-3 h-3" /> Post-Call Analysis</h4>
                                <DetailItem label="Issues Encountered" value={entry.doctorsIssue} />
                                <DetailItem label="Next Steps / Plan" value={entry.planOfAction} />
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
        if (!doctorName) return;
        setLoading(true);
        try {
            const q = query(
                collection(db, "coverageEntries"),
                where("firstName", "==", doctorName.first),
                where("lastName", "==", doctorName.last),
                orderBy("coverageDate", "desc")
            );
            const snapshot = await getDocs(q);
            const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoverageEntry));
            setHistory(entries);
        } catch (error) {
            console.error("Error fetching doctor history:", error);
        } finally {
            setLoading(false);
        }
    }, [doctorName]);

    useEffect(() => {
        if (isOpen && doctorName) {
            fetchHistory();
        } else {
            setHistory([]);
        }
    }, [isOpen, doctorName, fetchHistory]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 border-none overflow-hidden">
                <DialogHeader className="p-6 bg-muted/20 border-b">
                    <DialogTitle className="text-2xl font-black font-headline">Visits History</DialogTitle>
                    <DialogDescription className="text-lg">
                        Full coverage timeline for <span className="font-bold text-foreground">Dr. {doctorName?.first} {doctorName?.last}</span>
                    </DialogDescription>
                </DialogHeader>
                
                <div className="flex-1 overflow-hidden">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-80 gap-4">
                            <Loader2 className="w-10 h-10 animate-spin text-primary" />
                            <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">Accessing Archives...</p>
                        </div>
                    ) : history.length > 0 ? (
                        <ScrollArea className="h-[60vh] p-6">
                            <div className="space-y-4">
                                {history.map((entry) => (
                                    <Card key={entry.id} className="overflow-hidden border-2 shadow-sm">
                                        <CardHeader className="bg-muted/30 py-3 px-4 flex-row items-center justify-between space-y-0">
                                            <CardTitle className="text-base font-black font-headline text-primary">
                                                {entry.coverageDate ? format(parseISO(entry.coverageDate), "MMMM d, yyyy") : "Date Missing"}
                                            </CardTitle>
                                            <Badge variant="secondary" className="capitalize font-bold border border-primary/20">{entry.coverageType}</Badge>
                                        </CardHeader>
                                        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-3">
                                                <DetailItem label="Objective" value={entry.callObjective} />
                                                <div className="flex gap-4">
                                                    <DetailItem label="Primary Product" value={entry.primaryProduct} />
                                                    <DetailItem label="Qty" value={entry.primaryProductQty} />
                                                </div>
                                            </div>
                                            <div className="space-y-3">
                                                <DetailItem label="Doctor Concerns" value={entry.doctorsIssue} />
                                                <DetailItem label="Agreed Plan" value={entry.planOfAction} />
                                                <div className="pt-2">
                                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Proof of Call</p>
                                                    <div className="flex gap-2">
                                                        {entry.photos?.[0] && <Image src={entry.photos[0]} alt="proof" width={60} height={60} className="rounded-md object-cover border-2" />}
                                                        {entry.signature && <div className="p-1 bg-white border-2 rounded-md shadow-sm"><Image src={entry.signature} alt="sig" width={80} height={40} /></div>}
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </ScrollArea>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                            <History className="w-12 h-12 mb-4 opacity-20" />
                            <p className="text-lg italic">No other historical visits found for this provider.</p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function SubmittedList({ entries, doctors, onDelete, onEdit, readOnly = false }: { 
    entries: CoverageEntry[], 
    doctors: Doctor[], 
    onDelete: (id: string) => void, 
    onEdit: (entry: CoverageEntry) => void, 
    readOnly?: boolean 
}) {
    const [searchQuery, setSearchQuery] = useState("");
    const [historyDoctor, setHistoryDoctor] = useState<{ first: string, last: string } | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("list");
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
    
    const availableMonths = useMemo(() => {
        const monthSet = new Set<string>();
        entries.forEach(entry => {
            const date = entry.coverageDate ? parseISO(entry.coverageDate) : null;
            if (date && isValid(date)) {
                monthSet.add(format(date, 'yyyy-MM'));
            }
        });
        monthSet.add(format(new Date(), 'yyyy-MM'));
        return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
    }, [entries]);

    useEffect(() => {
        const monthDate = parse(selectedMonth, 'yyyy-MM', new Date());
        setSelectedDate(monthDate);
    }, [selectedMonth]);

    const handleShowHistory = (firstName: string, lastName: string) => {
        setHistoryDoctor({ first: firstName, last: lastName });
        setIsHistoryOpen(true);
    };

    const monthRange = useMemo(() => {
        const monthDate = parse(selectedMonth, 'yyyy-MM', new Date());
        return {
            start: startOfMonth(monthDate),
            end: endOfMonth(monthDate)
        };
    }, [selectedMonth]);

    const filteredByMonth = useMemo(() => {
        return entries.filter(e => {
            const date = e.coverageDate ? parseISO(e.coverageDate) : null;
            return date && isValid(date) && isWithinInterval(date, monthRange);
        });
    }, [entries, monthRange]);

    const entryDates = useMemo(() => {
        return filteredByMonth.map(e => {
            const d = e.coverageDate ? parseISO(e.coverageDate) : null;
            return d && isValid(d) ? d : null;
        }).filter((d): d is Date => d !== null);
    }, [filteredByMonth]);

    const filtered = useMemo(() => {
        let res = [...filteredByMonth];
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            res = res.filter(e => `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) || e.clinic?.toLowerCase().includes(q));
        }

        if (activeTab === 'calendar' && selectedDate) {
            res = res.filter(e => {
                const d = e.coverageDate ? parseISO(e.coverageDate) : null;
                return d && isSameDay(d, selectedDate);
            });
        }

        return res;
    }, [filteredByMonth, searchQuery, activeTab, selectedDate]);

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-full sm:w-[200px] h-12 border-2 rounded-xl bg-card shadow-sm font-headline">
                        <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableMonths.map(month => (
                            <SelectItem key={month} value={month}>
                                {format(parse(month, 'yyyy-MM', new Date()), 'MMMM yyyy')}
                            </SelectItem>
                        ))}
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
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
                    <TabsList className="grid grid-cols-2 h-20 p-1 bg-muted/50 rounded-xl border-2 shadow-sm shrink-0">
                        <TabsTrigger value="list" className="rounded-lg h-full px-4 flex items-center justify-center">
                            <LayoutList className="w-16 h-16 stroke-[1.5]" />
                        </TabsTrigger>
                        <TabsTrigger value="calendar" className="rounded-lg h-full px-4 flex items-center justify-center">
                            <CalendarIcon className="w-16 h-16 stroke-[1.5]" />
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsContent value="list" className="mt-0">
                <Card className="shadow-lg border-2 rounded-xl overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50 h-12">
                                <TableHead className="font-bold">Provider</TableHead>
                                <TableHead className="hidden md:table-cell font-bold">Clinic</TableHead>
                                <TableHead className="font-bold">Date</TableHead>
                                <TableHead className="hidden sm:table-cell font-bold text-center">Target</TableHead>
                                <TableHead className="font-bold">Proof</TableHead>
                                <TableHead className="text-right font-bold">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        {filtered.length > 0 ? (
                            filtered.map(e => <EntryRow key={e.id} entry={e} doctors={doctors} onDelete={onDelete} onEdit={onEdit} readOnly={readOnly} onShowHistory={handleShowHistory} />)
                        ) : (
                            <TableBody>
                                <TableRow>
                                    <TableCell colSpan={6} className="h-64 text-center text-muted-foreground text-lg italic">
                                        No matching reports found in the current view.
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        )}
                    </Table>
                </Card>
            </TabsContent>
            
            <TabsContent value="calendar" className="mt-0">
                <div className="flex flex-col xl:flex-row gap-8 items-start">
                    <div className="w-full xl:w-[400px] shrink-0">
                        <Card className="shadow-md border-2 overflow-hidden">
                            <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={setSelectedDate}
                                month={parse(selectedMonth, 'yyyy-MM', new Date())}
                                modifiers={{ 
                                    hasEntry: entryDates,
                                }}
                                modifiersStyles={{
                                    hasEntry: { border: '3px solid hsl(var(--primary))', fontWeight: 'bold' }
                                }}
                                className="w-full p-4 bg-card"
                            />
                        </Card>
                        <div className="mt-4 p-4 rounded-xl bg-primary/5 border-2 border-primary/10">
                            <p className="text-xs font-black text-primary uppercase tracking-widest mb-1">Calendar Guide</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">Dates highlighted with a <span className="text-primary font-bold">green border</span> contain submitted reports. Select a date to view individual details.</p>
                        </div>
                    </div>
                    
                    <div className="flex-1 w-full space-y-6">
                        <div className="bg-muted/30 p-5 rounded-xl border-2">
                             <h3 className="text-2xl font-black font-headline tracking-tight">
                                {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "No date selected"}
                            </h3>
                            <div className="mt-3">
                                <Badge variant="outline" className="h-9 px-4 font-bold border-2 border-primary/20 bg-background/50 flex gap-3 items-center w-fit">
                                    <CheckCheck className="w-4 h-4 text-primary" />
                                    <span className="text-primary text-base">{filtered.length}</span>
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Reports Filed</span>
                                </Badge>
                            </div>
                        </div>

                        <Card className="shadow-lg border-2 rounded-xl overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 hover:bg-muted/50 h-12">
                                        <TableHead className="font-bold">Provider</TableHead>
                                        <TableHead className="hidden md:table-cell font-bold">Clinic</TableHead>
                                        <TableHead className="font-bold">Proof</TableHead>
                                        <TableHead className="text-right font-bold">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                {filtered.length > 0 ? (
                                    filtered.map(e => <EntryRow key={e.id} entry={e} doctors={doctors} onDelete={onDelete} onEdit={onEdit} readOnly={readOnly} onShowHistory={handleShowHistory} />)
                                ) : (
                                    <TableBody>
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-48 text-center text-muted-foreground text-lg italic">
                                                No activity recorded for this date.
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                )}
                            </Table>
                        </Card>
                    </div>
                </div>
            </TabsContent>
        </Tabs>

        <DoctorHistoryDialog 
            doctorName={historyDoctor} 
            isOpen={isHistoryOpen} 
            onOpenChange={setIsHistoryOpen} 
        />
      </div>
    );
}
