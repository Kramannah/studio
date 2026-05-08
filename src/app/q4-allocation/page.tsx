"use client"

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, Search, PackageCheck, TrendingUp, RefreshCw, Filter } from 'lucide-react';
import { useMarketingSamples } from '@/hooks/use-marketing-samples';
import { cn } from '@/lib/utils';

export default function Q4AllocationPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { marketingSamples, usedQuantities, loading: dataLoading, refetch } = useMarketingSamples();
    const [search, setSearch] = useState('');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!authLoading && !user && mounted) router.push('/');
    }, [user, authLoading, router, mounted]);

    const filteredSamples = useMemo(() => {
        const q = String(search || "").toLowerCase().trim();
        return (marketingSamples || []).filter(s => {
            if (!s) return false;
            const name = String(s.materialName || "").toLowerCase();
            const group = String(s.productGroup || "").toLowerCase();
            return name.includes(q) || group.includes(q);
        });
    }, [marketingSamples, search]);

    const stats = useMemo(() => {
        let totalAllocated = 0, totalUsed = 0;
        filteredSamples.forEach(s => {
            totalAllocated += s.allocationQuantity || 0;
            totalUsed += usedQuantities[s.materialName] || 0;
        });
        const remaining = Math.max(0, totalAllocated - totalUsed);
        const percent = totalAllocated > 0 ? Math.round((totalUsed / totalAllocated) * 100) : 0;
        return { totalAllocated, totalUsed, remaining, percent };
    }, [filteredSamples, usedQuantities]);

    if (!mounted || authLoading) return (
        <div className="flex items-center justify-center min-h-screen bg-background">
            <RefreshCw className="animate-spin text-primary w-12 h-12" />
        </div>
    );

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col w-full">
            <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm px-4 py-4 md:px-8">
                <div className="flex items-center justify-between max-w-[1600px] mx-auto w-full">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => router.back()}><ChevronLeft className="w-6 h-6" /></Button>
                        <div>
                            <h1 className="text-2xl font-black font-headline text-primary tracking-tight">Marketing Material Oversight</h1>
                            <p className="text-sm text-muted-foreground font-medium uppercase tracking-widest">Inventory Analytics</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => refetch()} disabled={dataLoading}>
                        <RefreshCw className={cn("mr-2 h-4 w-4", dataLoading && "animate-spin")} />
                        Refresh
                    </Button>
                </div>
            </header>

            <main className="flex-1 p-4 md:p-8 max-w-[1600px] mx-auto w-full space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="border-2 shadow-sm bg-primary/5 p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-primary uppercase tracking-widest">Total Allocated</p>
                            <p className="text-3xl font-black font-mono">{stats.totalAllocated}</p>
                        </div>
                        <PackageCheck className="w-8 h-8 text-primary opacity-20" />
                    </Card>
                    <Card className="border-2 shadow-sm bg-orange-500/5 p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Units Issued</p>
                            <p className="text-3xl font-black font-mono text-orange-500">{stats.totalUsed} <span className="text-xs">({stats.percent}%)</span></p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-orange-500 opacity-20" />
                    </Card>
                    <Card className="border-2 shadow-sm bg-green-500/5 p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-green-500 uppercase tracking-widest">Balance</p>
                            <p className="text-3xl font-black font-mono text-green-500">{stats.remaining}</p>
                        </div>
                        <Filter className="w-8 h-8 text-green-500 opacity-20" />
                    </Card>
                </div>

                <Card className="border-2 shadow-lg rounded-2xl overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <CardTitle className="text-xl font-black font-headline">Distribution List</CardTitle>
                            <div className="relative max-w-md w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <Input 
                                    placeholder="Search products..." 
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
                                    <TableRow className="h-12">
                                        <TableHead className="font-bold text-foreground pl-6">Material Name</TableHead>
                                        <TableHead className="text-center font-bold text-foreground w-32">Alloc</TableHead>
                                        <TableHead className="text-center font-bold text-foreground w-32">Issued</TableHead>
                                        <TableHead className="text-center font-bold text-foreground w-32 pr-6">Balance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dataLoading ? (
                                        <TableRow><TableCell colSpan={4} className="h-64 text-center"><RefreshCw className="animate-spin mx-auto text-primary" /></TableCell></TableRow>
                                    ) : filteredSamples.length > 0 ? (
                                        filteredSamples.map((sample) => {
                                            const distributed = usedQuantities[sample.materialName] || 0;
                                            const balance = Math.max(0, sample.allocationQuantity - distributed);
                                            return (
                                                <TableRow key={sample.id} className="h-16 hover:bg-muted/30 border-b">
                                                    <TableCell className="pl-6">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-sm">{String(sample.materialName || "Unknown")}</span>
                                                            <span className="text-[10px] font-black uppercase text-primary opacity-70">{String(sample.productGroup || "Uncategorized")}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center font-mono">{sample.allocationQuantity}</TableCell>
                                                    <TableCell className="text-center font-mono text-orange-500">{distributed}</TableCell>
                                                    <TableCell className="text-center pr-6">
                                                        <Badge variant={balance <= 0 ? "destructive" : "outline"} className="font-black font-mono text-base px-3 h-8 min-w-[60px] flex items-center justify-center">
                                                            {balance}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    ) : (
                                        <TableRow><TableCell colSpan={4} className="h-64 text-center text-muted-foreground italic">No matching materials.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}