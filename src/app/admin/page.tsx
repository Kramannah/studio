'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from '@/lib/admins';
import { Button } from '@/components/ui/button';
import { ShieldCheck, X, User, UserCog, Search, RefreshCw, AlertCircle, Fingerprint, Pencil } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAdminData } from '@/hooks/use-admin-data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { USER_DATA_MAP } from '@/lib/user-data';
import { Badge } from '@/components/ui/badge';
import { managers } from '@/lib/managers';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { NonCallDayApprovals } from '@/components/non-call-day-approvals';
import { PlanningRequestApprovals } from '@/components/planning-request-approvals';
import { useUserProfiles } from '@/hooks/use-user-profiles';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const DynamicSkeleton = () => (
    <div className="flex items-center justify-center mt-10 w-full p-20 border-2 border-dashed rounded-2xl bg-muted/5">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        <p className="ml-4 font-headline font-bold text-muted-foreground uppercase tracking-widest text-sm">Accessing Firestore Records...</p>
    </div>
);

const UserDashboard = dynamic(() => import('@/components/user-dashboard').then(mod => mod.UserDashboard), { loading: () => <DynamicSkeleton /> });
const TeamSummary = dynamic(() => import('@/components/team-summary').then(mod => mod.TeamSummary), { loading: () => <DynamicSkeleton /> });
const Q4AllocationView = dynamic(() => import('@/components/q4-allocation-view').then(mod => mod.Q4AllocationView), { loading: () => <DynamicSkeleton /> });

