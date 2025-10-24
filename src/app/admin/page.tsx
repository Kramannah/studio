
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ADMIN_UIDS, MANAGER_TEAMS } from '@/lib/admins';
import { Button } from '@/components/ui/button';
import { LogOut, ShieldCheck, Users, X, Bell, UserSquare } from 'lucide-react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { UserDashboard } from '@/components/user-dashboard';
import { useAdminData } from '@/hooks/use-admin-data';
import { MarketingList } from '@/components/marketing-list';
import { useAdminMarketingSamples, useMarketingSamples } from '@/hooks/use-marketing-samples';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { USER_DATA_MAP } from '@/lib/user-data';
import { NonCallDayApprovals } from '@/components/non-call-day-approvals';
import { Badge } from '@/components/ui/badge';
import { PlanningRequestApprovals } from '@/components/planning-request-approvals';
import { managers } from '@/lib/managers';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { CallSummary } from '@/components/call-summary';
import { useAllCoverageEntries } from '@/hooks/use-all-coverage-entries';
import { AdminReportList } from '@/components/admin-report-list';

export default function AdminPage() {
    const { user, loading, logout } = useAuth();
    const router = useRouter();
    const [selectedManagerId, setSelectedManagerId] = useState<string | undefined>(undefined);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('district-reports');

    const isUserAdmin = useMemo(() => user && ADMIN_UIDS.includes(user.uid), [user]);
    const isUserManager = useMemo(() => user && Object.keys(MANAGER_TEAMS).includes(user.uid), [user]);
    const hasAdminAccess = isUserAdmin || isUserManager;
    
    useEffect(() => {
        if (isUserManager && user && !selectedManagerId) {
            setSelectedManagerId(user.uid);
        }
    }, [isUserManager, user, selectedManagerId]);

    const { 
        allEntries: teamEntries,
        allDoctors: teamDoctors,
        allPlans,
        allTimeLogs: teamTimeLogs,
        allNonCallDays, 
        allPlanningRequests,
        teamSummaryData,
        loading: dataLoading,
        loadingSummary,
        fetchUserData,
        fetchTeamSummary,
        updateNonCallDayStatus,
        updatePlanningRequestStatus,
        deleteEntry: deleteTeamEntry,
    } = useAdminData(selectedManagerId);

    const { entries: allEntries, deleteEntry: deleteAllUsersEntry } = useAllCoverageEntries();
    
    const { marketingSamples, usedQuantities, loading: marketingSamplesLoading, refetch: refetchMarketingSamples } = useMarketingSamples();
    const { addMarketingSamplesBulk } = useAdminMarketingSamples();

    const managedUserIds = useMemo(() => {
        if (!selectedManagerId) return [];
        return MANAGER_TEAMS[selectedManagerId] || [];
    }, [selectedManagerId]);

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
        return new Map([...map.entries()].sort((a, b) => a[1].localeCompare(b[1])));
    }, [managedUserIds]);
    
    const pendingNonCallApprovals = useMemo(() => {
        return (allNonCallDays || []).filter(ncd => ncd.status === 'pending');
    }, [allNonCallDays]);
    
    const pendingPlanningRequests = useMemo(() => {
        return (allPlanningRequests || []).filter(req => req.status === 'pending');
    }, [allPlanningRequests]);

    const totalPendingApprovals = pendingNonCallApprovals.length + pendingPlanningRequests.length;
    
    const selectedUserData = useMemo(() => {
        if (!selectedUserId) return null;
        return {
            entries: teamEntries || [],
            doctors: teamDoctors || [],
            plans: allPlans || [],
            nonCallDays: (allNonCallDays || []).filter(ncd => ncd.userId === selectedUserId),
            timeLogs: teamTimeLogs || [],
        }
    }, [selectedUserId, teamEntries, teamDoctors, allPlans, allNonCallDays, teamTimeLogs]);

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
            setActiveTab('district-reports');
        }
    }, [isUserManager, activeTab]);

    useEffect(() => {
        setSelectedUserId(null);
        if (selectedManagerId) {
            fetchTeamSummary();
        }
    }, [selectedManagerId, fetchTeamSummary]);
    
    useEffect(() => {
        if (selectedUserId) {
            fetchUserData(selectedUserId);
        }
    }, [selectedUserId, fetchUserData]);
    
    const handleAddSamples = async (samples: any) => {
        const success = await addMarketingSamplesBulk(samples);
        if (success) {
            refetchMarketingSamples();
        }
        return success;
    }

    if (loading && !selectedManagerId) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <RefreshCw className="w-12 h-12 animate-spin text-primary" />
                <p className="ml-4">Loading Dashboard...</p>
            </div>
        );
    }
    
    const handleUserSelect = (userId: string) => {
        setSelectedUserId(userId);
    }
    
    const renderDistrictReportsContent = () => {
         if (dataLoading && selectedUserId) {
            return (
                <div className="flex items-center justify-center mt-10">
                    <RefreshCw className="w-12 h-12 animate-spin text-primary" />
                     <p className="ml-4">Loading User Data...</p>
                </div>
            )
        }
        if (!selectedManagerId) {
             return (
                 <Card className="mt-6">
                    <CardContent className="p-6 text-center">
                        <p className="text-muted-foreground">Please select a DSM to view their team's data.</p>
                    </CardContent>
                </Card>
             );
        }
        
        if (selectedUserId) {
             return selectedUserData ? (
                <UserDashboard 
                    userId={selectedUserId}
                    allEntries={selectedUserData.entries}
                    allDoctors={selectedUserData.doctors}
                    allPlans={selectedUserData.plans}
                    allNonCallDays={selectedUserData.nonCallDays}
                    allTimeLogs={selectedUserData.timeLogs}
                    allMarketingSamples={marketingSamples || []}
                    onDeleteEntry={deleteTeamEntry}
                    usedQuantities={selectedUserUsedQuantities}
                />
            ) : null;
        }

        if (loadingSummary) {
            return (
                <div className="flex items-center justify-center mt-10">
                    <RefreshCw className="w-12 h-12 animate-spin text-primary" />
                    <p className="ml-4">Loading Team Summary...</p>
                </div>
            );
        }

        if (teamSummaryData) {
            return <UserDashboard 
                        userId={selectedManagerId}
                        allEntries={teamSummaryData.entries}
                        allDoctors={teamSummaryData.doctors}
                        allPlans={teamSummaryData.plans}
                        allNonCallDays={teamSummaryData.nonCallDays}
                        allTimeLogs={teamSummaryData.timeLogs}
                        allMarketingSamples={teamSummaryData.marketingSamples}
                        onDeleteEntry={deleteTeamEntry}
                        usedQuantities={teamSummaryData.usedQuantities}
                    />;
        }
        
        return (
            <Alert className="mt-6">
                <Users className="w-4 h-4" />
                <AlertTitle>Select a User</AlertTitle>
                <AlertDescription>
                    Select a user from the dropdown to view their detailed dashboard, or review the team summary below.
                </AlertDescription>
            </Alert>
        );
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
                        <TabsTrigger value="district-reports">District Reports</TabsTrigger>
                         {isUserAdmin && <TabsTrigger value="all-reports">All Reports</TabsTrigger>}
                        <TabsTrigger value="approvals" className="relative">
                            <Bell className="mr-2"/>
                            Approvals
                            {totalPendingApprovals > 0 && <Badge className="absolute -right-2 -top-2" variant="destructive">{totalPendingApprovals}</Badge>}
                        </TabsTrigger>
                        {isUserAdmin && <TabsTrigger value="marketing">Marketing Samples</TabsTrigger>}
                    </TabsList>
                    <TabsContent value="district-reports" className="mt-6">
                        <Card className="mb-6">
                            <CardHeader>
                                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                     <div>
                                        <CardTitle className="flex items-center gap-2 font-headline">
                                            <UserSquare />
                                            DSM Filter
                                        </CardTitle>
                                        <CardDescription>Select a DSM to view their team's data.</CardDescription>
                                        <div className="flex items-center gap-2 pt-2">
                                             <Select onValueChange={setSelectedManagerId} value={selectedManagerId} disabled={!isUserAdmin}>
                                                <SelectTrigger className="w-[350px]">
                                                    <SelectValue placeholder="Select a DSM..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {managers.map(manager => (
                                                        <SelectItem key={manager.uid} value={manager.uid}>{manager.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {selectedManagerId && isUserAdmin && (
                                                <Button variant="ghost" size="icon" onClick={() => setSelectedManagerId(undefined)}>
                                                    <X className="w-5 h-5"/>
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <div className={!selectedManagerId ? "opacity-50 pointer-events-none" : ""}>
                                        <CardTitle className="flex items-center gap-2 font-headline">
                                            <Users />
                                            PMR Filter
                                        </CardTitle>
                                        <CardDescription>Select a PMR to view their detailed dashboard.</CardDescription>
                                        <div className="flex items-center gap-2 pt-2">
                                            <Select onValueChange={handleUserSelect} value={selectedUserId || ''}>
                                                <SelectTrigger className="w-[350px]">
                                                    <SelectValue placeholder="Select a user..." />
                                                </SelectTrigger>
                                                <SelectContent>
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
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>

                        {renderDistrictReportsContent()}
                    </TabsContent>
                    {isUserAdmin && (
                        <TabsContent value="all-reports" className="mt-6">
                            <AdminReportList entries={allEntries} onDelete={deleteAllUsersEntry} />
                        </TabsContent>
                    )}
                    <TabsContent value="approvals" className="mt-6 space-y-6">
                        <NonCallDayApprovals 
                            nonCallDays={(allNonCallDays || [])}
                            onUpdateStatus={updateNonCallDayStatus}
                            userMap={USER_DATA_MAP}
                        />
                        <PlanningRequestApprovals
                            requests={(allPlanningRequests || [])}
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
