
"use client"

import type { CoverageEntry } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isSameDay } from "date-fns";
import Image from "next/image";
import { useState, useMemo } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Download } from "lucide-react";
import * as XLSX from 'xlsx';

export function SubmittedList({ entries }: { entries: CoverageEntry[] }) {
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

    const selectedDayEntries = useMemo(() => {
        if (!selectedDate) return [];
        return entries.filter(entry => isSameDay(parseISO(entry.submittedAt), selectedDate));
    }, [entries, selectedDate]);
    
    const submittedDays = useMemo(() => {
        return Object.keys(entriesByDate).map(dateStr => parseISO(dateStr));
    }, [entriesByDate]);

    const handleDownloadSubmitted = () => {
        const dataToExport = entries.map(entry => {
            const proofs = [];
            if (entry.photos && entry.photos.length > 0) proofs.push("Photo");
            if (entry.signature) proofs.push("Signature");
            
            return {
                'First Name': entry.firstName,
                'Last Name': entry.lastName,
                'Specialty': entry.specialty,
                'Clinic': entry.clinic,
                'Coverage Type': entry.coverageType,
                'Coverage Date': format(parseISO(entry.coverageDate), 'yyyy-MM-dd'),
                'Submitted At': format(parseISO(entry.submittedAt), 'yyyy-MM-dd HH:mm:ss'),
                'Proof of Coverage': proofs.length > 0 ? proofs.join(', ') : 'None',
            }
        });
    
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Submitted Coverage');

        worksheet['!cols'] = [
            { wch: 20 }, // First Name
            { wch: 20 }, // Last Name
            { wch: 25 }, // Specialty
            { wch: 40 }, // Clinic
            { wch: 15 }, // Coverage Type
            { wch: 15 }, // Coverage Date
            { wch: 20 }, // Submitted At
            { wch: 25 }, // Proof of Coverage
        ];
    
        XLSX.writeFile(workbook, 'submitted_coverage.xlsx');
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
                        <CardTitle className="font-headline">Submitted Coverage Calendar</CardTitle>
                        <CardDescription>Select a date to see the coverage details for that day.</CardDescription>
                    </div>
                    <Button onClick={handleDownloadSubmitted} variant="outline">
                        <Download className="mr-2" />
                        Download All
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <div>
                     <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        modifiers={{ submitted: submittedDays }}
                        modifiersStyles={{
                            submitted: { 
                                border: '2px solid hsl(var(--primary))',
                                borderRadius: 'var(--radius)',
                            },
                        }}
                        components={{
                            DayContent: ({ date }) => {
                                const dateString = format(date, 'yyyy-MM-dd');
                                const count = entriesByDate[dateString]?.length;
                                return (
                                    <div className="relative flex items-center justify-center w-full h-full">
                                        {date.getDate()}
                                        {count && (
                                            <Badge variant="secondary" className="absolute -top-1 -right-1 h-5 w-5 justify-center p-0">{count}</Badge>
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
                        Coverage for: {selectedDate ? format(selectedDate, "PPP") : "No date selected"}
                    </h3>
                     <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Provider</TableHead>
                                    <TableHead>Clinic</TableHead>
                                    <TableHead>Attachments</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selectedDayEntries.length > 0 ? (
                                    selectedDayEntries.map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <span>{entry.firstName} {entry.lastName}</span>
                                                    <span className="text-xs text-muted-foreground">{entry.specialty}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{entry.clinic}</TableCell>
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
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">
                                            {selectedDate ? "No coverage for this date." : "Select a date to view entries."}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
