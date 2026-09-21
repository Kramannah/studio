'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { managers } from '@/lib/managers';
import { MANAGER_TEAMS } from '@/lib/admins';
import type { NonCallDay, PlanningPermissionRequest, UserProfile } from '@/lib/types';
import { Users, Clock, AlertCircle, ShieldCheck } from 'lucide-react';

interface ApprovalTrackerProps {
    nonCallDays: NonCallDay[];
    planningRequests: PlanningPermissionRequest[];
    profiles: Record<string, UserProfile>;
}

export function ApprovalTracker({ nonCallDays, planningRequests, profiles }: ApprovalTrackerProps) {
    const breakdown = useMemo(() => {
        const counts: Record<string, { ncd: number; planning: number; total: number }> = {};
        
        // Initialize counts for all known managers
        managers.forEach(m => {
            counts[m.uid] = { ncd: 0, planning: 0, total: 0 };
        });
        counts['unassigned'] = { ncd: 0, planning: 0, total: 0 };

        const pendingNcds = nonCallDays.filter(d => d.status === 'pending');
        const pendingReqs = planningRequests.filter(r => r.status === 'pending');

        const processRequest = (userId: string, type: 'ncd' | 'planning') => {
            const profile = profiles[userId];
            let managerId = profile?.managerId;
            
            // Fallback to hardcoded teams if profile managerId is missing
            if (!managerId || managerId === 'none') {
                managerId = Object.keys(MANAGER_TEAMS).find(mId => (MANAGER_TEAMS[mId] || []).includes(userId));
            }

            const targetId = (managerId && counts[managerId]) ? managerId : 'unassigned';
            counts[targetId][type]++;
            counts[targetId].total++;
        };

        pendingNcds.forEach(d => processRequest(d.userId, 'ncd'));
        pendingReqs.forEach(r => processRequest(r.userId, 'planning'));

        return counts;
    }, [nonCallDays, planningRequests, profiles]);

    const activeManagers = managers.map(m => ({
        ...m,
        ...breakdown[m.uid]
    })).filter(m => m.total > 0).sort((a, b) => b.total - a.total);

    const unassignedCount = breakdown['unassigned'];

    if (activeManagers.length === 0 && unassignedCount.total === 0) return null;

    return (
        <Card className="border-2 border-primary/20 bg-primary/5 shadow-md mb-8 overflow-hidden">
            <CardHeader className="pb-4 bg-muted/30 border-b">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-primary" />
                        <CardTitle className="text-lg font-black font-headline text-primary uppercase tracking-tight">
                            Management Approval Oversight
                        </CardTitle>
                    </div>
                    <Badge variant="outline" className="bg-background font-black border-primary/20">
                        {activeManagers.length + (unassignedCount.total > 0 ? 1 : 0)} Managers Active
                    </Badge>
                </div>
                <CardDescription className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1">
                    Pending requests per District Sales Manager
                </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {activeManagers.map(m => (
                        <div key={m.uid} className="bg-background rounded-2xl border-2 p-4 shadow-sm flex items-center justify-between group hover:border-primary/40 transition-all">
                            <div className="space-y-1">
                                <p className="text-sm font-black text-primary group-hover:translate-x-1 transition-transform">
                                    {m.name}
                                </p>
                                <div className="flex gap-2">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">L: {m.ncd}</span>
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">U: {m.planning}</span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <div className="flex items-center gap-1.5 bg-primary/10 px-3 py-1 rounded-full">
                                    <Clock className="w-3 h-3 text-primary animate-pulse" />
                                    <span className="text-base font-black text-primary">{m.total}</span>
                                </div>
                                <p className="text-[8px] font-black text-muted-foreground uppercase mt-1">Requests</p>
                            </div>
                        </div>
                    ))}

                    {unassignedCount.total > 0 && (
                        <div className="bg-destructive/5 rounded-2xl border-2 border-destructive/20 p-4 shadow-sm flex items-center justify-between border-dashed">
                             <div className="space-y-1">
                                <p className="text-sm font-black text-destructive">
                                    Unassigned / HQ
                                </p>
                                <div className="flex gap-2">
                                    <span className="text-[10px] font-bold text-destructive/60 uppercase">L: {unassignedCount.ncd}</span>
                                    <span className="text-[10px] font-bold text-destructive/60 uppercase">U: {unassignedCount.planning}</span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <div className="flex items-center gap-1.5 bg-destructive/10 px-3 py-1 rounded-full">
                                    <AlertCircle className="w-3 h-3 text-destructive" />
                                    <span className="text-base font-black text-destructive">{unassignedCount.total}</span>
                                </div>
                                <p className="text-[8px] font-black text-destructive/60 uppercase mt-1">Requests</p>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
