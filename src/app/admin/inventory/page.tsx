
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { ADMIN_UIDS, ADMIN_EMAILS } from '@/lib/admins';
import { Button } from '@/components/ui/button';
import { ChevronLeft, PackageCheck, RefreshCw, User, Package, Users } from 'lucide-react';
import { Q4AllocationView } from '@/components/q4-allocation-view';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IndividualAllocationManager } from '@/components/individual-allocation-manager';

export default function AdminInventoryPage() {
    const { user, profile, loading: authLoading, logout } = useAuth();
    const router = useRouter();
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
               ['Admin', 'Marketing', 'HR'].includes(profile?.role || '');
    }, [user, profile]);

    useEffect(() => {
        if (mounted && !authLoading && !isUserAdmin) router.push('/');
    }, [authLoading, isUserAdmin, router, mounted]);

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
                            Inventory Center
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
                <Tabs defaultValue="global" className="w-full">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                        <div className="space-y-1">
                            <h2 className="text-3xl font-black font-headline text-primary">Inventory Management</h2>
                            <p className="text-muted-foreground">Manage global distribution templates or set individual PMR bag assignments.</p>
                        </div>
                        <TabsList className="bg-muted/50 p-1 rounded-xl border-2 grid grid-cols-2 w-full md:w-[400px]">
                            <TabsTrigger value="global" className="rounded-lg font-headline flex items-center gap-2">
                                <Package className="w-4 h-4" /> Global Template
                            </TabsTrigger>
                            <TabsTrigger value="individual" className="rounded-lg font-headline flex items-center gap-2">
                                <Users className="w-4 h-4" /> Individual Bags
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="global">
                        <div className="bg-muted/5 rounded-[2rem] border-2 border-dashed border-primary/10 p-1">
                            <Q4AllocationView readOnly={false} />
                        </div>
                    </TabsContent>

                    <TabsContent value="individual">
                        <div className="bg-muted/5 rounded-[2rem] border-2 border-dashed border-primary/10 p-1">
                            <IndividualAllocationManager />
                        </div>
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}
