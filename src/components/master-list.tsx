"use client"

import type { CoverageEntry } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useState, useMemo } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { ArrowUpDown } from "lucide-react";
import { format, parseISO } from "date-fns";

type SortKey = keyof CoverageEntry | '';
type SortDirection = 'asc' | 'desc';

export function MasterList({ entries }: { entries: CoverageEntry[] }) {
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('submittedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedAndFilteredEntries = useMemo(() => {
    let result = entries.filter(entry =>
      `${entry.firstName} ${entry.lastName}`.toLowerCase().includes(filter.toLowerCase()) ||
      entry.clinic.toLowerCase().includes(filter.toLowerCase()) ||
      entry.specialty.toLowerCase().includes(filter.toLowerCase())
    );

    if (sortKey) {
      result.sort((a, b) => {
        const valA = a[sortKey];
        const valB = b[sortKey];
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [entries, filter, sortKey, sortDirection]);

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">No synced entries yet. Saved entries will appear here after synchronization.</p>
        </CardContent>
      </Card>
    );
  }

  const SortableHeader = ({ tKey, label }: { tKey: SortKey, label: string }) => (
    <TableHead>
        <Button variant="ghost" onClick={() => handleSort(tKey)}>
            {label}
            <ArrowUpDown className="w-4 h-4 ml-2" />
        </Button>
    </TableHead>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Submitted Coverage</CardTitle>
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
                        <SortableHeader tKey="lastName" label="Provider" />
                        <SortableHeader tKey="specialty" label="Specialty" />
                        <SortableHeader tKey="clinic" label="Clinic" />
                        <SortableHeader tKey="coverageDate" label="Coverage Date" />
                        <SortableHeader tKey="coverageType" label="Type" />
                        <SortableHeader tKey="submittedAt" label="Submitted" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedAndFilteredEntries.length > 0 ? (
                        sortedAndFilteredEntries.map((entry) => (
                            <TableRow key={entry.id}>
                                <TableCell className="font-medium">{entry.firstName} {entry.lastName}</TableCell>
                                <TableCell>{entry.specialty}</TableCell>
                                <TableCell>{entry.clinic}</TableCell>
                                <TableCell>{format(parseISO(entry.coverageDate), 'MMM d, yyyy')}</TableCell>
                                <TableCell className="capitalize">{entry.coverageType}</TableCell>
                                <TableCell>{format(parseISO(entry.submittedAt), 'MMM d, yyyy HH:mm')}</TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center">
                                No results found.
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
