
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ADMIN_UIDS } from '@/lib/admins';
import { Button } from '@/components/ui/button';
import { LogOut, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function AdminPage() {
    const { user, loading, logout } = useAuth();
    const router = useRouter();
    const isUserAdmin = user && ADMIN_UIDS.includes(user.uid);

    useEffect(() => {
        if (!loading && !isUserAdmin) {
            router.push('/');
        }
    }, [user, loading, isUserAdmin, router]);

    if (loading || !isUserAdmin) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p>Loading or redirecting...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground">
             <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b md:px-6 bg-background/80 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <ShieldCheck className="w-8 h-8 text-primary" />
                    <h1 className="text-xl font-bold md:text-2xl font-headline text-primary">Admin Dashboard</h1>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground hidden sm:inline">{user.email}</span>
                     <Link href="/">
                        <Button size="sm" variant="outline" className="font-headline">
                            User View
                        </Button>
                    </Link>
                    <Button size="sm" variant="outline" className="font-headline" onClick={logout}>
                        <LogOut className="mr-2"/>
                        Logout
                    </Button>
                </div>
            </header>
            <main className="flex-1 p-4 md:p-6">
                <div className="text-center">
                    <h2 className="text-2xl font-semibold">Welcome, Admin!</h2>
                    <p className="text-muted-foreground">This is the placeholder for the admin dashboard content.</p>
                </div>
            </main>
        </div>
    );
}
