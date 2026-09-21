"use client"

import type { NonCallDay, UserProfile } from "@/lib/types";
import { useMemo, useState } from "react";
import { format, parseISO, isValid } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, MessageSquare, User, CalendarDays } from "lucide-react";
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
            <Card className="border-2 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="bg-muted/30 border-b">
                    <div className="flex items-center gap-2">
                        <CalendarDays className="w-5 h-5 text-primary" />
                        <CardTitle className="font-headline text-xl">Leave & Non-Call Activity</CardTitle>
                    </div>
                    <CardDescription>Process requests for vacation, sick leave, and company activities.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="p-4 bg-muted/10 border-b">
                        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
                            <TabsList className="grid w-full sm:w-[400px] grid-cols-3 bg-muted/50 p-1 rounded-xl">
                                <TabsTrigger value="pending" className="rounded-lg font-headline">Pending</TabsTrigger>
                                <TabsTrigger value="approved" className="rounded-lg font-headline">Approved</TabsTrigger>
                                <TabsTrigger value="rejected" className="rounded-lg font-headline">Rejected</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow className="h-12">
                                    <TableHead className="font-bold pl-6">Representative</TableHead>
                                    <TableHead className="font-bold">Scheduled Date</TableHead>
                                    <TableHead className="font-bold">Leave Type</TableHead>
                                    <TableHead className="font-bold">Reason</TableHead>
                                    <TableHead className="font-bold">Remarks</TableHead>
                                    <TableHead className="text-right font-bold pr-6">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredDays.length > 0 ? (
                                    filteredDays.map((day) => {
                                        const nonCallDate = safeParseDate(day.date);
                                        return (
                                        <TableRow key={day.id} className="h-20 border-b last:border-0 hover:bg-muted/10 transition-colors">
                                            <TableCell className="pl-6">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm">{getUserName(day.userId)}</span>
                                                    <span className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">{userMap[day.userId]?.code || "PMR"}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs font-bold text-foreground">
                                                {nonCallDate && isValid(nonCallDate) ? format(nonCallDate, "MMM d, yyyy") : "Invalid Date"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="text-[10px] font-black uppercase bg-primary/10 text-primary border-primary/20">
                                                    {dayTypeLabels[day.dayType]}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-bold text-sm text-primary">
                                                {day.reason}
                                            </TableCell>
                                            <TableCell className="min-w-[200px] max-w-[350px]">
                                                <div className="flex items-start gap-2">
                                                    <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                                    <p className="text-[11px] text-muted-foreground italic leading-relaxed break-words">
                                                        {day.remarks || 'No additional remarks provided.'}
                                                    </p>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                {day.status === 'pending' ? (
                                                    <div className="flex justify-end gap-2">
                                                        <Button 
                                                            size="icon" 
                                                            variant="outline" 
                                                            className="h-9 w-9 text-primary border-2 rounded-xl hover:bg-primary hover:text-white transition-all shadow-sm" 
                                                            onClick={() => onUpdateStatus(day.id, 'approved')}
                                                            title="Approve Request"
                                                        >
                                                            <Check className="w-4 h-4" />
                                                        </Button>
                                                        <Button 
                                                            size="icon" 
                                                            variant="outline" 
                                                            className="h-9 w-9 text-destructive border-2 rounded-xl hover:bg-destructive hover:text-white transition-all shadow-sm" 
                                                            onClick={() => onUpdateStatus(day.id, 'rejected')}
                                                            title="Reject Request"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Badge variant={day.status === 'approved' ? 'default' : 'destructive'} className="capitalize px-4 py-1 h-8 font-headline">
                                                        {day.status}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )})
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-48 text-center">
                                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                                <User className="w-8 h-8 opacity-20" />
                                                <p className="italic text-sm">No {activeTab} leave requests found.</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}