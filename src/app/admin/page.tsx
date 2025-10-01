
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ADMIN_UIDS, MANAGER_TEAMS } from '@/lib/admins';
import { Button } from '@/components/ui/button';
import { LogOut, ShieldCheck, Users, X } from 'lucide-react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserDashboard } from '@/components/user-dashboard';
import { useAdminData } from '@/hooks/use-admin-data';
import { MarketingList } from '@/components/marketing-list';
import { useAdminMarketingSamples, useMarketingSamples } from '@/hooks/use-marketing-samples';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CallSummary } from '@/components/call-summary';
import { USER_DATA_MAP } from '@/lib/user-data';

export default function AdminPage() {
    const { user, loading, logout } = useAuth();
    const router = useRouter();
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('reports');

    const { 
        allEntries, 
        allDoctors, 
        allPlans, 
        allNonCallDays, 
        allTimeLogs, 
        loading: dataLoading,
        deleteEntry,
        fetchAllData,
    } = useAdminData();
    
    const { marketingSamples, usedQuantities, loading: marketingSamplesLoading, refetch: refetchMarketingSamples } = useMarketingSamples();
    const { addMarketingSamplesBulk } = useAdminMarketingSamples();

    const isUserAdmin = useMemo(() => user && ADMIN_UIDS.includes(user.uid), [user]);
    const isUserManager = useMemo(() => user && Object.keys(MANAGER_TEAMS).includes(user.uid), [user]);
    const hasAdminAccess = isUserAdmin || isUserManager;

    const managedUserIds = useMemo(() => {
        if (isUserAdmin) {
            const allUserIds = [
                ...allEntries.map(e => e.userId),
                ...allDoctors.map(d => d.userId),
                ...allPlans.map(p => p.userId),
                ...allNonCallDays.map(n => n.userId),
                ...allTimeLogs.map(t => t.userId)
            ];
            return Array.from(new Set(allUserIds));
        }
        if (isUserManager && user) {
            return MANAGER_TEAMS[user.uid] || [];
        }
        return [];
    }, [isUserAdmin, isUserManager, user, allEntries, allDoctors, allPlans, allNonCallDays, allTimeLogs]);


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
        return map;
    }, [managedUserIds]);

    const filteredData = useMemo(() => {
        if (!isUserManager) return { allEntries, allDoctors, allPlans, allNonCallDays, allTimeLogs };

        return {
            allEntries: allEntries.filter(e => managedUserIds.includes(e.userId)),
            allDoctors: allDoctors.filter(d => managedUserIds.includes(d.userId)),
            allPlans: allPlans.filter(p => managedUserIds.includes(p.userId)),
            allNonCallDays: allNonCallDays.filter(ncd => managedUserIds.includes(ncd.userId)),
            allTimeLogs: allTimeLogs.filter(tl => managedUserIds.includes(tl.userId)),
        }
    }, [isUserManager, managedUserIds, allEntries, allDoctors, allPlans, allNonCallDays, allTimeLogs]);

    useEffect(() => {
        if (!loading && !hasAdminAccess) {
            router.push('/');
        }
    }, [user, loading, hasAdminAccess, router]);
    
    const handleAddSamples = async (samples: any) => {
        const success = await addMarketingSamplesBulk(samples);
        if (success) {
            refetchMarketingSamples();
        }
        return success;
    }

    if (loading || !hasAdminAccess) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p>Loading or redirecting...</p>
            </div>
        );
    }
    
    const handleUserSelect = (userId: string) => {
        if (userId === "all") {
            setSelectedUserId(null);
        } else {
            setSelectedUserId(userId);
        }
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
                    <span className="text-sm text-muted-foreground hidden sm:inline">{user.email}</span>
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
                        <TabsTrigger value="reports">User Reports</TabsTrigger>
                        <TabsTrigger value="marketing">Marketing Samples</TabsTrigger>
                    </TabsList>
                    <TabsContent value="reports" className="mt-6">
                        <Card className="mb-6">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 font-headline">
                                    <Users />
                                    User Filter
                                </CardTitle>
                                <CardDescription>Select a user to view their detailed dashboard or view all reports.</CardDescription>
                                <div className="flex items-center gap-2 pt-2">
                                    <Select onValueChange={handleUserSelect} value={selectedUserId || 'all'}>
                                        <SelectTrigger className="w-[350px]">
                                            <SelectValue placeholder="Select a user..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Users</SelectItem>
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
                            </CardHeader>
                        </Card>

                        {dataLoading ? (
                            <div className="flex items-center justify-center mt-10">
                                <RefreshCw className="w-12 h-12 animate-spin text-primary" />
                            </div>
                        ) : selectedUserId ? (
                            <UserDashboard 
                                userId={selectedUserId}
                                allEntries={filteredData.allEntries}
                                allDoctors={filteredData.allDoctors}
                                allPlans={filteredData.allPlans}
                                allNonCallDays={filteredData.allNonCallDays}
                                allTimeLogs={filteredData.allTimeLogs}
                                allMarketingSamples={marketingSamples}
                            />
                        ) : (
                           <CallSummary 
                                entries={filteredData.allEntries}
                                doctors={filteredData.allDoctors}
                                nonCallDays={filteredData.allNonCallDays}
                                timeLogs={filteredData.allTimeLogs}
                                isAdminView={true}
                           />
                        )}
                    </TabsContent>
                    <TabsContent value="marketing" className="mt-6">
                        <MarketingList
                            samples={marketingSamples}
                            usedQuantities={usedQuantities}
                            onAddSamplesBulk={handleAddSamples}
                            readOnly={!isUserAdmin} // Only super admins can manage samples
                            loading={marketingSamplesLoading}
                            onRefresh={refetchMarketingSamples}
                        />
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}
