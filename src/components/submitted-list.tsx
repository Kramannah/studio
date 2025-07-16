
"use client"

import type { CoverageEntry } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO } from "date-fns";
import Image from "next/image";
import { useState, useMemo } from "react";
import { Input } from "./ui/input";

export function SubmittedList({ entries }: { entries: CoverageEntry[] }) {
    const [filter, setFilter] = useState('');

    const filteredEntries = useMemo(() => {
        return entries
            .filter(entry =>
                `${entry.firstName} ${entry.lastName}`.toLowerCase().includes(filter.toLowerCase()) ||
                entry.clinic.toLowerCase().includes(filter.toLowerCase()) ||
                entry.specialty.toLowerCase().includes(filter.toLowerCase())
            )
            .sort((a, b) => parseISO(b.submittedAt).getTime() - parseISO(a.submittedAt).getTime());
    }, [entries, filter]);

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
                <CardTitle className="font-headline">Submitted Coverage</CardTitle>
                <CardDescription>A log of all your synced coverage entries.</CardDescription>
                <div className="mt-4">
                    <Input 
                        placeholder="Filter by name, clinic, or specialty..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="max-w-sm"
                    />
                </div>
            </CardHeader>
            <CardContent>
                <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Provider</TableHead>
                                <TableHead>Specialty</TableHead>
                                <TableHead>Clinic</TableHead>
                                <TableHead>Coverage Date</TableHead>
                                <TableHead>Submitted At</TableHead>
                                <TableHead>Attachments</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredEntries.length > 0 ? (
                                filteredEntries.map((entry) => (
                                    <TableRow key={entry.id}>
                                        <TableCell className="font-medium">{entry.firstName} {entry.lastName}</TableCell>
                                        <TableCell>{entry.specialty}</TableCell>
                                        <TableCell>{entry.clinic}</TableCell>
                                        <TableCell>{format(parseISO(entry.coverageDate), "PPP")}</TableCell>
                                        <TableCell>{format(parseISO(entry.submittedAt), "Pp")}</TableCell>
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
                                    <TableCell colSpan={6} className="h-24 text-center">
                                        No entries match your filter.
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
