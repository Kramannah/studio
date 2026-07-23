
'use client';

import { useState, useMemo } from 'react';
import { useUserProfiles } from '@/hooks/use-user-profiles';
import { useQ4Allocation } from '@/hooks/use-q4-allocation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, UserCheck, RefreshCw, Edit, Save, X, Globe, UserCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export function IndividualAllocationManager() {
    const { profiles, loading: profilesLoading } = useUserProfiles();
    const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined);
    const [search, setSearch] = useState('');
    const [editingSampleId, setEditingSampleId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>('');
    const [isSaving, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    const { allocations, usedQuantities, loading: dataLoading, saveOverride, refetch } = useQ4Allocation(true, true, selectedUserId);

    const pmrList = useMemo(() => {
        return Object.values(profiles)
            .filter(p => p.role === 'PMR' || !p.role)
            .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));
    }, [profiles]);

    const filteredAllocations = useMemo(() => {
        const q = search.toLowerCase().trim();
        return allocations.filter(a => 
            a.displayMaterialName.toLowerCase().includes(q) || 
            a.prodGroupProdSubGroup.toLowerCase().includes(q)
        );
    }, [allocations, search]);

    const handleStartEdit = (sampleId: string, currentQty: number) => {
        setEditingSampleId(sampleId);
        setEditValue(currentQty.toString());
    };

    const handleSaveOverride = async (sampleId: string) => {
        if (!selectedUserId) return;
        const qty = parseInt(editValue, 10);
        if (isNaN(qty)) {
            toast({ variant: "destructive", title: "Invalid Quantity" });
            return;
        }

        setIsSubmitting(true);
        const success = await saveOverride(sampleId, qty);
        if (success) {
            toast({ title: "Override Saved", description: "Representative bag updated." });
            setEditingSampleId(null);
        }
        setIsSubmitting(false);
    };

    return (
        <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-6 py-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                        <CardTitle className="font-headline text-xl flex items-center gap-2">
                            <UserCheck className="text-primary" /> Target Representative
                        </CardTitle>
                        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                            <SelectTrigger className="h-12 border-2 text-lg font-headline">
                                <SelectValue placeholder="Select PMR to manage..." />
                            </SelectTrigger>
                            <SelectContent>
                                {pmrList.map(pmr => (
                                    <SelectItem key={pmr.userId} value={pmr.userId}>
                                        {pmr.code ? `[${pmr.code}] ` : ""}{pmr.lastName}, {pmr.firstName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className={cn("space-y-3", !selectedUserId && "opacity-50 pointer-events-none")}>
                        <CardTitle className="font-headline text-xl">Quick Search</CardTitle>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                            <Input 
                                placeholder="Search by product or group..." 
                                className="pl-10 h-12 border-2"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="px-6">
                {!selectedUserId ? (
                    <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed rounded-3xl bg-muted/20">
                        <Users className="w-12 h-12 text-muted-foreground mb-4" />
                        <p className="text-muted-foreground font-headline">Please select a representative to manage their bag overrides.</p>
                    </div>
                ) : (
                    <div className="border-2 rounded-3xl overflow-hidden bg-background shadow-xl">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="h-14">
                                    <TableHead className="font-bold pl-6">Material Name</TableHead>
                                    <TableHead className="text-center font-bold">Allocation Status</TableHead>
                                    <TableHead className="text-center font-bold">PMR Usage</TableHead>
                                    <TableHead className="text-center font-bold">Remaining</TableHead>
                                    <TableHead className="text-right pr-6">Manage Bag</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {dataLoading && filteredAllocations.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="h-64 text-center"><RefreshCw className="animate-spin mx-auto text-primary" /></TableCell></TableRow>
                                ) : filteredAllocations.length > 0 ? (
                                    filteredAllocations.map((sample) => {
                                        const isEditing = editingSampleId === sample.id;
                                        const used = usedQuantities[sample.displayMaterialName.toLowerCase()] || 0;
                                        const bal = Math.max(0, sample.allocationQuantity - used);
                                        
                                        return (
                                            <TableRow key={sample.id} className="h-20 hover:bg-muted/30 transition-colors">
                                                <TableCell className="pl-6">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-sm">{sample.displayMaterialName}</span>
                                                        <span className="text-[10px] font-black uppercase text-primary opacity-60 tracking-widest">{sample.prodGroupProdSubGroup}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {isEditing ? (
                                                        <Input 
                                                            type="number" 
                                                            value={editValue} 
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            className="w-24 mx-auto font-mono font-bold text-center border-2 border-primary"
                                                            autoFocus
                                                        />
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <span className="font-mono font-black text-lg">{sample.allocationQuantity}</span>
                                                            {sample.isOverridden ? (
                                                                <Badge variant="outline" className="text-[9px] uppercase font-black bg-orange-500/10 text-orange-600 border-orange-200">
                                                                    <UserCircle2 className="w-2.5 h-2.5 mr-1" /> Individual
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="text-[9px] uppercase font-black bg-blue-500/10 text-blue-600 border-blue-200">
                                                                    <Globe className="w-2.5 h-2.5 mr-1" /> Global
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center font-mono font-bold text-muted-foreground">{used}</TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={bal <= 0 ? "destructive" : "secondary"} className="font-mono font-black h-8 px-4 text-base">
                                                        {bal}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    {isEditing ? (
                                                        <div className="flex justify-end gap-2">
                                                            <Button size="icon" variant="ghost" onClick={() => setEditingSampleId(null)} disabled={isSaving}><X className="w-4 h-4" /></Button>
                                                            <Button size="icon" onClick={() => handleSaveOverride(sample.id)} disabled={isSaving}>
                                                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <Button variant="ghost" size="icon" onClick={() => handleStartEdit(sample.id, sample.allocationQuantity)} className="rounded-full h-10 w-10">
                                                            <Edit className="w-4 h-4 text-muted-foreground" />
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                ) : (
                                    <TableRow><TableCell colSpan={5} className="h-64 text-center text-muted-foreground italic">No materials matching search.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