export default function AdminPage() {
    const { user, loading: authLoading, logout } = useAuth();
    const router = useRouter();
    const { profiles, updateProfile, loading: profilesLoading } = useUserProfiles();
    
    const [selectedManagerId, setSelectedManagerId] = useState<string | undefined>(undefined);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [accountSearch, setAccountSearch] = useState('');
    const [editingAccount, setEditingAccount] = useState<{ uid: string; firstName: string; lastName: string; managerId?: string; email: string } | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const isUserAdmin = useMemo(() => {
        if (!user) return false;
        const email = (user.email ?? "").toLowerCase();
        return ADMIN_UIDS.includes(user.uid) || email === 'mbustamante@hovidinc.com' || ADMIN_EMAILS.some(e => (e ?? "").toLowerCase() === email);
    }, [user]);

    const isUserManager = useMemo(() => user && Object.keys(MANAGER_TEAMS).includes(user.uid), [user]);
    const hasAdminAccess = isUserAdmin || isUserManager;

    const { 
        allEntries: individualEntries,
        allDoctors: individualDoctors,
        allPlans: individualPlans,
        allTimeLogs: individualTimeLogs,
        allNonCallDaysIndividual,
        individualPlanningRequests,
        individualUsedQuantities,
        allNonCallDays,
        allPlanningRequests,
        teamSummaryData,
        updateNonCallDayStatus,
        updatePlanningRequestStatus,
        loadingSummary,
        loadingIndividual,
        fetchUserData,
        fetchTeamSummary,
        deleteEntry,
        addDoctor,
        updateDoctor,
        deleteDoctor
    } = useAdminData(selectedManagerId, profiles);

    const allAccounts = useMemo(() => {
        const mergedMap = { ...USER_DATA_MAP };
        Object.entries(profiles).forEach(([uid, p]) => {
            mergedMap[uid] = {
                code: mergedMap[uid]?.code || p.code || "USER",
                firstName: p.firstName || mergedMap[uid]?.firstName || "Unknown",
                lastName: p.lastName || mergedMap[uid]?.lastName || "User",
                email: p.email || mergedMap[uid]?.email || "N/A"
            };
        });

        const all = Object.entries(mergedMap).map(([uid, data]) => {
            const isAdmin = ADMIN_UIDS.includes(uid);
            const isManager = Object.keys(MANAGER_TEAMS).includes(uid);
            let role = 'PMR';
            if (isAdmin) role = 'Admin';
            else if (isManager) role = 'Manager';

            let district = 'N/A';
            const profile = profiles[uid];
            const managerUid = profile?.managerId || Object.keys(MANAGER_TEAMS).find(mId => (MANAGER_TEAMS[mId] || []).includes(uid));
            
            if (role === 'PMR') {
                if (managerUid) {
                    const mData = mergedMap[managerUid];
                    district = mData ? `${mData.firstName} ${mData.lastName}` : 'DSM Assigned';
                } else {
                    district = 'Unassigned / HQ';
                }
            } else if (role === 'Manager') {
                district = 'District Sales Manager';
            } else if (role === 'Admin') {
                district = 'National / HQ';
            }

            return { uid, ...data, role, district, managerId: managerUid };
        });

        const q = (accountSearch ?? "").toLowerCase().trim();
        if (!q) return all.sort((a, b) => (a.lastName ?? "").localeCompare(b.lastName ?? ""));

        return all.filter(a => {
            return (a.code ?? "").toLowerCase().includes(q) || 
                   (a.firstName ?? "").toLowerCase().includes(q) || 
                   (a.lastName ?? "").toLowerCase().includes(q) ||
                   (a.role ?? "").toLowerCase().includes(q) ||
                   (a.district ?? "").toLowerCase().includes(q) ||
                   (a.email ?? "").toLowerCase().includes(q);
        }).sort((a, b) => (a.lastName ?? "").localeCompare(b.lastName ?? ""));
    }, [accountSearch, profiles]);

    const managedUserIds = useMemo(() => {
        if (!selectedManagerId) return [];
        const hardcoded = MANAGER_TEAMS[selectedManagerId] || [];
        const dynamic = Object.entries(profiles)
            .filter(([_, p]) => p.managerId === selectedManagerId)
            .map(([uid, _]) => uid);
        return Array.from(new Set([...hardcoded, ...dynamic]));
    }, [selectedManagerId, profiles]);

    const userMapForSelection = useMemo(() => {
        const map = new Map<string, string>();
        managedUserIds.forEach((id) => {
            const u = profiles[id] || USER_DATA_MAP[id];
            map.set(id, u ? `${(u as any).code || 'PMR'}_${u.lastName}, ${u.firstName}` : `User ${id}`);
        });
        return new Map([...map.entries()].sort((a, b) => a[1].localeCompare(b[1])));
    }, [managedUserIds, profiles]);

    useEffect(() => {
        if (mounted && !authLoading && !hasAdminAccess) router.push('/');
    }, [authLoading, hasAdminAccess, router, mounted]);

    useEffect(() => {
        if (selectedUserId) {
            fetchUserData(selectedUserId);
        } else if (selectedManagerId) {
            fetchTeamSummary();
        }
    }, [selectedUserId, selectedManagerId, fetchUserData, fetchTeamSummary]);

    const handleSaveAccount = async () => {
        if (!editingAccount) return;
        const success = await updateProfile(
            editingAccount.uid, 
            editingAccount.firstName, 
            editingAccount.lastName, 
            editingAccount.managerId,
            editingAccount.email
        );
        if (success) setEditingAccount(null);
    };

    if (!mounted || authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background text-primary">
                <RefreshCw className="w-12 h-12 animate-spin" />
                <p className="ml-4 font-headline font-bold">Initializing Dashboard...</p>
            </div>
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
                    <div className="flex flex-col items-end px-3 py-1 bg-muted/30 rounded-lg border border-primary/10">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">ADMIN SESSION</span>
                        <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-primary" />
                            <span className="text-sm font-bold text-primary truncate max-w-[200px]">{user?.email}</span>
                        </div>
                    </div>
                    <Button size="sm" variant="destructive" className="font-headline" onClick={() => logout()}>Logout</Button>
                </div>
            </header>

            <main className="flex-1 p-4 md:p-6 lg:p-8 w-full max-w-[1600px] mx-auto">
                <Tabs defaultValue="district-reports" className="w-full">
                    <TabsList className="bg-muted/50 p-1 rounded-xl border-2 w-full justify-start sm:w-fit mb-8">
                        <TabsTrigger value="district-reports" className="px-6 rounded-lg font-headline">District Reports</TabsTrigger>
                        <TabsTrigger value="approvals" className="px-6 rounded-lg font-headline">Approvals</TabsTrigger>
                        <TabsTrigger value="accounts" className="px-6 rounded-lg font-headline flex items-center gap-2"><UserCog className="h-4 w-4" /> Accounts</TabsTrigger>
                        <TabsTrigger value="sample-allocation" className="px-6 rounded-lg font-headline">Allocations</TabsTrigger>
                    </TabsList>

                    <TabsContent value="district-reports">
                         <Card className="mb-8 border-2 shadow-sm">
                            <CardHeader>
                                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                                     <div className="space-y-3">
                                        <CardTitle className="font-headline text-xl">District Manager</CardTitle>
                                        <Select onValueChange={setSelectedManagerId} value={selectedManagerId} disabled={!isUserAdmin}>
                                            <SelectTrigger className="w-full border-2 h-11 font-headline">
                                                <SelectValue placeholder="Select a DSM..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {managers.map(m => <SelectItem key={m.uid} value={m.uid}>{m.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className={cn("space-y-3", !selectedManagerId && "opacity-50 pointer-events-none")}>
                                        <CardTitle className="font-headline text-xl">Representative</CardTitle>
                                        <div className="flex items-center gap-2">
                                            <Select onValueChange={setSelectedUserId} value={selectedUserId || ''}>
                                                <SelectTrigger className="w-full border-2 h-11 font-headline">
                                                    <SelectValue placeholder="All Representatives (Summary)" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {Array.from(userMapForSelection.entries()).map(([uid, name]) => <SelectItem key={uid} value={uid}>{name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            {selectedUserId && <Button variant="ghost" size="icon" onClick={() => setSelectedUserId(null)}><X className="w-5 h-5"/></Button>}
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>
                        
                        {selectedUserId ? (
                            loadingIndividual ? <DynamicSkeleton /> : (
                             <UserDashboard 
                                key={selectedUserId}
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
                            />
                            )
                        ) : selectedManagerId ? (
                            <TeamSummary data={teamSummaryData} loading={loadingSummary} />
                        ) : (
                            <Alert className="border-2 py-12 flex flex-col items-center text-center">
                                <AlertCircle className="w-10 h-10 text-primary mb-4" />
                                <AlertTitle className="font-headline text-xl">Territory Oversight Required</AlertTitle>
                                <AlertDescription className="text-lg">Please select a District Manager to view team performance analytics or select a specific PMR for individual masterlists.</AlertDescription>
                            </Alert>
                        )}
                    </TabsContent>

                    <TabsContent value="approvals" className="space-y-8">
                        <NonCallDayApprovals 
                            nonCallDays={allNonCallDays} 
                            onUpdateStatus={updateNonCallDayStatus}
                            userMap={USER_DATA_MAP}
                        />
                        <PlanningRequestApprovals 
                            requests={allPlanningRequests}
                            onUpdateStatus={updatePlanningRequestStatus}
                            userMap={USER_DATA_MAP}
                        />
                    </TabsContent>

                    <TabsContent value="accounts">
                         <Card className="border-2 shadow-lg rounded-2xl overflow-hidden">
                            <CardHeader className="bg-muted/30 border-b pb-6">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="space-y-1">
                                        <CardTitle className="text-xl font-black font-headline flex items-center gap-2">
                                            <UserCog className="text-primary" /> User Directory
                                        </CardTitle>
                                        <CardDescription>Master mapping of all authorized personnel in the system.</CardDescription>
                                    </div>
                                    <div className="relative max-w-md w-full">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                        <Input 
                                            placeholder="Search by name, code, or identifier..." 
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
                                                <TableHead className="font-bold text-foreground">Identifier</TableHead>
                                                <TableHead className="font-bold text-foreground">System Role</TableHead>
                                                <TableHead className="font-bold text-foreground">District / Assignment</TableHead>
                                                <TableHead className="text-right pr-6">Edit</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {allAccounts.map((acc) => (
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
                                                        <div className="flex items-center gap-2 text-sm">
                                                            <Fingerprint className="h-3 v-3 text-muted-foreground" />
                                                            <span className="font-medium text-xs font-mono">{acc.email}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={acc.role === 'Admin' ? 'destructive' : acc.role === 'Manager' ? 'default' : 'secondary'}>
                                                            {acc.role}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-sm font-medium text-muted-foreground">
                                                        {acc.district}
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => setEditingAccount({ uid: acc.uid, firstName: acc.firstName, lastName: acc.lastName, managerId: acc.managerId, email: acc.email })}
                                                        >
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="sample-allocation">
                        <Q4AllocationView readOnly={false} />
                    </TabsContent>
                </Tabs>
            </main>

            <Dialog open={!!editingAccount} onOpenChange={(open) => !open && setEditingAccount(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-headline">Modify Employee Record</DialogTitle>
                        <DialogDescription>Update employee display names and their assigned territory manager.</DialogDescription>
                    </DialogHeader>
                    {editingAccount && (
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="firstName">First Name</Label>
                                <Input 
                                    id="firstName" 
                                    value={editingAccount.firstName} 
                                    onChange={(e) => setEditingAccount({ ...editingAccount, firstName: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="lastName">Last Name</Label>
                                <Input 
                                    id="lastName" 
                                    value={editingAccount.lastName} 
                                    onChange={(e) => setEditingAccount({ ...editingAccount, lastName: e.target.value })}
                                />
                            </div>
                             <div className="grid gap-2">
                                <Label htmlFor="email">Technical Identifier (Email)</Label>
                                <Input 
                                    id="email" 
                                    value={editingAccount.email} 
                                    onChange={(e) => setEditingAccount({ ...editingAccount, email: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="manager">District DSM</Label>
                                <Select 
                                    value={editingAccount.managerId || ''} 
                                    onValueChange={(v) => setEditingAccount({ ...editingAccount, managerId: v })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Unassigned / National" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">National / Unassigned</SelectItem>
                                        {managers.map(m => (
                                            <SelectItem key={m.uid} value={m.uid}>{m.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setEditingAccount(null)}>Cancel</Button>
                        <Button onClick={handleSaveAccount}>Update Profile</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
