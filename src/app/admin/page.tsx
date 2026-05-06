'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from '@/lib/admins';
import { Button } from '@/components/ui/button';
import { ShieldCheck, X, User, UserCog, Search, Pencil, Save, Loader2, Fingerprint, RefreshCw, AlertCircle } from 'lucide-react';
import Link from 'next/link';
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
import { Q4AllocationView } from '@/components/q4-allocation-view';
import { useUserProfiles } from '@/hooks/use-user-profiles';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { getDocs, collection, query, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

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
    const { profiles, updateProfile, loading: profilesLoading, refetch: refetchProfiles } = useUserProfiles();
    
    const [selectedManagerId, setSelectedManagerId] = useState<string | undefined>(undefined);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('district-reports');
    const [accountSearch, setAccountSearch] = useState('');
    const [discoveredUids, setDiscoveredUids] = useState<string[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    
    const [editingAccount, setEditingAccount] = useState<{uid: string, firstName: string, lastName: string, managerId?: string, email?: string} | null>(null);
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    const isUserAdmin = useMemo(() => {
        if (!user) return false;
        const email = user.email?.toLowerCase() || '';
        return ADMIN_UIDS.includes(user.uid) || email === 'mbustamante@hovidinc.com' || ADMIN_EMAILS.some(e => e.toLowerCase() === email);
    }, [user]);

    const isUserManager = useMemo(() => user && Object.keys(MANAGER_TEAMS).includes(user.uid), [user]);
    const hasAdminAccess = isUserAdmin || isUserManager;

    // GLOBAL DISCOVERY: Scans all core collections for any unique User IDs
    const runDiscoveryScan = useCallback(async () => {
        if (!hasAdminAccess || !db) return;
        setIsScanning(true);
        try {
            const uids = new Set<string>();
            
            // 1. Scan Coverage Entries (Most common source)
            const coverageSnap = await getDocs(query(collection(db, "coverageEntries"), limit(1000)));
            coverageSnap.docs.forEach(doc => uids.add(doc.data().userId));
            
            // 2. Scan Plans
            const planSnap = await getDocs(query(collection(db, "plans"), limit(500)));
            planSnap.docs.forEach(doc => uids.add(doc.data().userId));

            // 3. Scan existing Profiles (The source of truth)
            const profileSnap = await getDocs(collection(db, "userProfiles"));
            profileSnap.docs.forEach(doc => uids.add(doc.id));

            setDiscoveredUids(Array.from(uids));
        } catch (e) {
            console.warn("Discovery scan restricted:", e);
        } finally {
            setIsScanning(false);
        }
    }, [hasAdminAccess]);

    useEffect(() => {
        if (hasAdminAccess) runDiscoveryScan();
    }, [hasAdminAccess, runDiscoveryScan]);

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

    // MERGED USER DIRECTORY: Source of truth for the entire dashboard
    const mergedUserMap = useMemo(() => {
        const map: Record<string, { code: string; firstName: string; lastName: string; email: string }> = { ...USER_DATA_MAP };
        
        // 1. Add all discovered UIDs from collection scans
        discoveredUids.forEach(uid => {
            if (!map[uid]) {
                map[uid] = {
                    code: "NEW",
                    firstName: "Discovered",
                    lastName: "User",
                    email: "Confirming Identity..."
                };
            }
        });

        // 2. Override with Firestore Profiles (Persisted Edits)
        Object.values(profiles).forEach(profile => {
            const uid = profile.userId;
            const existing = map[uid] || {};
            map[uid] = {
                code: profile.code || existing.code || "NEW",
                firstName: profile.firstName || existing.firstName || "New",
                lastName: profile.lastName || existing.lastName || "User",
                email: profile.email || existing.email || "No Email Found"
            };
        });
        return map;
    }, [profiles, discoveredUids]);

    const allAccounts = useMemo(() => {
        const all = Object.entries(mergedUserMap).map(([uid, data]) => {
            const isAdmin = ADMIN_UIDS.includes(uid);
            const isManager = Object.keys(MANAGER_TEAMS).includes(uid);
            let role = 'PMR';
            if (isAdmin) role = 'Admin';
            else if (isManager) role = 'Manager';

            let district = 'N/A';
            const customManagerId = profiles[uid]?.managerId;
            const managerUid = customManagerId || Object.keys(MANAGER_TEAMS).find(mId => MANAGER_TEAMS[mId].includes(uid));
            
            if (role === 'PMR') {
                if (managerUid) {
                    const mData = mergedUserMap[managerUid];
                    district = mData ? `${mData.firstName} ${mData.lastName}` : 'DSM Assigned';
                }
            } else if (role === 'Manager') {
                district = 'District Sales Manager';
            } else if (role === 'Admin') {
                district = 'National / HQ';
            }

            return { uid, ...data, role, district, managerId: managerUid };
        });

        if (!accountSearch.trim()) return all.sort((a, b) => a.lastName.localeCompare(b.lastName));

        const q = accountSearch.toLowerCase();
        return all.filter(a => 
            a.code.toLowerCase().includes(q) || 
            a.firstName.toLowerCase().includes(q) || 
            a.lastName.toLowerCase().includes(q) ||
            a.role.toLowerCase().includes(q) ||
            a.district.toLowerCase().includes(q) ||
            (a.email && a.email.toLowerCase().includes(q))
        ).sort((a, b) => a.lastName.localeCompare(b.lastName));
    }, [accountSearch, mergedUserMap, profiles]);

    const managedUserIds = useMemo(() => {
        if (!selectedManagerId) return [];
        const baseSet = new Set(MANAGER_TEAMS[selectedManagerId] || []);
        Object.values(profiles).forEach(p => { if (p.managerId === selectedManagerId) baseSet.add(p.userId); });
        Object.values(profiles).forEach(p => { if (p.managerId && p.managerId !== selectedManagerId && baseSet.has(p.userId)) baseSet.delete(p.userId); });
        return Array.from(baseSet);
    }, [selectedManagerId, profiles]);

    const userMapForSelection = useMemo(() => {
        const map = new Map<string, string>();
        managedUserIds.forEach((id) => {
            const u = mergedUserMap[id];
            map.set(id, u ? `${u.code}_${u.lastName}, ${u.firstName}` : `User ${id.substring(0, 6)}...`);
        });
        return new Map([...map.entries()].sort((a, b) => a[1].localeCompare(b[1])));
    }, [managedUserIds, mergedUserMap]);

    const handleSaveAccount = async () => {
        if (!editingAccount) return;
        setIsSavingProfile(true);
        const success = await updateProfile(
            editingAccount.uid, 
            editingAccount.firstName, 
            editingAccount.lastName, 
            editingAccount.managerId,
            editingAccount.email
        );
        if (success) {
            setEditingAccount(null);
            await runDiscoveryScan();
        }
        setIsSavingProfile(false);
    };

    useEffect(() => {
        if (!authLoading && !hasAdminAccess) router.push('/');
    }, [authLoading, hasAdminAccess, router]);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <RefreshCw className="w-12 h-12 animate-spin text-primary" />
                <p className="ml-4 font-headline">Loading Dashboard...</p>
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
                    {user && (
                        <div className="flex flex-col items-end px-3 py-1 bg-muted/30 rounded-lg border border-primary/10">
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">ADMIN SESSION</span>
                            <div className="flex items-center gap-1.5">
                                <User className="w-3 h-3 text-primary" />
                                <span className="text-sm font-bold text-primary truncate max-w-[200px]">{user.email}</span>
                            </div>
                        </div>
                    )}
                    <Button size="sm" variant="destructive" className="font-headline" onClick={() => logout()}>Logout</Button>
                </div>
            </header>

            <main className="flex-1 p-4 md:p-6 lg:p-8 w-full max-w-[1600px] mx-auto">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="bg-muted/50 p-1 rounded-xl border-2 w-full justify-start sm:w-fit mb-8">
                        <TabsTrigger value="district-reports" className="px-6 rounded-lg font-headline">District Reports</TabsTrigger>
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
                                userMap={mergedUserMap}
                                isAdminView={true}
                                onAddDoctor={(d) => addDoctor({ ...d, userId: selectedUserId })}
                                onUpdateDoctor={updateDoctor}
                                onDeleteDoctor={deleteDoctor}
                            />
                        ) : (
                            <Alert className="border-2">
                                <AlertCircle className="w-4 h-4 text-primary" />
                                <AlertTitle className="font-headline">Representative Insight</AlertTitle>
                                <AlertDescription>Select a specific PMR to view their full masterlist and coverage timeline.</AlertDescription>
                            </Alert>
                        )}
                    </TabsContent>

                    <TabsContent value="accounts">
                         <Card className="border-2 shadow-lg rounded-2xl overflow-hidden">
                            <CardHeader className="bg-muted/30 border-b pb-6">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="space-y-1">
                                        <CardTitle className="text-xl font-black font-headline flex items-center gap-2">
                                            <UserCog className="text-primary" /> Registered User Directory
                                        </CardTitle>
                                        <CardDescription>Every account that has accessed the system is listed here. Manage identities and DSM assignments.</CardDescription>
                                    </div>
                                    <div className="flex items-center gap-3 w-full max-w-md">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                            <Input 
                                                placeholder="Search by name, code, or identifier..." 
                                                className="pl-10 h-11 border-2 focus-visible:ring-primary rounded-xl"
                                                value={accountSearch}
                                                onChange={(e) => setAccountSearch(e.target.value)}
                                            />
                                        </div>
                                        <Button variant="outline" size="icon" onClick={() => runDiscoveryScan()} disabled={isScanning} className="h-11 w-11 rounded-xl border-2">
                                            <RefreshCw className={cn("w-4 h-4", isScanning && "animate-spin")} />
                                        </Button>
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
                                                <TableHead className="font-bold text-foreground">Identifier (Auth)</TableHead>
                                                <TableHead className="font-bold text-foreground">System Role</TableHead>
                                                <TableHead className="font-bold text-foreground">District / Assignment</TableHead>
                                                <TableHead className="text-right font-bold text-foreground pr-6">Actions</TableHead>
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
                                                            <div className="flex items-center gap-2 text-sm">
                                                                <Fingerprint className="h-3 w-3 text-muted-foreground" />
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
                                                                onClick={() => setEditingAccount({ 
                                                                    uid: acc.uid, 
                                                                    firstName: acc.firstName, 
                                                                    lastName: acc.lastName,
                                                                    managerId: acc.managerId,
                                                                    email: acc.email
                                                                })}
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow><TableCell colSpan={6} className="h-64 text-center">No accounts discovered yet.</TableCell></TableRow>
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
                </Tabs>
            </main>

            <Dialog open={!!editingAccount} onOpenChange={(open) => !open && setEditingAccount(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-headline text-xl">Edit Account Profile</DialogTitle>
                        <DialogDescription>Update employee identity and territory assignment.</DialogDescription>
                    </DialogHeader>
                    {editingAccount && (
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="firstName" className="text-right">First Name</Label>
                                <Input id="firstName" className="col-span-3" value={editingAccount.firstName} onChange={(e) => setEditingAccount({...editingAccount, firstName: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="lastName" className="text-right">Last Name</Label>
                                <Input id="lastName" className="col-span-3" value={editingAccount.lastName} onChange={(e) => setEditingAccount({...editingAccount, lastName: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="email" className="text-right">Identifier</Label>
                                <Input id="email" className="col-span-3 font-mono text-xs" value={editingAccount.email || ""} placeholder="email@hovidinc.com" onChange={(e) => setEditingAccount({...editingAccount, email: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="manager" className="text-right">District DSM</Label>
                                <div className="col-span-3">
                                    <Select value={editingAccount.managerId || ""} onValueChange={(val) => setEditingAccount({...editingAccount, managerId: val})}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select District Manager..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {managers.map(m => (
                                                <SelectItem key={m.uid} value={m.uid}>{m.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setEditingAccount(null)}>Cancel</Button>
                        <Button onClick={handleSaveAccount} disabled={isSavingProfile}>
                            {isSavingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
