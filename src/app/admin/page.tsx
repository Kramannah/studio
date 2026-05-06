
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from '@/lib/admins';
import { Button } from '@/components/ui/button';
import { LogOut, ShieldCheck, Users, X, Bell, UserSquare, User, Package2 } from 'lucide-react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAdminData } from '@/hooks/use-admin-data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { USER_DATA_MAP } from '@/lib/user-data';
import { Badge } from '@/components/ui/badge';
import { managers } from '@/lib/managers';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { Q4AllocationView } from '@/components/q4-allocation-view';

const DynamicSkeleton = () => (
    <div className="flex items-center justify-center mt-10 w-full">
        <RefreshCw className="w-12 h-12 animate-spin text-primary" />
        <p className="ml-4 font-headline">Loading Module...</p>
    </div>
);

const UserDashboard = dynamic(() => import('@/components/user-dashboard').then(mod => mod.UserDashboard), { loading: () => <DynamicSkeleton /> });
const NonCallDayApprovals = dynamic(() => import('@/components/non-call-day-approvals').then(mod => mod.NonCallDayApprovals), { loading: () => <DynamicSkeleton /> });
const PlanningRequestApprovals = dynamic(() => import('@/components/planning-request-approvals').then(mod => mod.PlanningRequestApprovals), { loading: () => <DynamicSkeleton /> });


