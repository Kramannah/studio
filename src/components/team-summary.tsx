
"use client";

import type { CoverageEntry, TimeLog } from "@/lib/types";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO, differenceInMinutes, isValid } from "date-fns";
import { LogIn, LogOut, Users, FileText } from "lucide-react";
import { Badge } from "./ui/badge";

interface TeamSummaryProps {
    teamData: {
        entries: CoverageEntry[];
        timeLogs: TimeLog[];
    };
    userMap: Record<string, { code: string; firstName: string; lastName: string }>;
}

export function TeamSummary({ teamData, userMap }: TeamSummaryProps) {
    const { entries, timeLogs } = teamData;

    const getUserName = (userId: string) => {
        const user = userMap[userId];
        return user ? `${user.firstName} ${user.lastName}` : `User ID: ${userId.substring(0, 6)}...`;
    };

    const sortedEntries = useMemo(() => {
        return [...entries].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    }, [entries]);

    const sortedTimeLogs = useMemo(() => {
        return [...timeLogs].sort((a, b) => new Date(b.timeIn).getTime() - new Date(a.timeIn).getTime());
    }, [timeLogs]);

    if (entries.length === 0 && timeLogs.length === 0) {
        return (
            <Card>
                <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground">No data available for this team in the selected period.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline flex items-center gap-2"><Users /> Team Overview</CardTitle>
                    <CardDescription>A summary of the latest activities for the selected manager's team.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="p-4 border rounded-lg">
                        <h3 className="font-semibold">Total Coverage Reports</h3>
                        <p className="text-3xl font-bold">{entries.length}</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                        <h3 className="font-semibold">Total Time Logs</h3>
                        <p className="text-3xl font-bold">{timeLogs.length}</p>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2"><FileText /> Recent Coverage Reports</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="border rounded-md max-h-96 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Doctor</TableHead>
                                        <TableHead>Submitted On</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedEntries.slice(0, 10).map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell><Badge variant="secondary">{getUserName(entry.userId)}</Badge></TableCell>
                                            <TableCell className="font-medium">{entry.firstName} {entry.lastName}</TableCell>
                                            <TableCell>{format(parseISO(entry.submittedAt), "Pp")}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline">Recent Time Logs</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="border rounded-md max-h-96 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead><LogIn className="inline-block mr-1" />Time In</TableHead>
                                        <TableHead><LogOut className="inline-block mr-1" />Time Out</TableHead>
                                        <TableHead>Duration</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedTimeLogs.slice(0, 10).map((log) => {
                                        const timeIn = parseISO(log.timeIn);
                                        const timeOut = log.timeOut ? parseISO(log.timeOut) : null;
                                        const duration = isValid(timeIn) && timeOut && isValid(timeOut) ? `${differenceInMinutes(timeOut, timeIn)} mins` : 'Active';
                                        return (
                                            <TableRow key={log.id}>
                                                <TableCell><Badge variant="secondary">{getUserName(log.userId)}</Badge></TableCell>
                                                <TableCell>{isValid(timeIn) ? format(timeIn, "p") : 'N/A'}</TableCell>
                                                <TableCell>{timeOut && isValid(timeOut) ? format(timeOut, "p") : 'N/A'}</TableCell>
                                                <TableCell>{duration}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

    