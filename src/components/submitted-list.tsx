
"use client"

import type { CoverageEntry } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import Image from "next/image";
import { useState, useMemo } from "react";
import { DateRange } from "react-day-picker";
import { Calendar as CalendarIcon, Download } from "lucide-react";

import { Button } from "./ui/button";
import * as XLSX from 'xlsx';
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "@/lib/utils";
import { Calendar } from "./ui/calendar";

export function SubmittedList({ entries }: { entries: CoverageEntry[] }) {
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    const filteredEntries = useMemo(() => {
        if (!dateRange || !dateRange.from) {
            // Default to showing all entries if no date is selected
            return [...entries].sort((a,b) => parseISO(b.submittedAt).getTime() - parseISO(a.submittedAt).getTime());
        }

        const from = startOfDay(dateRange.from);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);

        return entries
            .filter(entry => isWithinInterval(parseISO(entry.submittedAt), { start: from, end: to }))
            .sort((a, b) => parseISO(b.submittedAt).getTime() - parseISO(a.submittedAt).getTime());

    }, [entries, dateRange]);
    

    const handleDownloadSubmitted = () => {
        if (!dateRange || !dateRange.from) {
            return;
        }

        const dataToExport = filteredEntries.map(entry => {
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
    
        const fileName = `submitted_coverage_${format(dateRange.from, 'yyyy-MM-dd')}_to_${format(dateRange.to || dateRange.from, 'yyyy-MM-dd')}.xlsx`;
        XLSX.writeFile(workbook, fileName);
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
                        <CardTitle className="font-headline">Submitted Coverage</CardTitle>
                        <CardDescription>Filter by date range and download reports.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                         <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    id="date"
                                    variant={"outline"}
                                    className={cn(
                                    "w-[300px] justify-start text-left font-normal",
                                    !dateRange && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>
                                        {format(dateRange.from, "LLL dd, y")} -{" "}
                                        {format(dateRange.to, "LLL dd, y")}
                                        </>
                                    ) : (
                                        format(dateRange.from, "LLL dd, y")
                                    )
                                    ) : (
                                    <span>Pick a date range</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
                        <Button onClick={handleDownloadSubmitted} disabled={!dateRange || !dateRange.from}>
                            <Download className="mr-2" />
                            Download Report
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                 <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Provider</TableHead>
                                <TableHead>Clinic</TableHead>
                                <TableHead>Submitted On</TableHead>
                                <TableHead>Attachments</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredEntries.length > 0 ? (
                                filteredEntries.map((entry) => (
                                    <TableRow key={entry.id}>
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
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                       No submitted entries found for the selected date range.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
