"use client"

import type { NonCallDay, UserProfile } from "@/lib/types";
import { useMemo, useState } from "react";
import { format, parseISO, isValid } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Mail, BellRing, ExternalLink } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

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

export function NonCallDayApprovals({ nonCallDays, onUpdateStatus, userMap, profiles = {}, isSuperAdmin = false }: NonCallDayApprovalsProps) {
    const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
    const { toast } = useToast();

    const filteredDays = useMemo(() => {
        return nonCallDays.filter(day => day.status === activeTab);
    }, [nonCallDays, activeTab]);

    const getUserName = (userId: string) => {
        const user = userMap[userId];
        return user ? `${user.firstName} ${user.lastName}` : (userId ? `UID: ${userId.substring(0,8)}` : "Unknown User");
    }

    const managerNudgeList = useMemo(() => {
        if (!isSuperAdmin || activeTab !== 'pending') return [];

        const pending = nonCallDays.filter(d => d.status === 'pending');
        const grouped = new Map<string, { name: string; email: string; pmrs: string[]; count: number }>();

        pending.forEach(day => {
            const pmrProfile = profiles[day.userId];
            const managerId = pmrProfile?.managerId;
            
            if (managerId && managerId !== 'none') {
                const managerProfile = profiles[managerId];
                if (!grouped.has(managerId)) {
                    grouped.set(managerId, {
                        name: managerProfile ? `${managerProfile.firstName} ${managerProfile.lastName}` : "Assigned Manager",
                        email: (managerProfile?.email || "").trim(),
                        pmrs: [],
                        count: 0
                    });
                }
                const data = grouped.get(managerId)!;
                const pmrName = pmrProfile ? `${pmrProfile.firstName} ${pmrProfile.lastName}` : "Unknown PMR";
                if (!data.pmrs.includes(pmrName)) data.pmrs.push(pmrName);
                data.count++;
            }
        });

        return Array.from(grouped.entries()).map(([id, data]) => ({ id, ...data }));
    }, [nonCallDays, profiles, isSuperAdmin, activeTab]);

    const handleSendReminder = (manager: { id: string; name: string; email: string; pmrs: string[]; count: number }) => {
        if (!manager.email) {
            toast({
                variant: "destructive",
                title: "Missing Email",
                description: `Please set a Technical Email for ${manager.name} in the Accounts tab first.`
            });
            return;
        }

        const subject = `URGENT: ${manager.count} Pending Non-Call Day Approvals`;
        const body = `Hi ${manager.name},\n\nYou have ${manager.count} pending Non-Call Day requests from your territory team that require your review in the SFE Dashboard.\n\nAffected Representatives:\n${manager.pmrs.map(name => `- ${name}`).join('\n')}\n\nPlease log in to take action.\n\nBest regards,\nAdministration Team`;
        
        const mailtoLink = `mailto:${manager.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        
        window.location.href = mailtoLink;
        
        toast({ 
            title: "Email Client Opened", 
            description: `Sent reminder request for ${manager.name}.` 
        });
    };

    return (
        <div className="space-y-6">
            {isSuperAdmin && managerNudgeList.length > 0 && (
                <Card className="border-2 border-primary/20 bg-primary/5 shadow-md animate-in fade-in slide-in-from-top-4 duration-500">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg font-black font-headline flex items-center gap-2 text-primary">
                            <BellRing className="w-5 h-5" /> District Notification Hub
                        </CardTitle>
                        <CardDescription>Managers with outstanding approval requests. This will open your default email app to send a reminder.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {managerNudgeList.map(m => (
                                <div key={m.id} className="flex items-center justify-between p-3 bg-background rounded-xl border-2 border-primary/10 shadow-sm group">
                                    <div className="space-y-1">
                                        <p className="font-bold text-sm leading-none">{m.name}</p>
                                        <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] h-5">
                                            {m.count} Pending Requests
                                        </Badge>
                                    </div>
                                    <Button 
                                        size="sm" 
                                        variant="outline" 
                                        onClick={() => handleSendReminder(m)}
                                        className="h-8 rounded-lg border-2 font-headline hover:bg-primary hover:text-white transition-all min-w-[90px]"
                                    >
                                        <Mail className="w-3.5 h-3.5 mr-1.5" /> Remind
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

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
                                                <TableRow key={day.id} className="h-14 border-b last:border-0 hover:bg-muted/10 transition-colors">
                                                    <TableCell className="font-bold text-sm pl-4">{getUserName(day.userId)}</TableCell>
                                                    <TableCell className="text-xs font-medium text-muted-foreground">{nonCallDate && isValid(nonCallDate) ? format(nonCallDate, "MMM d, yyyy") : "Invalid Date"}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="text-[10px] font-bold uppercase">{dayTypeLabels[day.dayType]}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-sm font-bold text-primary">{day.reason}</TableCell>
                                                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground italic">{day.remarks || '—'}</TableCell>
                                                    <TableCell className="text-right pr-6">
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
