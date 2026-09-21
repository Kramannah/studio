'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { managers } from '@/lib/managers';
import { MANAGER_TEAMS } from '@/lib/admins';
import type { NonCallDay, PlanningPermissionRequest, UserProfile } from '@/lib/types';
import { Users, Clock, AlertCircle } from 'lucide-react';

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
            
            // If managerId is not explicitly set in profile, check hardcoded MANAGER_TEAMS
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
        <Card className="border-2 border-primary/20 bg-primary/5 shadow-md mb-8">
            <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    <CardTitle className="text-lg font-black font-headline text-primary uppercase tracking-tight">
                        Territory Approval Tracker
                    </CardTitle>
                </div>
                <CardDescription className="text-xs font-bold text-muted-foreground">
                    Breakdown of all pending requests across DSM territories for HQ oversight.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {activeManagers.map(m => (
                        <div key={m.uid} className="bg-background rounded-xl border-2 p-3 shadow-sm flex flex-col justify-between">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none">DSM / Territory</p>
                                <p className="text-sm font-bold truncate text-primary">{m.name}</p>
                            </div>
                            <div className="flex items-center justify-between mt-4">
                                <div className="flex gap-2">
                                    <div className="flex flex-col items-center">
                                        <Badge variant="outline" className="h-6 text-[9px] font-black bg-muted/50 border-primary/10" title="Pending Leaves">
                                            L: {m.ncd}
                                        </Badge>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <Badge variant="outline" className="h-6 text-[9px] font-black bg-muted/50 border-primary/10" title="Unlock Requests">
                                            U: {m.planning}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 bg-primary/10 px-2 py-1 rounded-lg">
                                    <Clock className="w-3 h-3 text-primary" />
                                    <span className="text-sm font-black text-primary">{m.total}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {unassignedCount.total > 0 && (
                        <div className="bg-destructive/5 rounded-xl border-2 border-destructive/20 p-3 shadow-sm flex flex-col justify-between">
                             <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-destructive leading-none">Unassigned / HQ</p>
                                <p className="text-sm font-bold truncate text-muted-foreground">Field Personnel</p>
                            </div>
                            <div className="flex items-center justify-between mt-4">
                                <div className="flex gap-2">
                                    <Badge variant="outline" className="h-6 text-[9px] font-black bg-muted/50 border-destructive/10">
                                        L: {unassignedCount.ncd}
                                    </Badge>
                                    <Badge variant="outline" className="h-6 text-[9px] font-black bg-muted/50 border-destructive/10">
                                        U: {unassignedCount.planning}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-1.5 bg-destructive/10 px-2 py-1 rounded-lg">
                                    <AlertCircle className="w-3 h-3 text-destructive" />
                                    <span className="text-sm font-black text-destructive">{unassignedCount.total}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
