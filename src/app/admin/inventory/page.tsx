'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { ADMIN_UIDS, ADMIN_EMAILS } from '@/lib/admins';
import { Button } from '@/components/ui/button';
import { ChevronLeft, PackageCheck, RefreshCw, User, Globe, X, Users } from 'lucide-react';
import { Q4AllocationView } from '@/components/q4-allocation-view';
import { useUserProfiles } from '@/hooks/use-user-profiles';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AdminInventoryPage() {
    const { user, profile, loading: authLoading, logout } = useAuth();
    const { profiles, loading: profilesLoading } = useUserProfiles();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    const isUserAdmin = useMemo(() => {
        if (!user) return false;
        const email = (user.email ?? "").toLowerCase();
        return ADMIN_UIDS.includes(user.uid) || 
               email === 'mbustamante@hovidinc.com' || 
               ADMIN_EMAILS.some(e => (e ?? "").toLowerCase() === email) ||
               ['Admin', 'Marketing', 'HR'].includes(profile?.role || '');
    }, [user, profile]);

    useEffect(() => {
        if (mounted && !authLoading && !isUserAdmin) router.push('/');
    }, [authLoading, isUserAdmin, router, mounted]);

    const pmrList = useMemo(() => {
        return Object.values(profiles)
            .filter(p => p.role === 'PMR' || !p.role)
            .sort((a, b) => {
                const nameA = `${a.lastName}, ${a.firstName}`.toLowerCase();
                const nameB = `${b.lastName}, ${b.firstName}`.toLowerCase();
                return nameA.localeCompare(nameB);
            });
    }, [profiles]);

    if (!mounted || authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <RefreshCw className="w-12 h-12 animate-spin text-primary" />
                <p className="ml-4 font-headline font-bold text-primary">Accessing Samples Database...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground w-full">
            <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 border-b md:px-6 bg-background/80 backdrop-blur-sm w-full">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
                        <ChevronLeft className="w-6 h-6" />
                    </Button>
                    <div className="flex items-center gap-2">
                        <PackageCheck className="w-8 h-8 text-primary" />
                        <h1 className="text-xl font-bold md:text-2xl font-headline text-primary tracking-tight">
                            Marketing Samples
                        </h1>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="hidden sm:flex flex-col items-end px-3 py-1 bg-muted/30 rounded-lg border border-primary/10">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">SECURE ACCESS</span>
                        <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-primary" />
                            <span className="text-sm font-bold text-primary truncate max-w-[200px]">{user?.email}</span>
                        </div>
                    </div>
                    <Button size="sm" variant="destructive" className="font-headline" onClick={() => logout()}>Logout</Button>
                </div>
            </header>

            <main className="flex-1 p-4 md:p-6 lg:p-8 w-full max-w-[1600px] mx-auto">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                    <div className="space-y-1">
                        <h2 className="text-3xl font-black font-headline text-primary">Inventory Management</h2>
                        <p className="text-muted-foreground">Manage the global distribution template or set individual representative overrides.</p>
                    </div>

                    <div className="w-full max-w-sm space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Target Bag Context</label>
                        <div className="flex items-center gap-2">
                            <Select 
                                value={selectedUserId || 'global'} 
                                onValueChange={(v) => setSelectedUserId(v === 'global' ? null : v)}
                            >
                                <SelectTrigger className="h-12 border-2 rounded-xl font-headline bg-card shadow-sm">
                                    <SelectValue placeholder="Select Context..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="global" className="font-bold text-primary">
                                        <div className="flex items-center gap-2">
                                            <Globe className="w-4 h-4" />
                                            <span>Global Template (All PMRs)</span>
                                        </div>
                                    </SelectItem>
                                    <div className="h-px bg-muted my-1" />
                                    <div className="px-2 py-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Individual Reps</div>
                                    {pmrList.map(pmr => (
                                        <SelectItem key={pmr.userId} value={pmr.userId}>
                                            {pmr.code || 'PMR'} - {pmr.lastName}, {pmr.firstName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedUserId && (
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => setSelectedUserId(null)} 
                                    className="h-12 w-12 rounded-xl border-2 shrink-0"
                                    title="Reset to Global"
                                >
                                    <X className="w-5 h-5" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-muted/5 rounded-[2rem] border-2 border-dashed border-primary/10 p-1">
                    <Q4AllocationView readOnly={false} userId={selectedUserId || undefined} />
                </div>
            </main>
        </div>
    );
}
