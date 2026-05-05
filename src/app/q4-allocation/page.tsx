'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, Search, PackageCheck, TrendingUp, Info, RefreshCw, Filter } from 'lucide-react';
import { useMarketingSamples } from '@/hooks/use-marketing-samples';
import { cn } from '@/lib/utils';

export default function Q4AllocationPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { marketingSamples, usedQuantities, loading: dataLoading, refetch } = useMarketingSamples();
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/');
        }
    }, [user, authLoading, router]);

    const filteredSamples = useMemo(() => {
        return marketingSamples.filter(s => 
            s.materialName.toLowerCase().includes(search.toLowerCase()) ||
            s.productGroup.toLowerCase().includes(search.toLowerCase())
        );
    }, [marketingSamples, search]);

    const stats = useMemo(() => {
        let totalAllocated = 0;
        let totalUsed = 0;
        filteredSamples.forEach(s => {
            totalAllocated += s.allocationQuantity;
            totalUsed += (usedQuantities[s.materialName] || 0);
        });
        return {
            totalAllocated,
            totalUsed,
            remaining: totalAllocated - totalUsed,
            percent: totalAllocated > 0 ? Math.round((totalUsed / totalAllocated) * 100) : 0
        };
    }, [filteredSamples, usedQuantities]);

    if (authLoading) return <div className="flex items-center justify-center min-h-screen"><RefreshCw className="animate-spin text-primary w-12 h-12" /></div>;

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col w-full">
            <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm px-4 py-4 md:px-8">
                <div className="flex items-center justify-between max-w-[1600px] mx-auto w-full">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => router.back()}>
                            <ChevronLeft className="w-6 h-6" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-black font-headline text-primary tracking-tight">Q4 Batch 1 Allocation</h1>
                            <p className="text-sm text-muted-foreground font-medium uppercase tracking-widest">Inventory Oversight & Distribution</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => refetch()} disabled={dataLoading}>
                        <RefreshCw className={cn("mr-2 h-4 w-4", dataLoading && "animate-spin")} />
                        Refresh Data
                    </Button>
                </div>
            </header>

            <main className="flex-1 p-4 md:p-8 max-w-[1600px] mx-auto w-full space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="border-2 shadow-sm bg-primary/5">
                        <CardHeader className="pb-2">
                            <CardDescription className="font-headline font-bold text-primary flex items-center gap-2 uppercase tracking-tighter">
                                <PackageCheck className="w-4 h-4" /> Total Batch Allocation
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black font-mono">{stats.totalAllocated} <span className="text-sm font-normal text-muted-foreground">units</span></div>
                        </CardContent>
                    </Card>
                    <Card className="border-2 shadow-sm bg-orange-500/5">
                        <CardHeader className="pb-2">
                            <CardDescription className="font-headline font-bold text-orange-500 flex items-center gap-2 uppercase tracking-tighter">
                                <TrendingUp className="w-4 h-4" /> Current Distribution
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black font-mono text-orange-500">{stats.totalUsed} <span className="text-sm font-normal text-muted-foreground">units ({stats.percent}%)</span></div>
                        </CardContent>
                    </Card>
                    <Card className="border-2 shadow-sm bg-green-500/5">
                        <CardHeader className="pb-2">
                            <CardDescription className="font-headline font-bold text-green-500 flex items-center gap-2 uppercase tracking-tighter">
                                <Filter className="w-4 h-4" /> Remaining Stock
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black font-mono text-green-500">{stats.remaining} <span className="text-sm font-normal text-muted-foreground">units</span></div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="border-2 shadow-lg rounded-2xl overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b pb-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <CardTitle className="text-xl font-black font-headline">Product Allocation List</CardTitle>
                                <CardDescription>Detailed monitoring for the 54-item Q4 Batch 1 inventory.</CardDescription>
                            </div>
                            <div className="relative max-w-md w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <Input 
                                    placeholder="Search material or group..." 
                                    className="pl-10 h-11 border-2 focus-visible:ring-primary rounded-xl"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/20">
                                    <TableRow className="h-12 hover:bg-transparent">
                                        <TableHead className="font-bold text-foreground pl-6">Product Group</TableHead>
                                        <TableHead className="font-bold text-foreground">Material Name</TableHead>
                                        <TableHead className="text-center font-bold text-foreground">Initial Alloc</TableHead>
                                        <TableHead className="text-center font-bold text-foreground">Distributed</TableHead>
                                        <TableHead className="text-center font-bold text-foreground pr-6">Balance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dataLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-64 text-center">
                                                <RefreshCw className="w-10 h-10 animate-spin mx-auto text-primary opacity-20" />
                                                <p className="mt-4 text-muted-foreground font-headline font-bold uppercase tracking-widest text-xs">Loading Secure Data...</p>
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredSamples.length > 0 ? (
                                        filteredSamples.map((sample) => {
                                            const distributed = usedQuantities[sample.materialName] || 0;
                                            const balance = sample.allocationQuantity - distributed;
                                            return (
                                                <TableRow key={sample.id} className="h-16 hover:bg-muted/30 border-b">
                                                    <TableCell className="pl-6 font-bold text-primary">{sample.productGroup}</TableCell>
                                                    <TableCell className="font-medium">{sample.materialName}</TableCell>
                                                    <TableCell className="text-center font-mono">{sample.allocationQuantity}</TableCell>
                                                    <TableCell className="text-center font-mono text-orange-500">{distributed}</TableCell>
                                                    <TableCell className="text-center pr-6">
                                                        <Badge variant={balance <= 0 ? "destructive" : "secondary"} className={cn(
                                                            "font-black font-mono text-base px-3 h-8 min-w-[50px] flex items-center justify-center",
                                                            balance > 0 && "bg-green-500/10 text-green-500 border-green-500/20"
                                                        )}>
                                                            {balance}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-64 text-center">
                                                <div className="flex flex-col items-center justify-center opacity-30">
                                                    <Search className="w-16 h-16 mb-2" />
                                                    <p className="font-headline font-bold uppercase tracking-widest">No matching samples found</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-xl border-2">
                    <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="text-xs text-muted-foreground leading-relaxed">
                        <p className="font-bold text-foreground mb-1 uppercase tracking-tight">Technical Policy Reminder</p>
                        <p>This oversight list reflects distribution data synced from the <span className="font-bold text-primary">SFE Offline Coverage</span> engine. Allocation balances are calculated based on the primary, secondary, and reminder products issued during provider visits. Ensure all pending offline records are synced to maintain data accuracy.</p>
                    </div>
                </div>
            </main>
        </div>
    );
}