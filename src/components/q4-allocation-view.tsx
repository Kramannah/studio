"use client"

import { useState, useRef, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
    PackagePlus, 
    FileDown, 
    Download, 
    Search, 
    Loader2, 
    AlertCircle, 
    PackageCheck,
    RefreshCw,
    TrendingUp,
    Trash2,
    ChevronLeft,
    ChevronRight,
    History
} from "lucide-react";
import { useQ4Allocation } from "@/hooks/use-q4-allocation";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import type { Q4Allocation } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Q4AllocationViewProps {
    readOnly?: boolean;
}

export function Q4AllocationView({ readOnly = false }: Q4AllocationViewProps) {
    const { allocations, usedQuantities, loading: dataLoading, refetch, addAllocationsBulk, deleteAllocationsBulk } = useQ4Allocation();
    const { toast } = useToast();
    
    const [search, setSearch] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [mounted, setMounted] = useState(false);
    const itemsPerPage = 15;
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    const filteredSamples = useMemo(() => {
        if (!mounted || !allocations) return [];
        const q = (search ?? "").toString().toLowerCase().trim();
        
        return allocations.filter(s => {
            if (!s) return false;
            const name = (s.displayMaterialName ?? s.materialName ?? "").toString().toLowerCase();
            const group = (s.prodGroupProdSubGroup ?? s.productGroup ?? "").toString().toLowerCase();
            return name.includes(q) || group.includes(q);
        });
    }, [allocations, search, mounted]);

    const totalPages = Math.max(1, Math.ceil(filteredSamples.length / itemsPerPage));
    const paginatedSamples = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredSamples.slice(start, start + itemsPerPage);
    }, [filteredSamples, currentPage]);

    useEffect(() => {
        setCurrentPage(1);
        setSelectedIds([]);
    }, [search]);

    const stats = useMemo(() => {
        if (!mounted || !allocations) return { totalAllocated: 0, totalUsed: 0, remaining: 0, percent: 0 };

        let totalAllocated = 0;
        let totalUsedCount = 0;
        
        allocations.forEach(s => {
            const nameKey = (s.displayMaterialName ?? s.materialName ?? "").toString().toLowerCase().trim();
            const used = Number(usedQuantities?.[nameKey] || 0);
            totalAllocated += Number(s.allocationQuantity || 0);
            totalUsedCount += used;
        });

        const remaining = Math.max(0, totalAllocated - totalUsedCount);
        const percent = totalAllocated > 0 ? Math.round((totalUsedCount / totalAllocated) * 100) : 0;

        return { totalAllocated, totalUsed: totalUsedCount, remaining, percent };
    }, [allocations, usedQuantities, mounted]);

    const handleDownloadTemplate = () => {
        const headers = ['ProdGroupProdSubGroup', 'DisplayMaterialName', 'AllocationQuantity'];
        const sampleData = [{ 'ProdGroupProdSubGroup': 'Category', 'DisplayMaterialName': 'Sample Item', 'AllocationQuantity': 100 }];
        const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
        XLSX.writeFile(workbook, `Marketing_Samples_Template.xlsx`);
    };

    const handleUploadClick = () => fileInputRef.current?.click();

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const json: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                if (json.length < 2) throw new Error("Empty file");
                const headerRow = json[0].map((h: any) => (h ?? '').toString().toLowerCase().trim());
                const bodyRows = json.slice(1);
                
                const findCol = (keys: string[]) => headerRow.findIndex(h => keys.some(k => (h ?? "").toString().includes(k)));
                
                const colMap = {
                    group: findCol(['prodgroup', 'group', 'category']),
                    name: findCol(['displaymaterial', 'materialname', 'name', 'item']),
                    qty: findCol(['allocation', 'quantity', 'qty'])
                };
                
                if (colMap.name === -1 || colMap.qty === -1) throw new Error("Format mismatch. Please use the provided template.");
                
                const samplesToAdd: Omit<Q4Allocation, 'id'>[] = bodyRows.map(row => ({
                    prodGroupProdSubGroup: (row[colMap.group] ?? "Uncategorized").toString().trim(),
                    displayMaterialName: (row[colMap.name] ?? "").toString().trim(),
                    allocationQuantity: Math.round(Number(String(row[colMap.qty] ?? '0').replace(/[^0-9.]/g, '')))
                })).filter(s => s.displayMaterialName);
                
                if (samplesToAdd.length > 0) {
                    await addAllocationsBulk(samplesToAdd);
                    toast({ title: "Import Successful", description: `${samplesToAdd.length} products updated.` });
                }
            } catch (err) {
                toast({ variant: "destructive", title: "Upload Failed", description: String(err) });
            } finally {
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        };
        reader.readAsArrayBuffer(file);
    };

    if (!mounted) {
        return (
            <div className="flex flex-col items-center justify-center p-20 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Initializing Inventory...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-2 shadow-sm bg-primary/5 p-4 flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-xs font-black text-primary uppercase tracking-widest">Total Allocated</span>
                        <span className="text-3xl font-black font-mono leading-none tabular-nums">{stats.totalAllocated}</span>
                    </div>
                    <PackageCheck className="w-10 h-10 text-primary opacity-30" />
                </Card>
                <Card className="border-2 shadow-sm bg-orange-500/5 p-4 flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-xs font-black text-orange-500 uppercase tracking-widest">Units Issued</span>
                        <span className="text-3xl font-black font-mono leading-none text-orange-500 tabular-nums">{stats.totalUsed}</span>
                    </div>
                    <TrendingUp className="w-10 h-10 text-orange-500 opacity-30" />
                </Card>
                <Card className="border-2 shadow-sm bg-green-500/5 p-4 flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-xs font-black text-green-500 uppercase tracking-widest">Current Balance</span>
                        <span className="text-3xl font-black font-mono leading-none text-green-500 tabular-nums">{stats.remaining}</span>
                    </div>
                    <History className="w-10 h-10 text-green-500 opacity-30" />
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className={cn("space-y-6", readOnly ? "lg:col-span-3" : "lg:col-span-2")}>
                    <Card className="border-2 shadow-lg overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b pb-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <CardTitle className="text-2xl font-black font-headline text-primary">Marketing Samples</CardTitle>
                                    <CardDescription>Live status of sample inventory and distribution.</CardDescription>
                                </div>
                                <div className="flex items-center gap-2 w-full max-w-md">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                        <Input 
                                            placeholder="Search materials or groups..." 
                                            className="pl-10 h-11 border-2 focus-visible:ring-primary rounded-xl"
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                        />
                                    </div>
                                    {selectedIds.length > 0 && !readOnly && (
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="icon" className="h-11 w-11 shrink-0 rounded-xl">
                                                    <Trash2 className="h-5 w-5" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Remove {selectedIds.length} Samples?</AlertDialogTitle>
                                                    <AlertDialogDescription>This action will permanently delete these items from the material list.</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => deleteAllocationsBulk(selectedIds).then(() => setSelectedIds([]))} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-muted/20">
                                        <TableRow className="h-12 hover:bg-transparent">
                                            {!readOnly && <TableHead className="w-12 pl-6" />}
                                            <TableHead className={cn("font-bold text-foreground", readOnly && "pl-6")}>Material Name</TableHead>
                                            <TableHead className="text-center font-bold text-foreground w-24">Alloc</TableHead>
                                            <TableHead className="text-center font-bold text-foreground w-24">Used</TableHead>
                                            <TableHead className="text-center font-bold text-foreground w-32 pr-6">Remaining</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {dataLoading ? (
                                            <TableRow><TableCell colSpan={readOnly ? 4 : 5} className="h-64 text-center"><Loader2 className="animate-spin mx-auto text-primary" /></TableCell></TableRow>
                                        ) : paginatedSamples.length > 0 ? (
                                            paginatedSamples.map((sample) => {
                                                const sId = sample.id;
                                                const name = (sample.displayMaterialName ?? sample.materialName ?? "Unknown Item").toString().trim();
                                                const group = (sample.prodGroupProdSubGroup ?? sample.productGroup ?? "Uncategorized").toString().trim();
                                                
                                                const used = Number(usedQuantities?.[name.toLowerCase().trim()] || 0);
                                                const balance = Math.max(0, Number(sample.allocationQuantity || 0) - used);
                                                
                                                return (
                                                    <TableRow key={sId} className="h-16 hover:bg-muted/30 border-b last:border-0">
                                                        {!readOnly && (
                                                            <TableCell className="pl-6">
                                                                <Checkbox 
                                                                    checked={selectedIds.includes(sId)}
                                                                    onCheckedChange={(checked) => checked ? setSelectedIds(p => [...p, sId]) : setSelectedIds(p => p.filter(i => i !== sId))}
                                                                />
                                                            </TableCell>
                                                        )}
                                                        <TableCell className={cn(readOnly && "pl-6")}>
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-sm">{name}</span>
                                                                <span className="text-[10px] uppercase font-black text-primary opacity-70 tracking-tight">{group}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono tabular-nums font-medium">{Number(sample.allocationQuantity || 0)}</TableCell>
                                                        <TableCell className="text-center font-mono text-orange-500 tabular-nums font-bold">{used}</TableCell>
                                                        <TableCell className="text-center pr-6">
                                                            <Badge variant={balance <= 0 ? "destructive" : "outline"} className="font-black font-mono text-base px-3 h-8 min-w-[50px] flex items-center justify-center tabular-nums shadow-sm">
                                                                {balance}
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        ) : (
                                            <TableRow><TableCell colSpan={readOnly ? 4 : 5} className="h-64 text-center text-muted-foreground italic">No products found matching filters.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                    
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-1">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong></p>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="border-2 rounded-xl h-10 px-4"><ChevronLeft className="h-4 w-4 mr-1" /> Prev</Button>
                                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="border-2 rounded-xl h-10 px-4">Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
                            </div>
                        </div>
                    )}
                </div>

                {!readOnly && (
                    <div className="space-y-6">
                        <Card className="border-2 shadow-lg bg-muted/20">
                            <CardHeader>
                                <CardTitle className="font-black font-headline text-lg">Bulk Sample Upload</CardTitle>
                                <CardDescription>Update the master material list via Excel.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Button onClick={handleDownloadTemplate} variant="outline" className="w-full border-2 h-12 font-headline">
                                    <FileDown className="mr-2 h-5 w-5" /> Download Template
                                </Button>
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls" />
                                <Button onClick={handleUploadClick} disabled={isUploading} className="w-full h-12 font-headline shadow-lg transition-all active:scale-95 bg-primary text-primary-foreground">
                                    {isUploading ? <><Loader2 className="mr-2 animate-spin" /> Processing...</> : <><Download className="mr-2 h-5 w-5 rotate-180" /> Import Material File</>}
                                </Button>
                            </CardContent>
                        </Card>
                        <Button variant="outline" onClick={() => refetch()} disabled={dataLoading} className="w-full border-2 h-12 font-headline shadow-sm">
                            <RefreshCw className={cn("mr-2 h-4 w-4", dataLoading && "animate-spin")} /> Refresh Inventory
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}