export default function AdminPage() {
    const { user, loading: authLoading, logout } = useAuth();
    const router = useRouter();
    const [selectedManagerId, setSelectedManagerId] = useState<string | undefined>(undefined);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('district-reports');

    const isUserAdmin = useMemo(() => {
        if (!user) return false;
        const email = user.email?.toLowerCase() || '';
        return ADMIN_UIDS.includes(user.uid) || email === 'mbustamante@hovidinc.com' || ADMIN_EMAILS.some(e => e.toLowerCase() === email);
    }, [user]);

    const isUserManager = useMemo(() => user && Object.keys(MANAGER_TEAMS).includes(user.uid), [user]);
    const hasAdminAccess = isUserAdmin || isUserManager;
    
    useEffect(() => {
        if (isUserManager && user && !selectedManagerId) {
            setSelectedManagerId(user.uid);
        }
    }, [isUserManager, user, selectedManagerId]);

    const { 
        allEntries: individualEntries,
        allDoctors: individualDoctors,
        allPlans: individualPlans,
        allTimeLogs: individualTimeLogs,
        allNonCallDaysIndividual,
        individualPlanningRequests,
        individualUsedQuantities,
        allNonCallDays: teamNonCallDays, 
        allPlanningRequests: teamPlanningRequests,
        teamSummaryData,
        loading: dataLoading,
        loadingSummary,
        fetchUserData,
        fetchTeamSummary,
        updateNonCallDayStatus,
        updatePlanningRequestStatus,
        deleteEntry,
        addDoctor,
        updateDoctor,
        deleteDoctor,
        deleteDoctorsBulk,
        addDoctorsBulk
    } = useAdminData(selectedManagerId);

    const managedUserIds = useMemo(() => {
        if (!selectedManagerId) return [];
        return MANAGER_TEAMS[selectedManagerId] || [];
    }, [selectedManagerId]);

    const userMap = useMemo(() => {
        const map = new Map<string, string>();
        managedUserIds.forEach((id) => {
            const u = USER_DATA_MAP[id];
            map.set(id, u ? `${u.code}_${u.lastName}, ${u.firstName}` : `User ${id.substring(0, 6)}...`);
        });
        return new Map([...map.entries()].sort((a, b) => a[1].localeCompare(b[1])));
    }, [managedUserIds]);
    
    const totalPendingApprovals = useMemo(() => {
        const pendingNCD = teamNonCallDays.filter(ncd => ncd.status === 'pending').length;
        const pendingPR = teamPlanningRequests.filter(req => req.status === 'pending').length;
        return pendingNCD + pendingPR;
    }, [teamNonCallDays, teamPlanningRequests]);

    useEffect(() => {
        if (!authLoading && !hasAdminAccess) router.push('/');
    }, [authLoading, hasAdminAccess, router]);

    useEffect(() => {
        setSelectedUserId(null);
        if (selectedManagerId) fetchTeamSummary();
    }, [selectedManagerId, fetchTeamSummary]);
    
    useEffect(() => {
        if (selectedUserId) fetchUserData(selectedUserId);
    }, [selectedUserId, fetchUserData]);

    if (authLoading && !selectedManagerId) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <RefreshCw className="w-12 h-12 animate-spin text-primary" />
                <p className="ml-4 font-headline">Loading Dashboard...</p>
            </div>
        );
    }
    
    const renderDistrictReportsContent = () => {
        if (dataLoading && selectedUserId) {
            return (
                <div className="flex items-center justify-center mt-10 w-full">
                    <RefreshCw className="w-12 h-12 animate-spin text-primary" />
                     <p className="ml-4 font-headline">Syncing Representative Data...</p>
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
             return (
                <UserDashboard 
                    userId={selectedUserId}
                    allEntries={individualEntries}
                    allDoctors={individualDoctors}
                    allPlans={individualPlans}
                    allNonCallDays={allNonCallDaysIndividual}
                    allTimeLogs={individualTimeLogs}
                    individualPlanningRequests={individualPlanningRequests}
                    onDeleteEntry={deleteEntry}
                    usedQuantities={individualUsedQuantities}
                    userMap={USER_DATA_MAP}
                    isAdminView={true}
                    onAddDoctor={(d) => addDoctor({ ...d, userId: selectedUserId })}
                    onUpdateDoctor={updateDoctor}
                    onDeleteDoctor={deleteDoctor}
                    onDeleteDoctorsBulk={deleteDoctorsBulk}
                    onAddDoctorsBulk={(ds) => addDoctorsBulk(ds.map(d => ({ ...d, userId: selectedUserId })))}
                />
            );
        }

        if (loadingSummary) {
            return (
                <div className="flex items-center justify-center mt-10 w-full">
                    <RefreshCw className="w-12 h-12 animate-spin text-primary" />
                    <p className="ml-4 font-headline">Assembling Team Overview...</p>
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
                        onDeleteEntry={deleteEntry}
                        usedQuantities={teamSummaryData.usedQuantities}
                        userMap={USER_DATA_MAP}
                        isAdminView={true}
                        onAddDoctor={(d) => addDoctor({ ...d, userId: selectedManagerId })}
                        onUpdateDoctor={updateDoctor}
                        onDeleteDoctor={deleteDoctor}
                        onDeleteDoctorsBulk={deleteDoctorsBulk}
                        onAddDoctorsBulk={(ds) => addDoctorsBulk(ds.map(d => ({ ...d, userId: selectedUserId || selectedManagerId })))}
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
                    {user && (
                        <div className="flex flex-col items-end px-3 py-1 bg-muted/30 rounded-lg border border-primary/10">
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">DSM SESSION</span>
                            <div className="flex items-center gap-1.5">
                                <User className="w-3 h-3 text-primary" />
                                <span className="text-sm font-bold text-primary truncate max-w-[200px]">{user.email}</span>
                            </div>
                        </div>
                    )}
                    {isUserAdmin && (
                        <Link href="/">
                            <Button size="sm" variant="outline" className="font-headline border-2">User View</Button>
                        </Link>
                    )}
                    <Button size="sm" variant="destructive" className="font-headline" onClick={logout}>Logout</Button>
                </div>
            </header>
            <main className="flex-1 p-4 md:p-6 lg:p-8 w-full max-w-[1600px] mx-auto">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="bg-muted/50 p-1 rounded-xl border-2 w-full justify-start sm:w-fit mb-8">
                        <TabsTrigger value="district-reports" className="px-6 rounded-lg font-headline">District Reports</TabsTrigger>
                        <TabsTrigger value="sample-allocation" className="px-6 rounded-lg font-headline flex items-center gap-2"><Package2 className="h-4 w-4" /> Sample Allocation</TabsTrigger>
                        <TabsTrigger value="approvals" className="relative px-6 rounded-lg font-headline">
                            <Bell className="mr-2 h-4 w-4"/>
                            Approvals
                            {totalPendingApprovals > 0 && <Badge className="absolute -right-1 -top-1 px-1.5 min-w-[20px]" variant="destructive">{totalPendingApprovals}</Badge>}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="district-reports">
                        <Card className="mb-8 border-2 shadow-sm">
                            <CardHeader>
                                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                                     <div className="space-y-3">
                                        <CardTitle className="flex items-center gap-2 font-headline text-xl">
                                            <UserSquare className="text-primary" /> District Manager
                                        </CardTitle>
                                        <Select onValueChange={setSelectedManagerId} value={selectedManagerId} disabled={!isUserAdmin}>
                                            <SelectTrigger className="w-full border-2 h-11 font-headline">
                                                <SelectValue placeholder="Select a DSM..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {managers.map(m => <SelectItem key={m.uid} value={m.uid} className="font-headline">{m.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className={cn("space-y-3", !selectedManagerId && "opacity-50 pointer-events-none")}>
                                        <CardTitle className="flex items-center gap-2 font-headline text-xl">
                                            <Users className="text-primary" /> Representative
                                        </CardTitle>
                                        <div className="flex items-center gap-2">
                                            <Select onValueChange={setSelectedUserId} value={selectedUserId || ''}>
                                                <SelectTrigger className="w-full border-2 h-11 font-headline">
                                                    <SelectValue placeholder="All Representatives (Summary)" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {Array.from(userMap.entries()).map(([uid, name]) => <SelectItem key={uid} value={uid} className="font-headline">{name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            {selectedUserId && <Button variant="ghost" size="icon" onClick={() => setSelectedUserId(null)}><X className="w-5 h-5"/></Button>}
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>
                        {renderDistrictReportsContent()}
                    </TabsContent>

                    <TabsContent value="sample-allocation">
                        <Q4AllocationView />
                    </TabsContent>

                    <TabsContent value="approvals" className="space-y-8">
                        <NonCallDayApprovals nonCallDays={teamNonCallDays} onUpdateStatus={updateNonCallDayStatus} userMap={USER_DATA_MAP} />
                        <PlanningRequestApprovals requests={teamPlanningRequests} onUpdateStatus={updatePlanningRequestStatus} userMap={USER_DATA_MAP} />
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}
