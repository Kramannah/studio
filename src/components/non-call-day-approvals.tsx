"use client"

import type { NonCallDay, UserProfile } from "@/lib/types";
import { useMemo, useState } from "react";
import { format, parseISO, isValid } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type NonCallDayApprovalsProps = {
    nonCallDays: NonCallDay[];
    onUpdateStatus: (id: string, status: 'approved' | 'rejected') => void;
    userMap: Record<string, { code: string; firstName: string; lastName: string; email: string }>;
    profiles?: Record<string, UserProfile>;
    isSuperAdmin?: boolean;
};

const dayTypeLabels: Record<NonCallDay['dayType'], string> = {
    'wholeday': 'Whole Day',
    'halfday-am': 'Half Day (AM)',
    'halfday-pm': 'Half Day (PM)',
};

const safeParseDate = (date: any): Date | null => {
    if (!date) return null;
    if (typeof date === 'string') return parseISO(date);
    if (typeof date.toDate === 'function') return date.toDate();
    if (date instanceof Date) return date;
    return null;
}

export function NonCallDayApprovals({ nonCallDays, onUpdateStatus, userMap }: NonCallDayApprovalsProps) {
    const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

    const filteredDays = useMemo(() => {
        return nonCallDays.filter(day => day.status === activeTab);
    }, [nonCallDays, activeTab]);

    const getUserName = (userId: string) => {
        const user = userMap[userId];
        return user ? `${user.firstName} ${user.lastName}` : (userId ? `UID: ${userId.substring(0,8)}` : "Unknown User");
    }

    return (
        <div className="space-y-6">
            <Card className="border-2 shadow-sm">
                <CardHeader>
                    <CardTitle className="font-headline">Non-Call Day Requests</CardTitle>
                    <CardDescription>Review, approve, or reject non-call day requests submitted by users.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
                        <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1 rounded-xl">
                            <TabsTrigger value="pending" className="rounded-lg font-headline">Pending</TabsTrigger>
                            <TabsTrigger value="approved" className="rounded-lg font-headline">Approved</TabsTrigger>
                            <TabsTrigger value="rejected" className="rounded-lg font-headline">Rejected</TabsTrigger>
                        </TabsList>
                        <TabsContent value={activeTab} className="mt-4">
                            <div className="border-2 rounded-xl overflow-hidden shadow-inner bg-background">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow className="h-12">
                                            <TableHead className="font-bold">User</TableHead>
                                            <TableHead className="font-bold">Date</TableHead>
                                            <TableHead className="font-bold">Type</TableHead>
                                            <TableHead className="font-bold">Reason</TableHead>
                                            <TableHead className="font-bold">Remarks</TableHead>
                                            <TableHead className="text-right font-bold pr-6">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredDays.length > 0 ? (
                                            filteredDays.map((day) => {
                                                const nonCallDate = safeParseDate(day.date);
                                                return (
                                                <TableRow key={day.id} className="h-auto border-b last:border-0 hover:bg-muted/10 transition-colors">
                                                    <TableCell className="font-bold text-sm pl-4 whitespace-nowrap">{getUserName(day.userId)}</TableCell>
                                                    <TableCell className="text-xs font-medium text-muted-foreground whitespace-nowrap">{nonCallDate && isValid(nonCallDate) ? format(nonCallDate, "MMM d, yyyy") : "Invalid Date"}</TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        <Badge variant="outline" className="text-[10px] font-bold uppercase">{dayTypeLabels[day.dayType]}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-sm font-bold text-primary whitespace-nowrap">{day.reason}</TableCell>
                                                    <TableCell className="min-w-[200px] max-w-[400px] py-4 text-xs text-muted-foreground italic leading-relaxed whitespace-normal break-words">
                                                        {day.remarks || '—'}
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6 whitespace-nowrap">
                                                        {day.status === 'pending' ? (
                                                            <div className="flex justify-end gap-2">
                                                                <Button size="icon" variant="outline" className="h-8 w-8 text-primary border-2 rounded-lg" onClick={() => onUpdateStatus(day.id, 'approved')}>
                                                                    <Check className="w-4 h-4" />
                                                                </Button>
                                                                <Button size="icon" variant="outline" className="h-8 w-8 text-destructive border-2 rounded-lg hover:bg-destructive hover:text-white" onClick={() => onUpdateStatus(day.id, 'rejected')}>
                                                                    <X className="w-4 h-4" />
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <Badge variant={day.status === 'approved' ? 'default' : 'destructive'} className="capitalize px-3">
                                                                {day.status}
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            )})
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">
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
        </div>
    );
}