"use client"

import { useState, useRef, useMemo } from "react";
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
    CheckCircle2, 
    TrendingUp, 
    PackageCheck,
    Filter
} from "lucide-react";
import { useMarketingSamples, useAdminMarketingSamples } from "@/hooks/use-marketing-samples";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import type { MarketingSample } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function Q4AllocationView() {
    const { marketingSamples, usedQuantities, loading: dataLoading, refetch } = useMarketingSamples();
    const { addMarketingSamplesBulk } = useAdminMarketingSamples();
    const { toast } = useToast();
    
    const [search, setSearch] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const handleDownloadTemplate = () => {
        const headers = ['ProdGroupProdSubGroup', 'DisplayMaterialName', 'AllocationQuantity'];
        const sampleData = [
            { 'ProdGroupProdSubGroup': 'Antihistamine - Ricam Syrup', 'DisplayMaterialName': 'PQ3_Frutos Candy', 'AllocationQuantity': 180 },
            { 'ProdGroupProdSubGroup': 'Antihistamine - Ricam Tablet', 'DisplayMaterialName': 'PQ3_Pistachio with Ricam Sticker', 'AllocationQuantity': 675 },
            { 'ProdGroupProdSubGroup': 'Anti-Fungals - Inox', 'DisplayMaterialName': 'PQ3_Inox Penlight', 'AllocationQuantity': 180 },
            { 'ProdGroupProdSubGroup': 'Anti-Fungals - Inox', 'DisplayMaterialName': 'PQ3_Inox Elite Marks & Spencer Set', 'AllocationQuantity': 218 }
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
                    return;
                }

                const samplesToAdd: Omit<MarketingSample, 'id'>[] = [];
                for (const row of bodyRows) {
                    const name = String(row[colMap.name]).trim();
                    const group = colMap.group > -1 ? String(row[colMap.group]).trim() : "Uncategorized";
                    const qty = parseInt(String(row[colMap.qty]).replace(/[^0-9]/g, ''));

                    if (name && !isNaN(qty)) {
                        samplesToAdd.push({ 
                            productGroup: group, 
                            materialName: name, 
                            allocationQuantity: qty 
                        });
                    }
                }

                if (samplesToAdd.length > 0) {
                    const success = await addMarketingSamplesBulk(samplesToAdd);
                    if (success) {
                        toast({ title: "Import Successful", description: `${samplesToAdd.length} items added to Q4 Batch 1.` });
                        refetch();
                    }
                }
            } catch (err) {
                toast({ variant: "destructive", title: "Upload Failed", description: "Ensure your file follows the official template." });
            } finally {
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        };
        reader.readAsArrayBuffer(file);
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-2 shadow-sm bg-primary/5">
                    <CardHeader className="pb-2">
                        <CardDescription className="font-headline font-bold text-primary flex items-center gap-2 uppercase tracking-tighter">
                            <PackageCheck className="w-4 h-4" /> Total Batch Allocation
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black font-headline">{stats.totalAllocated} <span className="text-sm font-normal text-muted-foreground">units</span></div>
                    </CardContent>
                </Card>
                <Card className="border-2 shadow-sm bg-orange-500/5">
                    <CardHeader className="pb-2">
                        <CardDescription className="font-headline font-bold text-orange-500 flex items-center gap-2 uppercase tracking-tighter">
                            <TrendingUp className="w-4 h-4" /> Distributed Stock
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black font-headline text-orange-500">{stats.totalUsed} <span className="text-sm font-normal text-muted-foreground">({stats.percent}%)</span></div>
                    </CardContent>
                </Card>
                <Card className="border-2 shadow-sm bg-green-500/5">
                    <CardHeader className="pb-2">
                        <CardDescription className="font-headline font-bold text-green-500 flex items-center gap-2 uppercase tracking-tighter">
                            <Filter className="w-4 h-4" /> Inventory Balance
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black font-headline text-green-500">{stats.remaining} <span className="text-sm font-normal text-muted-foreground">units</span></div>
                    </CardContent>
                </Card>
            </div>

            {/* Management Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <Card className="border-2 shadow-lg overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b pb-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <CardTitle className="text-xl font-black font-headline">Product Allocation List</CardTitle>
                                    <CardDescription>Live monitoring for Q4 Batch 1 inventory.</CardDescription>
                                </div>
                                <div className="relative max-w-sm w-full">
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
                            <Table>
                                <TableHeader className="bg-muted/20">
                                    <TableRow className="h-12 hover:bg-transparent">
                                        <TableHead className="font-bold text-foreground pl-6">Product Group</TableHead>
                                        <TableHead className="font-bold text-foreground">Material Name</TableHead>
                                        <TableHead className="text-center font-bold text-foreground w-32">Allocation</TableHead>
                                        <TableHead className="text-center font-bold text-foreground w-32 pr-6">Balance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dataLoading ? (
                                        <TableRow><TableCell colSpan={4} className="h-64 text-center"><Loader2 className="animate-spin mx-auto text-primary" /><p className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Loading Database...</p></TableCell></TableRow>
                                    ) : filteredSamples.length > 0 ? (
                                        filteredSamples.map((sample) => {
                                            const distributed = usedQuantities[sample.materialName] || 0;
                                            const balance = sample.allocationQuantity - distributed;
                                            return (
                                                <TableRow key={sample.id} className="h-16 hover:bg-muted/30 border-b last:border-0">
                                                    <TableCell className="pl-6 font-bold text-primary text-xs uppercase tracking-tight">{sample.productGroup}</TableCell>
                                                    <TableCell className="font-medium text-sm">{sample.materialName}</TableCell>
                                                    <TableCell className="text-center font-mono font-bold">{sample.allocationQuantity}</TableCell>
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
                                        <TableRow><TableCell colSpan={4} className="h-64 text-center text-muted-foreground italic">No products matching search criteria.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="border-2 shadow-lg bg-primary/5">
                        <CardHeader>
                            <CardTitle className="font-headline text-lg flex items-center gap-2">
                                <PackagePlus className="w-5 h-5 text-primary" />
                                Bulk Import
                            </CardTitle>
                            <CardDescription>Upload CSV/Excel to populate the batch inventory.</CardDescription>
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
                            <div className="p-3 bg-background/50 rounded-lg border text-[10px] text-muted-foreground leading-relaxed">
                                <p className="font-bold text-foreground mb-1 uppercase tracking-tighter">Instructions:</p>
                                <ol className="list-decimal pl-4 space-y-1">
                                    <li>Download the template file.</li>
                                    <li>Enter Product Group, Name, and Quantity.</li>
                                    <li>Save and upload the file above.</li>
                                </ol>
                            </div>
                        </CardContent>
                    </Card>

                    <Alert className="border-2 bg-muted/30">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle className="font-headline font-bold">Policy Note</AlertTitle>
                        <AlertDescription className="text-[10px] leading-normal opacity-70">
                            Distributions are tracked live from coverage reports. Ensure all field representatives sync their offline data to maintain batch accuracy.
                        </AlertDescription>
                    </Alert>
                </div>
            </div>
        </div>
    );
}