
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from '@/lib/admins';
import { Button } from '@/components/ui/button';
import { ShieldCheck, X, User, UserCog, Search, RefreshCw, AlertCircle, Fingerprint, Pencil, UserPlus, Trash2, MapPin, KeyRound, Loader2, PackageCheck, ArrowRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAdminData } from '@/hooks/use-admin-data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { USER_DATA_MAP } from '@/lib/user-data';
import { Badge } from '@/components/ui/badge';
import { managers } from '@/lib/managers';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { NonCallDayApprovals } from '@/components/non-call-day-approvals';
import { PlanningRequestApprovals } from '@/components/planning-request-approvals';
import { useUserProfiles } from '@/hooks/use-user-profiles';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { firebaseConfig } from '@/firebase/config';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { format } from 'date-fns';

// Static import for offline availability
import { UserDashboard } from '@/components/user-dashboard';

const DynamicSkeleton = ({ message = "Accessing Firestore Records..." }) => (
    <div className="flex items-center justify-center mt-10 w-full p-20 border-2 border-dashed rounded-2xl bg-muted/5">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        <p className="ml-4 font-headline font-bold text-muted-foreground uppercase tracking-widest text-sm">{message}</p>
    </div>
);

export default function AdminPage() {
    const { user, profile, loading: authLoading, logout } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const { profiles, updateProfile, addProfile, deleteProfile } = useUserProfiles();
    
    const [selectedManagerId, setSelectedManagerId] = useState<string | undefined>(undefined);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
    const [accountSearch, setAccountSearch] = useState('');
    const [activeTab, setActiveTab] = useState('district-reports');
    
    const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
    const [isAddRecordOpen, setIsAddRecordOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const [editingAccount, setEditingAccount] = useState<{ uid: string; firstName: string; lastName: string; managerId?: string; email: string; code?: string; role?: 'Admin' | 'Manager' | 'PMR' | 'Marketing' | 'HR' } | null>(null);
    const [newAccount, setNewAccount] = useState({ uid: '', firstName: '', lastName: '', code: '', email: '', password: '', managerId: '', role: 'PMR' as any });
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const isUserAdmin = useMemo(() => {
        if (!user) return false;
        const email = (user.email ?? "").toLowerCase();
        return ADMIN_UIDS.includes(user.uid) || 
               email === 'mbustamante@hovidinc.com' || 
               ADMIN_EMAILS.some(e => (e ?? "").toLowerCase() === email) ||
               profile?.role === 'Admin';
    }, [user, profile]);

    const isUserManager = useMemo(() => {
        if (!user) return false;
        return Object.keys(MANAGER_TEAMS).includes(user.uid) || profile?.role === 'Manager';
    }, [user, profile]);

    const isMarketingOrHR = useMemo(() => {
        return profile?.role === 'Marketing' || profile?.role === 'HR';
    }, [profile]);

    const hasAdminAccess = isUserAdmin || isUserManager || isMarketingOrHR;

    const { 
        allEntries: individualEntries,
        allDoctors: individualDoctors,
        allPlans: individualPlans,
        allTimeLogs: individualTimeLogs,
        allNonCallDaysIndividual,
        individualPlanningRequests,
        individualUsedQuantities,
        individualAvailableMonths,
        allNonCallDays,
        allPlanningRequests,
        updateNonCallDayStatus,
        updatePlanningRequestStatus,
        loadingIndividual,
        loadingApprovals,
        fetchUserData,
        fetchTeamApprovals
    } = useAdminData(selectedManagerId, profiles, mounted);

    useEffect(() => {
        if (!mounted || !hasAdminAccess) return;
        
        if (activeTab === 'district-reports') {
            if (selectedUserId) {
                // Reverted to standard fetch without month parameter to undo Targeted Fetching
                fetchUserData(selectedUserId);
            }
        } else if (activeTab === 'approvals' && !isMarketingOrHR) {
            fetchTeamApprovals();
        }
    }, [activeTab, selectedUserId, selectedManagerId, fetchUserData, fetchTeamApprovals, mounted, hasAdminAccess, isMarketingOrHR]);

    const mergedUserMap = useMemo(() => {
        const map: Record<string, { code: string; firstName: string; lastName: string; email: string }> = { ...USER_DATA_MAP };
        Object.entries(profiles).forEach(([uid, p]) => {
            map[uid] = {
                code: p.code || map[uid]?.code || "USER",
                firstName: p.firstName || map[uid]?.firstName || "Unknown",
                lastName: p.lastName || map[uid]?.lastName || "",
                email: p.email || map[uid]?.email || ""
            };
        });
        return map;
    }, [profiles]);

    const allAccounts = useMemo(() => {
        const all = Object.entries(mergedUserMap).map(([uid, data]) => {
            const userProfile = profiles[uid];
            const isAdmin = ADMIN_UIDS.includes(uid) || userProfile?.role === 'Admin';
            const isManager = Object.keys(MANAGER_TEAMS).includes(uid) || userProfile?.role === 'Manager';
            
            let role: string = userProfile?.role || 'PMR';
            if (isAdmin) role = 'Admin';
            else if (isManager) role = 'Manager';

            let district = 'N/A';
            const managerUid = userProfile?.managerId || Object.keys(MANAGER_TEAMS).find(mId => (MANAGER_TEAMS[mId] || []).includes(uid));
            
            if (role === 'PMR') {
                if (managerUid) {
                    const mData = mergedUserMap[managerUid];
                    district = mData ? `${mData.firstName} ${mData.lastName}` : 'DSM Assigned';
                } else {
                    district = 'Unassigned / HQ';
                }
            } else if (role === 'Manager') {
                district = 'District Sales Manager';
            } else if (role === 'Admin') {
                district = 'National / HQ';
            } else {
                district = 'Corporate / Specialty';
            }

            return { uid, ...data, role, district, managerId: managerUid };
        });

        const q = (accountSearch ?? "").toLowerCase().trim();
        const sorted = all.sort((a, b) => (a.lastName ?? "").localeCompare(b.lastName ?? ""));

        if (!q) return sorted;

        return sorted.filter(a => {
            return (a.code ?? "").toLowerCase().includes(q) || 
                   (a.firstName ?? "").toLowerCase().includes(q) || 
                   (a.lastName ?? "").toLowerCase().includes(q) ||
                   (a.role ?? "").toLowerCase().includes(q) ||
                   (a.district ?? "").toLowerCase().includes(q) ||
                   (a.email ?? "").toLowerCase().includes(q);
        });
    }, [accountSearch, profiles, mergedUserMap]);

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
            const u = mergedUserMap[id];
            map.set(id, u ? `${u.code || 'PMR'}_${u.lastName}, ${u.firstName}` : `User ${id}`);
        });
        return new Map([...map.entries()].sort((a, b) => a[1].localeCompare(b[1])));
    }, [managedUserIds, mergedUserMap]);

    useEffect(() => {
        if (mounted && !authLoading && !hasAdminAccess) router.push('/');
    }, [authLoading, hasAdminAccess, router, mounted]);

    const handleSaveAccount = async () => {
        if (!editingAccount) return;
        const success = await updateProfile(
            editingAccount.uid, 
            editingAccount.firstName, 
            editingAccount.lastName, 
            editingAccount.managerId,
            editingAccount.email,
            editingAccount.role
        );
        if (success) setEditingAccount(null);
    };

    const handleCreateAccount = async () => {
        if (!newAccount.firstName || !newAccount.email) {
            toast({ variant: "destructive", title: "Missing Fields", description: "First Name and Email are required." });
            return;
        }

        setIsProcessing(true);
        let finalUid = newAccount.uid;

        try {
            if (isCreateAccountOpen) {
                if (!newAccount.password || newAccount.password.length < 6) {
                    toast({ variant: "destructive", title: "Weak Password", description: "Password must be at least 6 characters." });
                    setIsProcessing(false);
                    return;
                }

                const tempAppName = `registration-${Date.now()}`;
                const tempApp = initializeApp(firebaseConfig, tempAppName);
                const tempAuth = getAuth(tempApp);

                const userCred = await createUserWithEmailAndPassword(tempAuth, newAccount.email, newAccount.password);
                finalUid = userCred.user.uid;
                
                await signOut(tempAuth);
            }

            const success = await addProfile({
                userId: finalUid,
                firstName: newAccount.firstName,
                lastName: newAccount.lastName,
                code: newAccount.code,
                email: newAccount.email,
                managerId: newAccount.managerId,
                role: newAccount.role
            });

            if (success) {
                setIsCreateAccountOpen(false);
                setIsAddRecordOpen(false);
                setNewAccount({ uid: '', firstName: '', lastName: '', code: '', email: '', password: '', managerId: '', role: 'PMR' });
                toast({ title: isCreateAccountOpen ? "Account Registered" : "Record Added", description: "The system has been updated successfully." });
            }
        } catch (error: any) {
            console.error("Account Creation Error:", error);
            toast({ variant: "destructive", title: "Action Failed", description: error.message || "An unexpected error occurred." });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteAccount = async (uid: string) => {
        await deleteProfile(uid);
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
                        {isUserAdmin ? 'Admin Dashboard' : isMarketingOrHR ? `${profile?.role} Dashboard` : 'Manager Dashboard'}
                    </h1>
                </div>
                <div className="flex items-center gap-4">
                    <Link href="/admin/inventory">
                        <Button variant="outline" className="border-primary/20 text-primary font-headline hidden sm:flex items-center gap-2 h-10">
                            <PackageCheck className="w-4 h-4" />
                            Marketing Samples
                        </Button>
                    </Link>
                    <div className="flex flex-col items-end px-3 py-1 bg-muted/30 rounded-lg border border-primary/10">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">SECURE SESSION</span>
                        <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-primary" />
                            <span className="text-sm font-bold text-primary truncate max-w-[200px]">{user?.email}</span>
                        </div>
                    </div>
                    <Button size="sm" variant="destructive" className="font-headline" onClick={() => logout()}>Logout</Button>
                </div>
            </header>

            <main className="flex-1 p-4 md:p-6 lg:p-8 w-full max-w-[1600px] mx-auto">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                        <TabsList className="bg-muted/50 p-1 rounded-xl border-2 w-full justify-start sm:w-fit overflow-x-auto overflow-y-hidden">
                            <TabsTrigger value="district-reports" className="px-6 rounded-lg font-headline">District Reports</TabsTrigger>
                            {!isMarketingOrHR && <TabsTrigger value="approvals" className="px-6 rounded-lg font-headline">Approvals</TabsTrigger>}
                            {!isMarketingOrHR && <TabsTrigger value="accounts" className="px-6 rounded-lg font-headline flex items-center gap-2"><UserCog className="h-4 w-4" /> Accounts</TabsTrigger>}
                        </TabsList>
                    </div>

                    <TabsContent value="district-reports">
                         <Card className="mb-8 border-2 shadow-sm">
                            <CardHeader>
                                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                                     <div className="space-y-3">
                                        <CardTitle className="font-headline text-xl">District Manager</CardTitle>
                                        <OpenSelector onValueChange={setSelectedManagerId} value={selectedManagerId} disabled={!isUserAdmin && !isMarketingOrHR} />
                                    </div>
                                    <div className={cn("space-y-3", !selectedManagerId && "opacity-50 pointer-events-none")}>
                                        <CardTitle className="font-headline text-xl">Representative</CardTitle>
                                        <div className="flex items-center gap-2">
                                            <Select onValueChange={setSelectedUserId} value={selectedUserId || ''}>
                                                <SelectTrigger className="w-full border-2 h-11 font-headline">
                                                    <SelectValue placeholder="Select a Representative..." />
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
                            loadingIndividual ? <DynamicSkeleton message="Loading Individual Representative Data..." /> : (
                             <UserDashboard 
                                key={selectedUserId}
                                userId={selectedUserId}
                                allEntries={individualEntries}
                                allDoctors={individualDoctors}
                                allPlans={individualPlans}
                                allNonCallDays={allNonCallDaysIndividual}
                                allTimeLogs={individualTimeLogs}
                                individualPlanningRequests={individualPlanningRequests}
                                individualAvailableMonths={individualAvailableMonths}
                                onDeleteEntry={() => {}}
                                usedQuantities={individualUsedQuantities}
                                userMap={mergedUserMap}
                                isAdminView={true}
                                onAddDoctor={() => {}}
                                onUpdateDoctor={() => {}}
                                onDeleteDoctor={() => {}}
                                selectedMonth={selectedMonth}
                                onMonthChange={setSelectedMonth}
                            />
                            )
                        ) : selectedManagerId ? (
                            <Alert className="border-2 py-12 flex flex-col items-center text-center">
                                <Search className="w-10 h-10 text-primary mb-4" />
                                <AlertTitle className="font-headline text-xl">Representative Selection Required</AlertTitle>
                                <AlertDescription className="text-lg">Please select a specific representative from the list above to view their individual Submitted Coverage records and masterlist.</AlertDescription>
                            </Alert>
                        ) : (
                            <Alert className="border-2 py-12 flex flex-col items-center text-center">
                                <AlertCircle className="w-10 h-10 text-primary mb-4" />
                                <AlertTitle className="font-headline text-xl">Territory Oversight Required</AlertTitle>
                                <AlertDescription className="text-lg">Please select a District Manager and then a PMR to view individual coverage performance records.</AlertDescription>
                            </Alert>
                        )}
                    </TabsContent>

                    {!isMarketingOrHR && (
                        <TabsContent value="approvals" className="space-y-8">
                            {loadingApprovals ? <DynamicSkeleton message="Refreshing Approval Requests..." /> : (
                                <>
                                    <NonCallDayApprovals 
                                        nonCallDays={allNonCallDays} 
                                        onUpdateStatus={updateNonCallDayStatus}
                                        userMap={mergedUserMap}
                                    />
                                    <PlanningRequestApprovals 
                                        requests={allPlanningRequests}
                                        onUpdateStatus={updatePlanningRequestStatus}
                                        userMap={mergedUserMap}
                                    />
                                </>
                            )}
                        </TabsContent>
                    )}

                    {!isMarketingOrHR && (
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
                                        <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-2xl">
                                            <div className="relative flex-1 w-full">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                                <Input 
                                                    placeholder="Search personnel..." 
                                                    className="pl-10 h-11 border-2 focus-visible:ring-primary rounded-xl"
                                                    value={accountSearch}
                                                    onChange={(e) => setAccountSearch(e.target.value)}
                                                />
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <Button variant="outline" onClick={() => setIsCreateAccountOpen(true)} className="h-11 rounded-xl font-headline">
                                                    <UserPlus className="mr-2 h-4 w-4" />
                                                    Create Account
                                                </Button>
                                                <Button onClick={() => setIsAddRecordOpen(true)} className="h-11 rounded-xl font-headline">
                                                    <MapPin className="mr-2 h-4 w-4" />
                                                    Add Record
                                                </Button>
                                            </div>
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
                                                    <TableHead className="font-bold text-foreground">Identifier (UID)</TableHead>
                                                    <TableHead className="font-bold text-foreground">System Role</TableHead>
                                                    <TableHead className="font-bold text-foreground">Assignment</TableHead>
                                                    <TableHead className="text-right pr-6">Actions</TableHead>
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
                                                                <span className="font-medium text-[10px] font-mono opacity-60">{acc.uid}</span>
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
                                                            <div className="flex justify-end gap-1">
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    onClick={() => setEditingAccount({ uid: acc.uid, firstName: acc.firstName, lastName: acc.lastName, managerId: acc.managerId, email: acc.email, code: acc.code, role: acc.role as any })}
                                                                >
                                                                    <Pencil className="h-4 w-4" />
                                                                </Button>
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button variant="ghost" size="icon" className="text-destructive">
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle>Remove employee record?</AlertDialogTitle>
                                                                            <AlertDialogDescription>This will delete the profile override for {acc.firstName} {acc.lastName}. This action cannot be undone.</AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                            <AlertDialogAction onClick={() => handleDeleteAccount(acc.uid)} className="bg-destructive text-destructive-foreground">Remove Record</AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    )}
                </Tabs>
            </main>

            {/* Create Account Dialog */}
            <Dialog open={isCreateAccountOpen} onOpenChange={(open) => !isProcessing && setIsCreateAccountOpen(open)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="font-headline text-xl">Create System Account</DialogTitle>
                        <DialogDescription>Register a new user in Authentication and define their profile.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>First Name</Label>
                                <Input value={newAccount.firstName} onChange={(e) => setNewAccount({...newAccount, firstName: e.target.value})} placeholder="e.g. John" disabled={isProcessing} />
                            </div>
                            <div className="grid gap-2">
                                <Label>Last Name</Label>
                                <Input value={newAccount.lastName} onChange={(e) => setNewAccount({...newAccount, lastName: e.target.value})} placeholder="e.g. Doe" disabled={isProcessing} />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label>Email Address (Username)</Label>
                            <Input value={newAccount.email} onChange={(e) => setNewAccount({...newAccount, email: e.target.value})} placeholder="user@hovidinc.com" disabled={isProcessing} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Temporary Password</Label>
                            <div className="relative">
                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    type="password" 
                                    value={newAccount.password} 
                                    onChange={(e) => setNewAccount({...newAccount, password: e.target.value})} 
                                    className="pl-10"
                                    placeholder="Min. 6 characters"
                                    disabled={isProcessing}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>System Role</Label>
                                <Select value={newAccount.role} onValueChange={(v: any) => setNewAccount({...newAccount, role: v})} disabled={isProcessing}>
                                    <SelectTrigger><SelectValue placeholder="Select Role..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PMR">Representative (PMR)</SelectItem>
                                        <SelectItem value="Manager">District Manager (DSM)</SelectItem>
                                        <SelectItem value="Admin">Administrator (Admin)</SelectItem>
                                        <SelectItem value="Marketing">Marketing</SelectItem>
                                        <SelectItem value="HR">HR</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>Employee Code</Label>
                                <Input value={newAccount.code} onChange={(e) => setNewAccount({...newAccount, code: e.target.value})} placeholder="e.g. NL-10" disabled={isProcessing} />
                            </div>
                        </div>
                        {newAccount.role === 'PMR' && (
                            <div className="grid gap-2">
                                <Label>Reporting To (DSM)</Label>
                                <Select value={newAccount.managerId} onValueChange={(v) => setNewAccount({...newAccount, managerId: v})} disabled={isProcessing}>
                                    <SelectTrigger><SelectValue placeholder="Select District..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Unassigned / National</SelectItem>
                                        {managers.map(m => <SelectItem key={m.uid} value={m.uid}>{m.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsCreateAccountOpen(false)} disabled={isProcessing}>Cancel</Button>
                        <Button onClick={handleCreateAccount} disabled={isProcessing}>
                            {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registering...</> : "Register & Create Profile"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Record Dialog */}
            <Dialog open={isAddRecordOpen} onOpenChange={(open) => !isProcessing && setIsAddRecordOpen(open)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-headline">Add District Record</DialogTitle>
                        <DialogDescription>Assign an existing authenticated user to a District Sales Manager.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Existing User UID</Label>
                            <Input 
                                value={newAccount.uid} 
                                onChange={(e) => setNewAccount({...newAccount, uid: e.target.value, role: 'PMR'})} 
                                placeholder="Enter Existing Authentication UID" 
                                disabled={isProcessing}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>First Name</Label>
                                <Input value={newAccount.firstName} onChange={(e) => setNewAccount({...newAccount, firstName: e.target.value})} disabled={isProcessing} />
                            </div>
                            <div className="grid gap-2">
                                <Label>Last Name</Label>
                                <Input value={newAccount.lastName} onChange={(e) => setNewAccount({...newAccount, lastName: e.target.value})} disabled={isProcessing} />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label>Reporting To (District Manager)</Label>
                            <Select value={newAccount.managerId} onValueChange={(v) => setNewAccount({...newAccount, managerId: v})} disabled={isProcessing}>
                                <SelectTrigger><SelectValue placeholder="Select Manager..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">National / Unassigned</SelectItem>
                                    {managers.map(m => <SelectItem key={m.uid} value={m.uid}>{m.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>Employee Code</Label>
                            <Input value={newAccount.code} onChange={(e) => setNewAccount({...newAccount, code: e.target.value})} placeholder="e.g. VIS-10" disabled={isProcessing} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsAddRecordOpen(false)} disabled={isProcessing}>Cancel</Button>
                        <Button onClick={handleCreateAccount} disabled={!newAccount.uid || !newAccount.managerId || newAccount.managerId === 'none' || isProcessing}>
                            {isProcessing ? <Loader2 className="animate-spin" /> : "Assign to District"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Profile Dialog */}
            <Dialog open={!!editingAccount} onOpenChange={(open) => !open && setEditingAccount(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-headline">Modify Employee Record</DialogTitle>
                        <DialogDescription>Update employee display names and their assigned territory manager.</DialogDescription>
                    </DialogHeader>
                    {editingAccount && (
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label>System Role</Label>
                                <Select 
                                    value={editingAccount.role || 'PMR'} 
                                    onValueChange={(v: any) => setEditingAccount({ ...editingAccount, role: v })}
                                >
                                    <SelectTrigger><SelectValue placeholder="Select Role..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PMR">Representative (PMR)</SelectItem>
                                        <SelectItem value="Manager">District Manager (DSM)</SelectItem>
                                        <SelectItem value="Admin">Administrator (Admin)</SelectItem>
                                        <SelectItem value="Marketing">Marketing</SelectItem>
                                        <SelectItem value="HR">HR</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
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
                            </div>
                             <div className="grid gap-2">
                                <Label htmlFor="email">Technical Identifier (Email)</Label>
                                <Input 
                                    id="email" 
                                    value={editingAccount.email} 
                                    onChange={(e) => setEditingAccount({ ...editingAccount, email: e.target.value })}
                                />
                            </div>
                            {editingAccount.role === 'PMR' && (
                                <div className="grid gap-2">
                                    <Label htmlFor="manager">District DSM</Label>
                                    <Select 
                                        value={editingAccount.managerId || 'none'} 
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
                            )}
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

function OpenSelector({ onValueChange, value, disabled }: { onValueChange: (v: string) => void, value?: string, disabled?: boolean }) {
    return (
        <Select onValueChange={onValueChange} value={value} disabled={disabled}>
            <SelectTrigger className="w-full border-2 h-11 font-headline">
                <SelectValue placeholder="Select a DSM..." />
            </SelectTrigger>
            <SelectContent>
                {managers.map(m => <SelectItem key={m.uid} value={m.uid}>{m.name}</SelectItem>)}
            </SelectContent>
        </Select>
    );
}
