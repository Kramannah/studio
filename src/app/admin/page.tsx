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
import { useAdminData } from '@/hooks/use-admin-data';
import { useAdminMarketingSamples, useMarketingSamples } from '@/hooks/use-marketing-samples';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { USER_DATA_MAP } from '@/lib/user-data';
import { Badge } from '@/components/ui/badge';
import { managers } from '@/lib/managers';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useAllCoverageEntries } from '@/hooks/use-all-coverage-entries';
import dynamic from 'next/dynamic';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const DynamicSkeleton = () => (
    <div className="flex items-center justify-center mt-10 w-full">
        <RefreshCw className="w-12 h-12 animate-spin text-primary" />
        <p className="ml-4 font-headline">Loading Module...</p>
    </div>
);

const UserDashboard = dynamic(() => import('@/components/user-dashboard').then(mod => mod.UserDashboard), { loading: () => <DynamicSkeleton /> });
const AdminReportList = dynamic(() => import('@/components/admin-report-list').then(mod => mod.AdminReportList), { loading: () => <DynamicSkeleton /> });
const NonCallDayApprovals = dynamic(() => import('@/components/non-call-day-approvals').then(mod => mod.NonCallDayApprovals), { loading: () => <DynamicSkeleton /> });
const PlanningRequestApprovals = dynamic(() => import('@/components/planning-request-approvals').then(mod => mod.PlanningRequestApprovals), { loading: () => <DynamicSkeleton /> });
const MarketingList = dynamic(() => import('@/components/marketing-list').then(mod => mod.MarketingList), { loading: () => <DynamicSkeleton /> });


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
        addDoctor,
        updateDoctor,
        deleteDoctor,
        deleteDoctorsBulk,
        addDoctorsBulk
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
    
    const totalPendingApprovals = useMemo(() => {
        const pendingNCD = (allNonCallDays || []).filter(ncd => ncd.status === 'pending').length;
        const pendingPR = (allPlanningRequests || []).filter(req => req.status === 'pending').length;
        return pendingNCD + pendingPR;
    }, [allNonCallDays, allPlanningRequests]);

    const selectedUserData = useMemo(() => {
        if (!selectedUserId) return null;
        return {
            entries: teamEntries || [],
            doctors: teamDoctors || [],
            plans: allPlans || [],
            nonCallDays: (allNonCallDays || []).filter(ncd => ncd.userId === selectedUserId),
            timeLogs: teamTimeLogs || [],
            marketingSamples: marketingSamples || [],
        }
    }, [selectedUserId, teamEntries, teamDoctors, allPlans, allNonCallDays, teamTimeLogs, marketingSamples]);

    const selectedUserUsedQuantities = useMemo(() => {
        if (!selectedUserData) return {};
        const quantities: Record<string, number> = {};
        selectedUserData.entries.forEach(entry => {
            if (entry.primarySampleName && entry.primaryProductQty) {
                quantities[entry.primarySampleName] = (quantities[entry.primarySampleName] || 0) + Number(entry.primaryProductQty);
            }
            if (entry.secondarySampleName && entry.secondaryProductQty) {
                quantities[entry.secondarySampleName] = (quantities[entry.secondarySampleName] || 0) + Number(entry.secondaryProductQty);
            }
            if (entry.reminderProducts) {
                entry.reminderProducts.forEach(prod => {
                    if (prod.sampleName && prod.quantity) {
                        quantities[prod.sampleName] = (quantities[prod.sampleName] || 0) + Number(prod.quantity);
                    }
                });
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
            <div className="flex items-center justify-center min-h-screen bg-background">
                <RefreshCw className="w-12 h-12 animate-spin text-primary" />
                <p className="ml-4 font-headline">Loading Dashboard...</p>
            </div>
        );
    }
    
    const handleUserSelect = (userId: string) => {
        setSelectedUserId(userId);
    }
    
    const renderDistrictReportsContent = () => {
         if (dataLoading && selectedUserId) {
            return (
                <div className="flex items-center justify-center mt-10 w-full">
                    <RefreshCw className="w-12 h-12 animate-spin text-primary" />
                     <p className="ml-4 font-headline">Loading User Data...</p>
                </div>
            )
        }
        if (!selectedManagerId) {
             return (
                 <Card className="mt-6 border-2 border-dashed">
                    <CardContent className="p-12 text-center">
                        <p className="text-muted-foreground text-lg font-headline">Please select a District Sales Manager (DSM) to view their team's data.</p>
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
                    allMarketingSamples={selectedUserData.marketingSamples}
                    onDeleteEntry={deleteTeamEntry}
                    usedQuantities={selectedUserUsedQuantities}
                    userMap={USER_DATA_MAP}
                    isAdminView={true}
                    onAddDoctor={(doctor) => addDoctor({ ...doctor, userId: selectedUserId })}
                    onUpdateDoctor={updateDoctor}
                    onDeleteDoctor={deleteDoctor}
                    onDeleteDoctorsBulk={deleteDoctorsBulk}
                    onAddDoctorsBulk={(doctors) => addDoctorsBulk(doctors.map(d => ({ ...d, userId: selectedUserId })))}
                />
            ) : null;
        }

        if (loadingSummary) {
            return (
                <div className="flex items-center justify-center mt-10 w-full">
                    <RefreshCw className="w-12 h-12 animate-spin text-primary" />
                    <p className="ml-4 font-headline">Loading Team Summary...</p>
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
                        userMap={USER_DATA_MAP}
                        isAdminView={true}
                        onAddDoctor={(doctor) => {
                            addDoctor({ ...doctor, userId: selectedManagerId })
                        }}
                        onUpdateDoctor={updateDoctor}
                        onDeleteDoctor={deleteDoctor}
                        onDeleteDoctorsBulk={deleteDoctorsBulk}
                        onAddDoctorsBulk={(doctors) => addDoctorsBulk(doctors.map(d => ({ ...d, userId: selectedUserId || selectedManagerId })))}
                    />;
        }
        
        return (
            <Alert className="mt-6 border-2">
                <Users className="w-4 h-4 text-primary" />
                <AlertTitle className="font-headline">Select a User</AlertTitle>
                <AlertDescription className="text-muted-foreground">
                    Select a PMR from the filter to view their detailed performance dashboard, or review the combined team summary.
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground w-full">
             <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 border-b md:px-6 bg-background/80 backdrop-blur-sm w-full">
                <div className="flex items-center gap-4">
                    <ShieldCheck className="w-8 h-8 text-primary" />
                    <h1 className="text-xl font-bold md:text-2xl font-headline text-primary tracking-tight">
                        {isUserAdmin ? 'Admin Dashboard' : 'Manager Dashboard'}
                    </h1>
                </div>
                <div className="flex items-center gap-4">
                    {user && <span className="text-sm text-muted-foreground hidden lg:inline font-medium">{user.email}</span>}
                     {isUserAdmin && (
                        <Link href="/">
                            <Button size="sm" variant="outline" className="font-headline border-2">
                                User View
                            </Button>
                        </Link>
                     )}
                    <Button size="sm" variant="destructive" className="font-headline shadow-sm" onClick={logout}>
                        <LogOut className="mr-2 h-4 w-4"/>
                        Logout
                    </Button>
                </div>
            </header>
            <main className="flex-1 p-4 md:p-6 lg:p-8 w-full max-w-[1600px] mx-auto overflow-x-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <div className="w-full overflow-x-auto pb-2 scrollbar-hide">
                        <TabsList className="bg-muted/50 p-1 rounded-xl border-2 w-full justify-start sm:w-fit">
                            <TabsTrigger value="district-reports" className="px-6 rounded-lg font-headline">District Reports</TabsTrigger>
                            {isUserAdmin && <TabsTrigger value="all-reports" className="px-6 rounded-lg font-headline">All Reports</TabsTrigger>}
                            <TabsTrigger value="approvals" className="relative px-6 rounded-lg font-headline">
                                <Bell className="mr-2 h-4 w-4"/>
                                Approvals
                                {totalPendingApprovals > 0 && <Badge className="absolute -right-1 -top-1 px-1.5 min-w-[20px]" variant="destructive">{totalPendingApprovals}</Badge>}
                            </TabsTrigger>
                            {isUserAdmin && <TabsTrigger value="marketing" className="px-6 rounded-lg font-headline">Marketing Samples</TabsTrigger>}
                        </TabsList>
                    </div>

                    <TabsContent value="district-reports" className="mt-8">
                        <Card className="mb-8 border-2 shadow-sm">
                            <CardHeader>
                                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                                     <div className="space-y-3">
                                        <CardTitle className="flex items-center gap-2 font-headline text-xl">
                                            <UserSquare className="text-primary" />
                                            DSM Filter
                                        </CardTitle>
                                        <CardDescription className="text-base">Select a DSM to access their specific district's performance data.</CardDescription>
                                        <div className="flex items-center gap-2 pt-2">
                                             <Select onValueChange={setSelectedManagerId} value={selectedManagerId} disabled={!isUserAdmin}>
                                                <SelectTrigger className="w-full sm:w-[350px] h-11 border-2 text-base font-headline">
                                                    <SelectValue placeholder="Select a DSM..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {managers.map(manager => (
                                                        <SelectItem key={manager.uid} value={manager.uid} className="font-headline">{manager.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {selectedManagerId && isUserAdmin && (
                                                <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setSelectedManagerId(undefined)}>
                                                    <X className="w-5 h-5"/>
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <div className={cn("space-y-3", !selectedManagerId && "opacity-50 pointer-events-none")}>
                                        <CardTitle className="flex items-center gap-2 font-headline text-xl">
                                            <Users className="text-primary" />
                                            PMR Filter
                                        </CardTitle>
                                        <CardDescription className="text-base">Drill down into a specific medical representative's daily reporting.</CardDescription>
                                        <div className="flex items-center gap-2 pt-2">
                                            <Select onValueChange={handleUserSelect} value={selectedUserId || ''}>
                                                <SelectTrigger className="w-full sm:w-[350px] h-11 border-2 text-base font-headline">
                                                    <SelectValue placeholder="Select a representative..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {Array.from(userMap.entries()).map(([uid, displayName]) => (
                                                        <SelectItem key={uid} value={uid} className="font-headline">{displayName}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {selectedUserId && (
                                                <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setSelectedUserId(null)}>
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
                        <TabsContent value="all-reports" className="mt-8 w-full">
                            <AdminReportList entries={allEntries} onDelete={deleteAllUsersEntry} />
                        </TabsContent>
                    )}
                    
                    <TabsContent value="approvals" className="mt-8 space-y-8 w-full">
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
                        <TabsContent value="marketing" className="mt-8 w-full">
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
