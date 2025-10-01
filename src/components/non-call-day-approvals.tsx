
"use client"

import type { NonCallDay } from "@/lib/types";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Filter } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { USER_DATA_MAP } from "@/lib/user-data";

type NonCallDayApprovalsProps = {
    nonCallDays: NonCallDay[];
    onUpdateStatus: (id: string, status: 'approved' | 'rejected') => void;
    userMap: Record<string, { code: string; firstName: string; lastName: string }>;
};

const dayTypeLabels: Record<NonCallDay['dayType'], string> = {
    'wholeday': 'Whole Day',
    'halfday-am': 'Half Day (AM)',
    'halfday-pm': 'Half Day (PM)',
};

export function NonCallDayApprovals({ nonCallDays, onUpdateStatus, userMap }: NonCallDayApprovalsProps) {
    const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

    const filteredDays = useMemo(() => {
        return nonCallDays.filter(day => day.status === activeTab);
    }, [nonCallDays, activeTab]);

    const getUserName = (userId: string) => {
        const user = userMap[userId];
        return user ? `${user.firstName} ${user.lastName}` : `User ID: ${userId.substring(0,6)}...`;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Non-Call Day Requests</CardTitle>
                <CardDescription>Review, approve, or reject non-call day requests submitted by users.</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="pending">Pending</TabsTrigger>
                        <TabsTrigger value="approved">Approved</TabsTrigger>
                        <TabsTrigger value="rejected">Rejected</TabsTrigger>
                    </TabsList>
                    <TabsContent value={activeTab} className="mt-4">
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Remarks</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredDays.length > 0 ? (
                                        filteredDays.map((day) => (
                                            <TableRow key={day.id}>
                                                <TableCell className="font-medium">{getUserName(day.userId)}</TableCell>
                                                <TableCell>{format(parseISO(day.date), "PPP")}</TableCell>
                                                <TableCell>{dayTypeLabels[day.dayType]}</TableCell>
                                                <TableCell>{day.reason}</TableCell>
                                                <TableCell>{day.remarks || 'N/A'}</TableCell>
                                                <TableCell className="text-right">
                                                    {day.status === 'pending' ? (
                                                        <div className="flex justify-end gap-2">
                                                            <Button size="icon" variant="outline" className="text-primary" onClick={() => onUpdateStatus(day.id, 'approved')}>
                                                                <Check />
                                                            </Button>
                                                            <Button size="icon" variant="destructive" onClick={() => onUpdateStatus(day.id, 'rejected')}>
                                                                <X />
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <Badge variant={day.status === 'approved' ? 'secondary' : 'destructive'} className="capitalize">{day.status}</Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center">
                                                No {activeTab} requests found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}

