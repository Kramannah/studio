
"use client"

import type { PlanningPermissionRequest } from "@/lib/types";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PlanningRequestApprovalsProps = {
    requests: PlanningPermissionRequest[];
    onUpdateStatus: (id: string, status: 'approved' | 'rejected') => void;
    userMap: Record<string, { code: string; firstName: string; lastName: string }>;
};

export function PlanningRequestApprovals({ requests, onUpdateStatus, userMap }: PlanningRequestApprovalsProps) {
    const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

    const filteredRequests = useMemo(() => {
        return requests.filter(req => req.status === activeTab);
    }, [requests, activeTab]);

    const getUserName = (userId: string) => {
        const user = userMap[userId];
        return user ? `${user.firstName} ${user.lastName}` : `User ID: ${userId.substring(0,6)}...`;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Planning Unlock Requests</CardTitle>
                <CardDescription>Review, approve, or reject requests to unlock past weeks for call planning.</CardDescription>
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
                                        <TableHead>Week Of</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Requested On</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredRequests.length > 0 ? (
                                        filteredRequests.map((req) => (
                                            <TableRow key={req.id}>
                                                <TableCell className="font-medium">{getUserName(req.userId)}</TableCell>
                                                <TableCell>{format(parseISO(req.weekStartDate), "PPP")}</TableCell>
                                                <TableCell className="max-w-[300px] truncate">{req.reason}</TableCell>
                                                <TableCell>{format(parseISO(req.requestedAt), "Pp")}</TableCell>
                                                <TableCell className="text-right">
                                                    {req.status === 'pending' ? (
                                                        <div className="flex justify-end gap-2">
                                                            <Button size="icon" variant="outline" className="text-primary" onClick={() => onUpdateStatus(req.id, 'approved')}>
                                                                <Check />
                                                            </Button>
                                                            <Button size="icon" variant="destructive" onClick={() => onUpdateStatus(req.id, 'rejected')}>
                                                                <X />
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <Badge variant={req.status === 'approved' ? 'secondary' : 'destructive'} className="capitalize">{req.status}</Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
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
