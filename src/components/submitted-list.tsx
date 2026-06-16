
"use client"

import type { CoverageEntry, Doctor, NonCallDay } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO, isValid, isToday } from "date-fns";
import Image from "next/image";
import React, { useState, useMemo } from "react";
import { Download, MoreHorizontal, Trash2, ChevronDown, ChevronUp, Edit, Search, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import * as XLSX from 'xlsx';

const DetailField = ({ label, value }: { label: string, value?: string | number | null }) => (
    <div className="space-y-1">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
    </div>
)

const EntryRow = ({ entry, doctors, onDelete, onEdit, readOnly }: { entry: CoverageEntry, doctors: Doctor[], onDelete: (id: string) => void, onEdit: (entry: CoverageEntry) => void, readOnly?: boolean }) => {
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
                        {entry.photos?.[0] && <div className="h-8 w-10 bg-muted rounded overflow-hidden relative border"><Image src={entry.photos[0]} alt="proof" fill className="object-cover" /></div>}
                        {entry.signature && <div className="h-8 w-14 bg-white rounded border flex items-center justify-center p-0.5"><Image src={entry.signature} alt="sig" width={40} height={20} className="object-contain" /></div>}
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

    const filtered = useMemo(() => (entries || []).filter(e => {
        const q = (searchQuery || "").toLowerCase().trim();
        return !q || `${e.firstName} ${e.lastName} ${e.clinic} ${e.specialty}`.toLowerCase().includes(q);
    }), [entries, searchQuery]);

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

    if (entries.length === 0) return <Card className="p-20 text-center"><p className="text-muted-foreground italic">No reports found.</p></Card>;

    return (
      <div className="space-y-4 animate-in fade-in duration-500 w-full">
        <Card className="p-4 border-2">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative flex-1 w-full max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search records..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 h-10 border-2" />
                </div>
                <Button variant="outline" size="sm" onClick={handleExportExcel} className="font-headline h-10 gap-2 border-2"><Download size={16} /> Export Excel</Button>
            </div>
        </Card>

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
                    {filtered.length > 0 ? (filtered.map(e => <EntryRow key={e.id} entry={e} doctors={doctors} onDelete={onDelete} onEdit={onEdit} readOnly={readOnly} />)) : (
                        <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No matches found.</TableCell></TableRow>
                    )}
                </TableBody>
            </Table>
        </Card>
      </div>
    );
}
