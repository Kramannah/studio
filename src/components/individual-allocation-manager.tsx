
'use client';

import { useState, useMemo } from 'react';
import { useUserProfiles } from '@/hooks/use-user-profiles';
import { useQ4Allocation } from '@/hooks/use-q4-allocation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, UserCheck, RefreshCw, Plus, Trash2, UserCircle2, Loader2, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { IndividualAllocationDialog } from './individual-allocation-dialog';

export function IndividualAllocationManager() {
    const { profiles, loading: profilesLoading } = useUserProfiles();
    const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined);
    const [search, setSearch] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const { toast } = useToast();

    const { allocations: globalAllocations, individualAssignments, loading: dataLoading, saveAssignment, deleteAssignment, refetch } = useQ4Allocation(true, false, selectedUserId);

    const pmrList = useMemo(() => {
        return Object.values(profiles)
            .filter(p => p.role === 'PMR' || !p.role)
            .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));
    }, [profiles]);

    const activeAssignments = useMemo(() => {
        const q = search.toLowerCase().trim();
        return individualAssignments.map(a => {
            const sample = globalAllocations.find(s => s.id === a.sampleId);
            return {
                ...a,
                materialName: sample?.displayMaterialName || "Deleted Product",
                productGroup: sample?.prodGroupProdSubGroup || "Unknown Group"
            };
        }).filter(a => 
            a.materialName.toLowerCase().includes(q) || 
            a.productGroup.toLowerCase().includes(q)
        ).sort((a, b) => a.materialName.localeCompare(b.materialName));
    }, [individualAssignments, globalAllocations, search]);

    const handleAddAssignment = async (sampleId: string, quantity: number) => {
        if (!selectedUserId) return;
        const success = await saveAssignment(sampleId, quantity);
        if (success) {
            toast({ title: "Assignment Saved", description: "Representative bag updated." });
            setIsDialogOpen(false);
        }
    };

    const handleDelete = async (id: string) => {
        const success = await deleteAssignment(id);
        if (success) {
            toast({ variant: "destructive", title: "Assignment Removed" });
        }
    };

    return (
        <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-6 py-8">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
                    <div className="space-y-3 w-full lg:max-w-md">
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

                    <div className={cn("flex flex-col sm:flex-row items-center gap-3 w-full lg:max-w-2xl", !selectedUserId && "opacity-50 pointer-events-none")}>
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                            <input 
                                placeholder="Search assigned materials..." 
                                className="pl-10 h-12 w-full border-2 rounded-xl focus:outline-none focus:border-primary bg-background"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <Button 
                            onClick={() => setIsDialogOpen(true)} 
                            className="h-12 rounded-xl font-headline px-6 shadow-lg whitespace-nowrap w-full sm:w-auto"
                        >
                            <Plus className="mr-2 h-5 w-5" /> Assign Product
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="px-6">
                {!selectedUserId ? (
                    <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed rounded-[2rem] bg-muted/20">
                        <UserCircle2 className="w-16 h-16 text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground font-headline text-lg">Select a representative to view their specific bag assignments.</p>
                    </div>
                ) : (
                    <div className="border-2 rounded-[2rem] overflow-hidden bg-background shadow-xl">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="h-14">
                                    <TableHead className="font-bold pl-6">Material Name</TableHead>
                                    <TableHead className="font-bold">Product Group</TableHead>
                                    <TableHead className="text-center font-bold">Assigned Quantity</TableHead>
                                    <TableHead className="text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {dataLoading ? (
                                    <TableRow><TableCell colSpan={4} className="h-64 text-center"><RefreshCw className="animate-spin mx-auto text-primary" /></TableCell></TableRow>
                                ) : activeAssignments.length > 0 ? (
                                    activeAssignments.map((assignment) => (
                                        <TableRow key={assignment.id} className="h-20 hover:bg-muted/10 transition-colors">
                                            <TableCell className="pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center">
                                                        <Package className="w-5 h-5 text-primary/40" />
                                                    </div>
                                                    <span className="font-bold text-sm">{assignment.materialName}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-[10px] font-black uppercase text-primary/60 border-primary/20">
                                                    {assignment.productGroup}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className="font-mono font-black text-2xl">{assignment.quantity}</span>
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    onClick={() => handleDelete(assignment.id)}
                                                    className="text-destructive hover:bg-destructive/10 h-10 w-10 rounded-full"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-64 text-center py-20">
                                            <div className="max-w-xs mx-auto space-y-2">
                                                <p className="text-muted-foreground font-headline text-lg">No specific assignments found.</p>
                                                <p className="text-xs text-muted-foreground uppercase font-black tracking-widest leading-relaxed">
                                                    This representative is currently using the global distribution template for all materials.
                                                </p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>

            <IndividualAllocationDialog 
                isOpen={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                onSave={handleAddAssignment}
                globalAllocations={globalAllocations}
            />
        </Card>
    );
}
