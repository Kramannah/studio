
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from '@/lib/admins';
import { Button } from '@/components/ui/button';
import { LogOut, ShieldCheck, Users, X, Bell, UserSquare, User, Package2, UserCog, Search, LayoutDashboard } from 'lucide-react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
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
    const [accountSearch, setAccountSearch] = useState('');

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

    const allAccounts = useMemo(() => {
        const all = Object.entries(USER_DATA_MAP).map(([uid, data]) => {
            const isAdmin = ADMIN_UIDS.includes(uid);
            const isManager = Object.keys(MANAGER_TEAMS).includes(uid);
            let role = 'PMR';
            if (isAdmin) role = 'Admin';
            else if (isManager) role = 'Manager';

            let district = 'N/A';
            if (role === 'PMR') {
                const managerUid = Object.keys(MANAGER_TEAMS).find(mUid => MANAGER_TEAMS[mUid].includes(uid));
                if (managerUid) {
                    const mData = USER_DATA_MAP[managerUid];
                    district = mData ? `${mData.firstName} ${mData.lastName}` : 'DSM Assigned';
                }
            } else if (role === 'Manager') {
                district = 'District Sales Manager';
            } else if (role === 'Admin') {
                district = 'National / HQ';
            }

            return { uid, ...data, role, district };
        });

        if (!accountSearch.trim()) return all.sort((a, b) => a.code.localeCompare(b.code));

        const q = accountSearch.toLowerCase();
        return all.filter(a => 
            a.code.toLowerCase().includes(q) || 
            a.firstName.toLowerCase().includes(q) || 
            a.lastName.toLowerCase().includes(q) ||
            a.role.toLowerCase().includes(q) ||
            a.district.toLowerCase().includes(q)
        ).sort((a, b) => a.code.localeCompare(b.code));
    }, [accountSearch]);

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
                        <TabsTrigger value="accounts" className="px-6 rounded-lg font-headline flex items-center gap-2"><UserCog className="h-4 w-4" /> Accounts</TabsTrigger>
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

                    <TabsContent value="accounts">
                         <Card className="border-2 shadow-lg rounded-2xl overflow-hidden">
                            <CardHeader className="bg-muted/30 border-b pb-6">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="space-y-1">
                                        <CardTitle className="text-xl font-black font-headline flex items-center gap-2">
                                            <UserCog className="text-primary" /> User Accounts Directory
                                        </CardTitle>
                                        <CardDescription>Master list of all PMRs, Managers, and Administrators.</CardDescription>
                                    </div>
                                    <div className="relative max-w-md w-full">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                        <Input 
                                            placeholder="Search by name, code, or role..." 
                                            className="pl-10 h-11 border-2 focus-visible:ring-primary rounded-xl"
                                            value={accountSearch}
                                            onChange={(e) => setAccountSearch(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-muted/20">
                                            <TableRow className="h-12 hover:bg-transparent">
                                                <TableHead className="font-bold text-foreground pl-6">Code</TableHead>
                                                <TableHead className="font-bold text-foreground">Employee Name</TableHead>
                                                <TableHead className="font-bold text-foreground">System Role</TableHead>
                                                <TableHead className="font-bold text-foreground">District / Assignment</TableHead>
                                                <TableHead className="font-bold text-foreground pr-6">System UID</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {allAccounts.length > 0 ? (
                                                allAccounts.map((acc) => (
                                                    <TableRow key={acc.uid} className="h-16 hover:bg-muted/30 border-b">
                                                        <TableCell className="pl-6">
                                                            <Badge variant="outline" className="font-mono font-bold border-primary/20 text-primary">
                                                                {acc.code}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="font-bold text-sm">
                                                            {acc.lastName}, {acc.firstName}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge 
                                                                variant={acc.role === 'Admin' ? 'destructive' : acc.role === 'Manager' ? 'default' : 'secondary'}
                                                                className="px-3"
                                                            >
                                                                {acc.role}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-sm font-medium text-muted-foreground">
                                                            {acc.district}
                                                        </TableCell>
                                                        <TableCell className="pr-6">
                                                            <code className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded select-all">
                                                                {acc.uid}
                                                            </code>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-64 text-center">
                                                        <div className="flex flex-col items-center justify-center opacity-30">
                                                            <Search className="w-16 h-16 mb-2" />
                                                            <p className="font-headline font-bold uppercase tracking-widest">No matching accounts found</p>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
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
