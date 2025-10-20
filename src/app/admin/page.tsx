
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ADMIN_UIDS, MANAGER_TEAMS } from '@/lib/admins';
import { Button } from '@/components/ui/button';
import { LogOut, ShieldCheck, Users, X, Bell, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserDashboard } from '@/components/user-dashboard';
import { useAdminData } from '@/hooks/use-admin-data';
import { MarketingList } from '@/components/marketing-list';
import { useAdminMarketingSamples, useMarketingSamples } from '@/hooks/use-marketing-samples';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CallSummary } from '@/components/call-summary';
import { USER_DATA_MAP } from '@/lib/user-data';
import { NonCallDayApprovals } from '@/components/non-call-day-approvals';
import { Badge } from '@/components/ui/badge';
import { PlanningRequestApprovals } from '@/components/planning-request-approvals';

export default function AdminPage() {
    const { user, loading, logout } = useAuth();
    const router = useRouter();
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('reports');

    const { 
        allEntries, 
        allDoctors, 
        allPlans, 
        allNonCallDays, 
        allTimeLogs, 
        allPlanningRequests,
        loading: dataLoading,
        fetchAllData,
        updateNonCallDayStatus,
        updatePlanningRequestStatus,
        deleteEntry,
    } = useAdminData();
    
    const { marketingSamples, usedQuantities, loading: marketingSamplesLoading, refetch: refetchMarketingSamples } = useMarketingSamples();
    const { addMarketingSamplesBulk } = useAdminMarketingSamples();

    const isUserAdmin = useMemo(() => user && ADMIN_UIDS.includes(user.uid), [user]);
    const isUserManager = useMemo(() => user && Object.keys(MANAGER_TEAMS).includes(user.uid), [user]);
    const hasAdminAccess = isUserAdmin || isUserManager;

    const managedUserIds = useMemo(() => {
        if (isUserAdmin) {
            const allUserIds = [
                ...((allEntries || []).map(e => e.userId)),
                ...((allDoctors || []).map(d => d.userId)),
                ...((allPlans || []).map(p => p.userId)),
                ...((allNonCallDays || []).map(n => n.userId)),
                ...((allTimeLogs || []).map(t => t.userId)),
                 ...((allPlanningRequests || []).map(r => r.userId)),
            ];
            return Array.from(new Set(allUserIds));
        }
        if (isUserManager && user) {
            return MANAGER_TEAMS[user.uid] || [];
        }
        return [];
    }, [isUserAdmin, isUserManager, user, allEntries, allDoctors, allPlans, allNonCallDays, allTimeLogs, allPlanningRequests]);


    const userMap = useMemo(() => {
        const map = new Map<string, string>();
        managedUserIds.forEach((id) => {
            const userData = USER_DATA_MAP[id];
            if (userData) {
                map.set(id, `${userData.code}_${userData.lastName}, ${userData.firstName}`);
            } else {
                map.set(id, `User ${id.substring(0, 6)}...`);
            }
        });
        return map;
    }, [managedUserIds]);

    const pendingNonCallApprovals = useMemo(() => {
        const allPending = (allNonCallDays || []).filter(ncd => ncd.status === 'pending');
        if(isUserAdmin) return allPending;
        if(isUserManager) return allPending.filter(ncd => managedUserIds.includes(ncd.userId));
        return [];
    }, [allNonCallDays, isUserAdmin, isUserManager, managedUserIds]);
    
    const pendingPlanningRequests = useMemo(() => {
        const allPending = (allPlanningRequests || []).filter(req => req.status === 'pending');
        if(isUserAdmin) return allPending;
        if(isUserManager) return allPending.filter(req => managedUserIds.includes(req.userId));
        return [];
    }, [allPlanningRequests, isUserAdmin, isUserManager, managedUserIds]);

    const totalPendingApprovals = pendingNonCallApprovals.length + pendingPlanningRequests.length;
    
    const teamData = useMemo(() => {
        if (isUserAdmin) {
             return {
                entries: allEntries || [],
                doctors: allDoctors || [],
                nonCallDays: allNonCallDays || [],
                timeLogs: allTimeLogs || [],
            };
        }
        return {
            entries: (allEntries || []).filter(e => managedUserIds.includes(e.userId)),
            doctors: (allDoctors || []).filter(d => managedUserIds.includes(d.userId)),
            nonCallDays: (allNonCallDays || []).filter(ncd => managedUserIds.includes(ncd.userId)),
            timeLogs: (allTimeLogs || []).filter(tl => managedUserIds.includes(tl.userId)),
        };
    }, [isUserAdmin, managedUserIds, allEntries, allDoctors, allNonCallDays, allTimeLogs]);
    
    const selectedUserData = useMemo(() => {
        if (!selectedUserId) return null;
        return {
            entries: (allEntries || []).filter(e => e.userId === selectedUserId),
            doctors: (allDoctors || []).filter(d => d.userId === selectedUserId),
            plans: (allPlans || []).filter(p => p.userId === selectedUserId),
            nonCallDays: (allNonCallDays || []).filter(ncd => ncd.userId === selectedUserId),
            timeLogs: (allTimeLogs || []).filter(tl => tl.userId === selectedUserId),
        }
    }, [selectedUserId, allEntries, allDoctors, allPlans, allNonCallDays, allTimeLogs]);

    const selectedUserUsedQuantities = useMemo(() => {
        if (!selectedUserData) return {};
        const quantities: Record<string, number> = {};
        selectedUserData.entries.forEach(entry => {
            if (entry.primarySampleName && entry.primaryProductQty) {
                quantities[entry.primarySampleName] = (quantities[entry.primarySampleName] || 0) + entry.primaryProductQty;
            }
            if (entry.secondarySampleName && entry.secondaryProductQty) {
                quantities[entry.secondarySampleName] = (quantities[entry.secondarySampleName] || 0) + entry.secondaryProductQty;
            }
        });
        return quantities;
    }, [selectedUserData]);

    useEffect(() => {
        if (!loading && !hasAdminAccess) {
            router.push('/');
        }
    }, [user, loading, hasAdminAccess, router]);

    useEffect(() => {
        if (isUserManager && activeTab === 'marketing') {
            setActiveTab('reports');
        }
    }, [isUserManager, activeTab]);
    
    const handleAddSamples = async (samples: any) => {
        const success = await addMarketingSamplesBulk(samples);
        if (success) {
            refetchMarketingSamples();
        }
        return success;
    }

    if (loading || dataLoading || !hasAdminAccess) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <RefreshCw className="w-12 h-12 animate-spin text-primary" />
                <p className="ml-4">Loading Dashboard...</p>
            </div>
        );
    }
    
    const handleUserSelect = (userId: string) => {
        if (userId === "all") {
            setSelectedUserId(null);
        } else {
            setSelectedUserId(userId);
        }
    }

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground">
             <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 border-b md:px-6 bg-background/80 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <ShieldCheck className="w-8 h-8 text-primary" />
                    <h1 className="text-xl font-bold md:text-2xl font-headline text-primary">
                        {isUserAdmin ? 'Admin Dashboard' : 'Manager Dashboard'}
                    </h1>
                </div>
                <div className="flex items-center gap-4">
                    {user && <span className="text-sm text-muted-foreground hidden sm:inline">{user.email}</span>}
                     {isUserAdmin && (
                        <Link href="/">
                            <Button size="sm" variant="outline" className="font-headline">
                                User View
                            </Button>
                        </Link>
                     )}
                    <Button size="sm" variant="outline" className="font-headline" onClick={logout}>
                        <LogOut className="mr-2"/>
                        Logout
                    </Button>
                </div>
            </header>
            <main className="flex-1 p-4 md:p-6">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                     <TabsList>
                        <TabsTrigger value="reports">User Reports</TabsTrigger>
                        <TabsTrigger value="approvals" className="relative">
                            <Bell className="mr-2"/>
                            Approvals
                            {totalPendingApprovals > 0 && <Badge className="absolute -right-2 -top-2" variant="destructive">{totalPendingApprovals}</Badge>}
                        </TabsTrigger>
                        {isUserAdmin && <TabsTrigger value="marketing">Marketing Samples</TabsTrigger>}
                    </TabsList>
                    <TabsContent value="reports" className="mt-6">
                        <Card className="mb-6">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 font-headline">
                                    <Users />
                                    User Filter
                                </CardTitle>
                                <CardDescription>Select a user to view their detailed dashboard or view all reports.</CardDescription>
                                <div className="flex items-center gap-2 pt-2">
                                    <Select onValueChange={handleUserSelect} value={selectedUserId || 'all'}>
                                        <SelectTrigger className="w-[350px]">
                                            <SelectValue placeholder="Select a user..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Users</SelectItem>
                                            {Array.from(userMap.entries()).map(([uid, displayName]) => (
                                                <SelectItem key={uid} value={uid}>{displayName}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {selectedUserId && (
                                        <Button variant="ghost" size="icon" onClick={() => setSelectedUserId(null)}>
                                            <X className="w-5 h-5"/>
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                        </Card>

                        {dataLoading ? (
                            <div className="flex items-center justify-center mt-10">
                                <RefreshCw className="w-12 h-12 animate-spin text-primary" />
                            </div>
                        ) : selectedUserId && selectedUserData ? (
                            <UserDashboard 
                                userId={selectedUserId}
                                allEntries={selectedUserData.entries}
                                allDoctors={selectedUserData.doctors}
                                allPlans={selectedUserData.plans}
                                allNonCallDays={selectedUserData.nonCallDays}
                                allTimeLogs={selectedUserData.timeLogs}
                                allMarketingSamples={marketingSamples || []}
                                onDeleteEntry={deleteEntry}
                                usedQuantities={selectedUserUsedQuantities}
                            />
                        ) : (
                           <CallSummary 
                                entries={teamData.entries}
                                doctors={teamData.doctors}
                                nonCallDays={teamData.nonCallDays}
                                timeLogs={teamData.timeLogs}
                                isAdminView={true}
                           />
                        )}
                    </TabsContent>
                    <TabsContent value="approvals" className="mt-6 space-y-6">
                        <NonCallDayApprovals 
                            nonCallDays={(allNonCallDays || []).filter(ncd => managedUserIds.includes(ncd.userId))}
                            onUpdateStatus={updateNonCallDayStatus}
                            userMap={USER_DATA_MAP}
                        />
                        <PlanningRequestApprovals
                            requests={(allPlanningRequests || []).filter(req => managedUserIds.includes(req.userId))}
                            onUpdateStatus={updatePlanningRequestStatus}
                            userMap={USER_DATA_MAP}
                        />
                    </TabsContent>
                    {isUserAdmin && (
                        <TabsContent value="marketing" className="mt-6">
                            <MarketingList
                                samples={marketingSamples || []}
                                usedQuantities={usedQuantities || {}}
                                onAddSamplesBulk={handleAddSamples}
                                readOnly={!isUserAdmin}
                                loading={marketingSamplesLoading}
                                onRefresh={refetchMarketingSamples}
                            />
                        </TabsContent>
                    )}
                </Tabs>
            </main>
        </div>
    );
    
}

    