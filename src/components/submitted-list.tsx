
"use client"

import type { CoverageEntry, Doctor } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isValid, isToday, set, startOfDay, isBefore } from "date-fns";
import Image from "next/image";
import React, { useState, useMemo, useCallback } from "react";
import { Download, MoreHorizontal, Trash2, ChevronDown, ChevronUp, Edit, Search, CircleAlert, History, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { isSyncWindowOpen } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ScrollArea } from "./ui/scroll-area";

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
        const endOfEditWindow = set(startOfDay(new Date()), { hours: 23 }); 
        return isToday(subDate) && isBefore(new Date(), endOfEditWindow);
    }, [entry.submittedAt, readOnly]);

    const subDate = entry.submittedAt ? parseISO(entry.submittedAt) : null;

    return (
         <Collapsible asChild open={isOpen} onOpenChange={setIsOpen}>
            <TableBody>
            <TableRow>
                <TableCell className="font-medium">
                    <div className="flex flex-col">
                        <span>{entry.firstName} {entry.lastName}</span>
                        <span className="text-xs text-muted-foreground">{entry.specialty}</span>
                    </div>
                </TableCell>
                <TableCell>{entry.clinic}</TableCell>
                <TableCell>{subDate && isValid(subDate) ? format(subDate, "PPP") : 'Invalid Date'}</TableCell>
                <TableCell>{doctor?.frequency || 'N/A'}</TableCell>
                <TableCell>
                    <div className="flex items-center gap-2">
                        {entry.photos?.[0] && <Image src={entry.photos[0]} alt="proof" width={32} height={32} className="rounded-full object-cover border" />}
                        {entry.signature && <div className="p-1 bg-white border rounded"><Image src={entry.signature} alt="sig" width={32} height={16} /></div>}
                    </div>
                </TableCell>
                <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                        <AlertDialog>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => onShowHistory(entry.firstName || '', entry.lastName || '')}>
                                        <History className="mr-2 h-4 w-4"/> Visits History
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onEdit(entry)} disabled={!isEditable}>
                                        <Edit className="mr-2 h-4 w-4"/> Edit
                                    </DropdownMenuItem>
                                    {!readOnly && <AlertDialogTrigger asChild><DropdownMenuItem className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/> Delete</DropdownMenuItem></AlertDialogTrigger>}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Delete entry?</AlertDialogTitle></AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDelete(entry.id)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <CollapsibleTrigger asChild><Button variant="ghost" size="icon">{isOpen ? <ChevronUp /> : <ChevronDown />}</Button></CollapsibleTrigger>
                    </div>
                </TableCell>
            </TableRow>
            <CollapsibleContent asChild>
                <TableRow>
                    <TableCell colSpan={6} className="p-0">
                        <div className="p-6 bg-muted/30 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-4">
                                <h4 className="font-bold text-primary">Details</h4>
                                <DetailItem label="Objective" value={entry.callObjective} />
                                <DetailItem label="Type" value={entry.coverageType} />
                            </div>
                            <div className="space-y-4">
                                <h4 className="font-bold text-primary">Products</h4>
                                <DetailItem label="Primary" value={entry.primaryProduct} />
                                <DetailItem label="Qty" value={entry.primaryProductQty} />
                            </div>
                            <div className="space-y-4">
                                <h4 className="font-bold text-primary">Analysis</h4>
                                <DetailItem label="Issues" value={entry.doctorsIssue} />
                                <DetailItem label="Action" value={entry.planOfAction} />
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

    React.useEffect(() => {
        if (isOpen && doctorName) {
            fetchHistory();
        } else {
            setHistory([]);
        }
    }, [isOpen, doctorName, fetchHistory]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Visits History</DialogTitle>
                    <DialogDescription>
                        Full coverage timeline for Dr. {doctorName?.first} {doctorName?.last}
                    </DialogDescription>
                </DialogHeader>
                
                <div className="flex-1 overflow-hidden mt-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-4">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p className="text-muted-foreground">Fetching past visits...</p>
                        </div>
                    ) : history.length > 0 ? (
                        <ScrollArea className="h-[60vh] pr-4">
                            <div className="space-y-4">
                                {history.map((entry) => (
                                    <Card key={entry.id} className="overflow-hidden">
                                        <CardHeader className="bg-muted/30 py-3">
                                            <div className="flex justify-between items-center">
                                                <CardTitle className="text-sm font-headline">
                                                    {entry.coverageDate ? format(parseISO(entry.coverageDate), "PPP") : "N/A"}
                                                </CardTitle>
                                                <Badge variant="outline" className="capitalize">{entry.coverageType}</Badge>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <DetailItem label="Objective" value={entry.callObjective} />
                                                <DetailItem label="Primary Product" value={entry.primaryProduct} />
                                                <DetailItem label="Secondary Product" value={entry.secondaryProduct} />
                                            </div>
                                            <div className="space-y-2">
                                                <DetailItem label="Issues" value={entry.doctorsIssue} />
                                                <DetailItem label="Next Steps" value={entry.planOfAction} />
                                                <div className="pt-2">
                                                    <p className="text-xs font-semibold text-muted-foreground mb-1">Proof</p>
                                                    <div className="flex gap-2">
                                                        {entry.photos?.[0] && <Image src={entry.photos[0]} alt="proof" width={48} height={48} className="rounded object-cover border" />}
                                                        {entry.signature && <div className="p-1 bg-white border rounded"><Image src={entry.signature} alt="sig" width={48} height={24} /></div>}
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </ScrollArea>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            No other historical visits found for this provider.
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
    
    const isNight = isSyncWindowOpen();

    const handleShowHistory = (firstName: string, lastName: string) => {
        setHistoryDoctor({ first: firstName, last: lastName });
        setIsHistoryOpen(true);
    };

    const filtered = useMemo(() => {
        let res = [...entries];
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            res = res.filter(e => `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) || e.clinic?.toLowerCase().includes(q));
        }
        return res;
    }, [entries, searchQuery]);

    return (
      <div className="space-y-4">
        {!isNight && (
            <Alert>
                <CircleAlert className="h-4 w-4" />
                <AlertTitle>Working Mode</AlertTitle>
                <AlertDescription>Showing today's reports only. Full weekly history will be visible after 8:00 PM.</AlertDescription>
            </Alert>
        )}
        <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
                <div>
                    <CardTitle className="font-headline">Submitted Reports</CardTitle>
                    <CardDescription>{isNight ? "Weekly History" : "Today's Work"}</CardDescription>
                </div>
                <div className="relative w-full md:w-[300px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search MD or Clinic..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Provider</TableHead>
                                <TableHead>Clinic</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Freq</TableHead>
                                <TableHead>Proof</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        {filtered.length > 0 ? (
                            filtered.map(e => <EntryRow key={e.id} entry={e} doctors={doctors} onDelete={onDelete} onEdit={onEdit} readOnly={readOnly} onShowHistory={handleShowHistory} />)
                        ) : (
                            <TableBody><TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No reports found for this period.</TableCell></TableRow></TableBody>
                        )}
                    </Table>
                </div>
            </CardContent>
        </Card>

        <DoctorHistoryDialog 
            doctorName={historyDoctor} 
            isOpen={isHistoryOpen} 
            onOpenChange={setIsHistoryOpen} 
        />
      </div>
    );
}
