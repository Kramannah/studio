
"use client"

import { useState, useRef, useMemo, useEffect, useCallback } from "react";
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
    FileSpreadsheet, 
    AlertCircle, 
    PackageCheck,
    RefreshCw,
    TrendingUp,
    Filter,
    Trash2,
    ChevronLeft,
    ChevronRight,
    History
} from "lucide-react";
import { useQ4Allocation } from "@/hooks/use-q4-allocation";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import type { Q4Allocation, CoverageEntry } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Q4AllocationViewProps {
    readOnly?: boolean;
}

export function Q4AllocationView({ readOnly = false }: Q4AllocationViewProps) {
    const { allocations, loading: dataLoading, refetch, addAllocationsBulk, deleteAllocationsBulk } = useQ4Allocation();
    const { toast } = useToast();
    
    const [activeQuarter, setActiveQuarter] = useState<'Q3' | 'Q4'>('Q4');
    const [search, setSearch] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [isFetchingUsage, setIsFetchingUsage] = useState(false);
    const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchAllUsage = useCallback(async () => {
        setIsFetchingUsage(true);
        try {
            const entriesSnap = await getDocs(query(collection(db, "coverageEntries")));
            const entries = entriesSnap.docs.map(d => d.data() as CoverageEntry);
            
            const usage: Record<string, number> = {};
            entries.forEach(entry => {
                if (entry.primarySampleName && entry.primaryProductQty) {
                    usage[entry.primarySampleName] = (usage[entry.primarySampleName] || 0) + Number(entry.primaryProductQty);
                }
                if (entry.secondarySampleName && entry.secondaryProductQty) {
                    usage[entry.secondarySampleName] = (usage[entry.secondarySampleName] || 0) + Number(entry.secondaryProductQty);
                }
                entry.reminderProducts?.forEach(prod => {
                    if (prod.sampleName && prod.quantity) {
                        usage[prod.sampleName] = (usage[prod.sampleName] || 0) + Number(prod.quantity);
                    }
                });
            });
            setUsedQuantities(usage);
        } catch (error) {
            console.error("Error fetching usage data:", error);
        } finally {
            setIsFetchingUsage(false);
        }
    }, []);

    useEffect(() => {
        fetchAllUsage();
    }, [fetchAllUsage]);

    const filteredSamples = useMemo(() => {
        return allocations.filter(s => {
            const matchesQuarter = s.quarter === activeQuarter || (!s.quarter && activeQuarter === 'Q4');
            const matchesSearch = s.displayMaterialName.toLowerCase().includes(search.toLowerCase()) ||
                                 s.prodGroupProdSubGroup.toLowerCase().includes(search.toLowerCase());
            return matchesQuarter && matchesSearch;
        });
    }, [allocations, search, activeQuarter]);

    const totalPages = Math.ceil(filteredSamples.length / itemsPerPage);
    const paginatedSamples = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredSamples.slice(start, start + itemsPerPage);
    }, [filteredSamples, currentPage]);

    useEffect(() => {
        setCurrentPage(1);
        setSelectedIds([]);
    }, [search, activeQuarter]);

    const stats = useMemo(() => {
        const quarterAllocations = allocations.filter(s => s.quarter === activeQuarter || (!s.quarter && activeQuarter === 'Q4'));
        let totalAllocated = 0;
        let totalUsed = 0;
        
        quarterAllocations.forEach(s => {
            totalAllocated += s.allocationQuantity || 0;
            totalUsed += usedQuantities[s.displayMaterialName] || 0;
        });

        return {
            totalAllocated,
            totalUsed,
            remaining: totalAllocated - totalUsed,
            percent: totalAllocated > 0 ? Math.round((totalUsed / totalAllocated) * 100) : 0
        };
    }, [allocations, usedQuantities, activeQuarter]);

    const handleDownloadTemplate = () => {
        const headers = ['ProdGroupProdSubGroup', 'DisplayMaterialName', 'AllocationQuantity'];
        const sampleData = [
            { 'ProdGroupProdSubGroup': 'Antihistamine - Ricam Syrup', 'DisplayMaterialName': 'PQ3_Frutos Candy', 'AllocationQuantity': 180 },
            { 'ProdGroupProdSubGroup': 'Antihistamine - Ricam Tablet', 'DisplayMaterialName': 'PQ3_Pistachio with Ricam Sticker', 'AllocationQuantity': 675 }
        ];
        const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
        XLSX.writeFile(workbook, `${activeQuarter}_Allocation_Template.xlsx`);
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

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

                if (json.length < 2) {
                    toast({ variant: "destructive", title: "Empty File", description: "Your file contains no data rows." });
                    setIsUploading(false);
                    return;
                }

                const headerRow = json[0].map((h: any) => String(h || '').toLowerCase().trim().replace(/\s/g, ''));
                const bodyRows = json.slice(1);

                const colMap = {
                    group: headerRow.findIndex((h: string) => h.includes('prodgroupprodsubgroup')),
                    name: headerRow.findIndex((h: string) => h.includes('displaymaterialname')),
                    qty: headerRow.findIndex((h: string) => h.includes('allocationquantity'))
                };

                if (colMap.name === -1 || colMap.qty === -1) {
                    toast({ 
                        variant: "destructive", 
                        title: "Format Error", 
                        description: "Column headers must match the template exactly." 
                    });
                    setIsUploading(false);
                    return;
                }

                const samplesToAdd: Omit<Q4Allocation, 'id'>[] = [];
                for (const row of bodyRows) {
                    const name = String(row[colMap.name] || '').trim();
                    const group = colMap.group > -1 ? String(row[colMap.group] || '').trim() : "Uncategorized";
                    const qty = parseInt(String(row[colMap.qty] || '0').replace(/[^0-9]/g, ''));

                    if (name && !isNaN(qty)) {
                        samplesToAdd.push({ 
                            prodGroupProdSubGroup: group, 
                            displayMaterialName: name, 
                            allocationQuantity: qty 
                        });
                    }
                }

                if (samplesToAdd.length > 0) {
                    const success = await addAllocationsBulk(samplesToAdd, activeQuarter);
                    if (success) {
                        toast({ title: "Import Successful", description: `${samplesToAdd.length} items added to ${activeQuarter}.` });
                        refetch();
                    }
                }
            } catch (err) {
                toast({ variant: "destructive", title: "Error", description: "Could not parse Excel file." });
            } finally {
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(paginatedSamples.map(s => s.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectRow = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds(prev => [...prev, id]);
        } else {
            setSelectedIds(prev => prev.filter(i => i !== id));
        }
    };

    const handleDeleteSelected = async () => {
        const success = await deleteAllocationsBulk(selectedIds);
        if (success) {
            setSelectedIds([]);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
             <Tabs value={activeQuarter} onValueChange={(v) => setActiveQuarter(v as any)} className="w-full">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                    <TabsList className="bg-muted/50 p-1 rounded-xl border-2 h-14 w-full sm:w-[300px]">
                        <TabsTrigger value="Q3" className="flex-1 rounded-lg font-headline text-lg">Q3 Batch</TabsTrigger>
                        <TabsTrigger value="Q4" className="flex-1 rounded-lg font-headline text-lg">Q4 Batch</TabsTrigger>
                    </TabsList>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 w-full">
                        <Card className="border-2 shadow-sm bg-primary/5 p-3 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-primary uppercase tracking-widest">Initial</span>
                                <span className="text-xl font-black font-mono leading-none">{stats.totalAllocated}</span>
                            </div>
                            <PackageCheck className="w-5 h-5 text-primary opacity-30" />
                        </Card>
                        <Card className="border-2 shadow-sm bg-orange-500/5 p-3 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Used</span>
                                <span className="text-xl font-black font-mono leading-none text-orange-500">{stats.totalUsed}</span>
                            </div>
                            <TrendingUp className="w-5 h-5 text-orange-500 opacity-30" />
                        </Card>
                        <Card className="border-2 shadow-sm bg-green-500/5 p-3 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-green-500 uppercase tracking-widest">Balance</span>
                                <span className="text-xl font-black font-mono leading-none text-green-500">{stats.remaining}</span>
                            </div>
                            <History className="w-5 h-5 text-green-500 opacity-30" />
                        </Card>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                    <div className={cn("space-y-6", readOnly ? "lg:col-span-3" : "lg:col-span-2")}>
                        <Card className="border-2 shadow-lg overflow-hidden">
                            <CardHeader className="bg-muted/30 border-b pb-6">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="space-y-1">
                                        <CardTitle className="text-xl font-black font-headline">Batch Oversight: {activeQuarter}</CardTitle>
                                        <CardDescription>{readOnly ? 'Live status of your sample inventory for the current period.' : 'Monitoring inventory for current batch period.'}</CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2 w-full max-w-sm">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                            <Input 
                                                placeholder="Search products..." 
                                                className="pl-10 h-11 border-2 focus-visible:ring-primary rounded-xl"
                                                value={search}
                                                onChange={(e) => setSearch(e.target.value)}
                                            />
                                        </div>
                                        {selectedIds.length > 0 && !readOnly && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="destructive" size="icon" className="h-11 w-11 shrink-0 rounded-xl animate-in zoom-in duration-200">
                                                        <Trash2 className="h-5 w-5" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete {selectedIds.length} Products?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This will remove these products from the {activeQuarter} list.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={handleDeleteSelected} className="bg-destructive text-destructive-foreground">Delete Permanentely</AlertDialogAction>
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
                                                {!readOnly && (
                                                    <TableHead className="w-12 pl-6">
                                                        <Checkbox 
                                                            checked={selectedIds.length > 0 && selectedIds.length === paginatedSamples.length}
                                                            onCheckedChange={handleSelectAll}
                                                        />
                                                    </TableHead>
                                                )}
                                                <TableHead className={cn("font-bold text-foreground", readOnly && "pl-6")}>Material Name</TableHead>
                                                <TableHead className="text-center font-bold text-foreground w-24">Alloc</TableHead>
                                                <TableHead className="text-center font-bold text-foreground w-24">Used</TableHead>
                                                <TableHead className="text-center font-bold text-foreground w-32 pr-6">Remaining</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {dataLoading ? (
                                                <TableRow><TableCell colSpan={5} className="h-64 text-center"><Loader2 className="animate-spin mx-auto text-primary" /><p className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Syncing...</p></TableCell></TableRow>
                                            ) : paginatedSamples.length > 0 ? (
                                                paginatedSamples.map((sample) => {
                                                    const used = usedQuantities[sample.displayMaterialName] || 0;
                                                    const balance = sample.allocationQuantity - used;
                                                    return (
                                                        <TableRow key={sample.id} className="h-16 hover:bg-muted/30 border-b last:border-0">
                                                            {!readOnly && (
                                                                <TableCell className="pl-6">
                                                                    <Checkbox 
                                                                        checked={selectedIds.includes(sample.id)}
                                                                        onCheckedChange={(checked) => handleSelectRow(sample.id, !!checked)}
                                                                    />
                                                                </TableCell>
                                                            )}
                                                            <TableCell className={cn(readOnly && "pl-6")}>
                                                                <div className="flex flex-col">
                                                                    <span className="font-medium text-sm">{sample.displayMaterialName}</span>
                                                                    <span className="text-[10px] uppercase font-bold text-primary opacity-70">{sample.prodGroupProdSubGroup}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-center font-mono">{sample.allocationQuantity}</TableCell>
                                                            <TableCell className="text-center font-mono text-orange-500">{used}</TableCell>
                                                            <TableCell className="text-center pr-6">
                                                                <Badge variant={balance <= 0 ? "destructive" : "outline"} className={cn(
                                                                    "font-black font-mono text-base px-3 h-8 min-w-[60px] flex items-center justify-center",
                                                                    balance > 0 && "bg-green-500/10 text-green-500 border-green-500/20"
                                                                )}>
                                                                    {balance}
                                                                </Badge>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            ) : (
                                                <TableRow><TableCell colSpan={5} className="h-64 text-center text-muted-foreground italic">No products found for {activeQuarter}.</TableCell></TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                        
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-1">
                                <p className="text-sm text-muted-foreground">
                                    Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="border-2 rounded-xl h-10"><ChevronLeft className="h-4 w-4" /></Button>
                                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="border-2 rounded-xl h-10"><ChevronRight className="h-4 w-4" /></Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {!readOnly && (
                        <div className="space-y-6">
                            <Card className="border-2 shadow-lg bg-primary/5">
                                <CardHeader>
                                    <CardTitle className="font-headline text-lg flex items-center gap-2 text-primary">
                                        <PackagePlus className="w-5 h-5" />
                                        Import {activeQuarter}
                                    </CardTitle>
                                    <CardDescription>Populate Batch {activeQuarter} via Excel.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <Button onClick={handleDownloadTemplate} variant="outline" className="w-full border-2 h-11 font-headline">
                                        <FileDown className="mr-2 h-4 w-4" /> Get Template
                                    </Button>
                                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls, .csv" />
                                    <Button onClick={handleUploadClick} disabled={isUploading} className="w-full h-11 font-headline shadow-lg">
                                        {isUploading ? <Loader2 className="animate-spin" /> : <><Download className="mr-2 h-4 w-4 rotate-180" /> Bulk Upload</>}
                                    </Button>
                                    <Button variant="ghost" onClick={fetchAllUsage} disabled={isFetchingUsage} className="w-full h-10 text-xs uppercase font-bold tracking-widest">
                                        <RefreshCw className={cn("mr-2 h-3 w-3", isFetchingUsage && "animate-spin")} /> Refresh Tracker
                                    </Button>
                                </CardContent>
                            </Card>

                            <Alert className="border-2 bg-muted/30">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle className="font-headline font-bold">Import Guide</AlertTitle>
                                <AlertDescription className="text-xs leading-normal opacity-70">
                                    Headers required: <strong>ProdGroupProdSubGroup</strong>, <strong>DisplayMaterialName</strong>, and <strong>AllocationQuantity</strong>.
                                </AlertDescription>
                            </Alert>
                        </div>
                    )}
                </div>
             </Tabs>
        </div>
    );
}
