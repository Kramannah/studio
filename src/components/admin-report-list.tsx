
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { useState, useMemo } from "react";
import { Input } from "./ui/input";
import { format, parseISO } from "date-fns";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { Badge } from "./ui/badge";

type AdminReportListProps = {
  entries: CoverageEntry[];
  onDelete: (id: string) => void;
}

export function AdminReportList({ entries, onDelete }: AdminReportListProps) {
  const [filter, setFilter] = useState('');

  const filteredEntries = useMemo(() => {
    return entries.filter(entry =>
      `${entry.firstName} ${entry.lastName}`.toLowerCase().includes(filter.toLowerCase()) ||
      entry.clinic?.toLowerCase().includes(filter.toLowerCase()) ||
      entry.userId.toLowerCase().includes(filter.toLowerCase()) // Assuming email is not directly on entry
    );
  }, [entries, filter]);
  
  if (entries.length === 0) {
    return (
        <Card>
            <CardContent className="p-6 text-center">
                <p className="text-muted-foreground">No reports have been submitted by any user yet.</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="font-headline">All User Reports</CardTitle>
            <CardDescription>A complete log of all submitted coverage reports from all users.</CardDescription>
          </div>
        </div>
        <div className="mt-4">
          <Input 
            placeholder="Filter by doctor, clinic, or user ID..."
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
                        <TableHead>User ID</TableHead>
                        <TableHead>Doctor</TableHead>
                        <TableHead>Clinic</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Submitted On</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredEntries.length > 0 ? (
                        filteredEntries.map((entry) => (
                            <TableRow key={entry.id}>
                                <TableCell>
                                    <Badge variant="secondary" className="font-mono text-xs">{entry.userId.substring(0, 10)}...</Badge>
                                </TableCell>
                                <TableCell className="font-medium">{entry.firstName} {entry.lastName}</TableCell>
                                <TableCell>{entry.clinic}</TableCell>
                                <TableCell className="capitalize">{entry.coverageType}</TableCell>
                                <TableCell>{typeof entry.submittedAt === 'string' ? format(parseISO(entry.submittedAt), "PPP") : 'Invalid Date'}</TableCell>
                                <TableCell className="text-right">
                                  <AlertDialog>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon">
                                          <MoreHorizontal />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <AlertDialogTrigger asChild>
                                          <DropdownMenuItem className="text-destructive focus:text-destructive">
                                            <Trash2 className="mr-2" /> Delete
                                          </DropdownMenuItem>
                                        </AlertDialogTrigger>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This action cannot be undone. This will permanently delete this report.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => onDelete(entry.id)}>Continue</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center">
                                No reports match your filter.
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
