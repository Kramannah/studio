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
    ChevronRight
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

export function Q4AllocationView() {
    const { allocations, loading: dataLoading, refetch, addAllocationsBulk, deleteAllocationsBulk } = useQ4Allocation();
    const { toast } = useToast();
    
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
        return allocations.filter(s => 
            s.displayMaterialName.toLowerCase().includes(search.toLowerCase()) ||
            s.prodGroupProdSubGroup.toLowerCase().includes(search.toLowerCase())
        );
    }, [allocations, search]);

    const totalPages = Math.ceil(filteredSamples.length / itemsPerPage);
    const paginatedSamples = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredSamples.slice(start, start + itemsPerPage);
    }, [filteredSamples, currentPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [search]);

    const stats = useMemo(() => {
        let totalAllocated = 0;
        let totalUsed = 0;
        
        allocations.forEach(s => {
            totalAllocated += s.allocationQuantity || 0;
            totalUsed += usedQuantities[s.displayMaterialName] || 0;
        });

        return {
            totalAllocated,
            totalUsed,
            remaining: totalAllocated - totalUsed,
            percent: totalAllocated > 0 ? Math.round((totalUsed / totalAllocated) * 100) : 0
        };
    }, [allocations, usedQuantities]);

    const handleDownloadTemplate = () => {
        const headers = ['ProdGroupProdSubGroup', 'DisplayMaterialName', 'AllocationQuantity'];
        const sampleData = [
            { 'ProdGroupProdSubGroup': 'Antihistamine - Ricam Syrup', 'DisplayMaterialName': 'PQ3_Frutos Candy', 'AllocationQuantity': 180 },
            { 'ProdGroupProdSubGroup': 'Antihistamine - Ricam Tablet', 'DisplayMaterialName': 'PQ3_Pistachio with Ricam Sticker', 'AllocationQuantity': 675 }
        ];
        const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Q4_Template");
        XLSX.writeFile(workbook, "Q4_Batch1_Sample_Template.xlsx");
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
                    const success = await addAllocationsBulk(samplesToAdd);
                    if (success) {
                        toast({ title: "Import Successful", description: `${samplesToAdd.length} items added.` });
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
            setSelectedIds(filteredSamples.map(s => s.id));
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
                            <TrendingUp className="w-4 h-4" /> Current Distribution (Used)
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <Card className="border-2 shadow-lg overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b pb-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-xl font-black font-headline">Q4 Allocation Oversight</CardTitle>
                                        {(dataLoading || isFetchingUsage) && <RefreshCw className="h-4 w-4 animate-spin text-primary" />}
                                    </div>
                                    <CardDescription>Live monitoring of usage vs. allocation.</CardDescription>
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
                                    {selectedIds.length > 0 && (
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="icon" className="h-11 w-11 shrink-0 rounded-xl">
                                                    <Trash2 className="h-5 w-5" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete Products?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Are you sure you want to delete {selectedIds.length} selected product(s)? This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleDeleteSelected} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
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
                                            <TableHead className="w-12 pl-6">
                                                <Checkbox 
                                                    checked={selectedIds.length > 0 && selectedIds.length === filteredSamples.length}
                                                    onCheckedChange={handleSelectAll}
                                                />
                                            </TableHead>
                                            <TableHead className="font-bold text-foreground">Material Name</TableHead>
                                            <TableHead className="text-center font-bold text-foreground w-24">Alloc</TableHead>
                                            <TableHead className="text-center font-bold text-foreground w-24">Used</TableHead>
                                            <TableHead className="text-center font-bold text-foreground w-32 pr-6">Remaining</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {dataLoading ? (
                                            <TableRow><TableCell colSpan={5} className="h-64 text-center"><Loader2 className="animate-spin mx-auto text-primary" /><p className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Loading Database...</p></TableCell></TableRow>
                                        ) : paginatedSamples.length > 0 ? (
                                            paginatedSamples.map((sample) => {
                                                const used = usedQuantities[sample.displayMaterialName] || 0;
                                                const balance = sample.allocationQuantity - used;
                                                return (
                                                    <TableRow key={sample.id} className="h-16 hover:bg-muted/30 border-b last:border-0">
                                                        <TableCell className="pl-6">
                                                            <Checkbox 
                                                                checked={selectedIds.includes(sample.id)}
                                                                onCheckedChange={(checked) => handleSelectRow(sample.id, !!checked)}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
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
                                            <TableRow><TableCell colSpan={5} className="h-64 text-center text-muted-foreground italic">No products found.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                    
                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-1">
                            <p className="text-sm text-muted-foreground">
                                Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, filteredSamples.length)}</strong> of <strong>{filteredSamples.length}</strong>
                            </p>
                            <div className="flex items-center gap-2">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="border-2 rounded-xl"
                                >
                                    <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                                </Button>
                                <span className="text-sm font-bold mx-2">Page {currentPage} of {totalPages}</span>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="border-2 rounded-xl"
                                >
                                    Next <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <Card className="border-2 shadow-lg bg-primary/5">
                        <CardHeader>
                            <CardTitle className="font-headline text-lg flex items-center gap-2">
                                <PackagePlus className="w-5 h-5 text-primary" />
                                Bulk Import Q4
                            </CardTitle>
                            <CardDescription>Upload CSV/Excel to populate the Q4 batch inventory.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button onClick={handleDownloadTemplate} variant="outline" className="w-full border-2 h-11 font-headline">
                                <FileDown className="mr-2 h-4 w-4" /> Download Template
                            </Button>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                onChange={handleFileChange} 
                                className="hidden" 
                                accept=".xlsx, .xls, .csv" 
                            />
                            <Button 
                                onClick={handleUploadClick} 
                                disabled={isUploading} 
                                className="w-full h-11 font-headline shadow-lg"
                            >
                                {isUploading ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                                ) : (
                                    <><Download className="mr-2 h-4 w-4 rotate-180" /> Import Products</>
                                )}
                            </Button>
                            <Button variant="ghost" onClick={fetchAllUsage} disabled={isFetchingUsage} className="w-full h-10 text-xs uppercase tracking-widest font-bold">
                                <RefreshCw className={cn("mr-2 h-3 w-3", isFetchingUsage && "animate-spin")} />
                                Refresh Distribution
                            </Button>
                        </CardContent>
                    </Card>

                    <Alert className="border-2 bg-muted/30">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle className="font-headline font-bold">Important</AlertTitle>
                        <AlertDescription className="text-xs leading-normal opacity-70">
                            Excel must have headers: <strong>ProdGroupProdSubGroup</strong>, <strong>DisplayMaterialName</strong>, and <strong>AllocationQuantity</strong>.
                        </AlertDescription>
                    </Alert>
                </div>
            </div>
        </div>
    );
}
