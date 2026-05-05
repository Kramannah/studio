
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
    PackageCheck
} from "lucide-react";
import { useQ4Allocation } from "@/hooks/use-q4-allocation";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import type { Q4Allocation } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function Q4AllocationView() {
    const { allocations, loading: dataLoading, refetch, addAllocationsBulk } = useQ4Allocation();
    const { toast } = useToast();
    
    const [search, setSearch] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const filteredSamples = useMemo(() => {
        return allocations.filter(s => 
            s.displayMaterialName.toLowerCase().includes(search.toLowerCase()) ||
            s.prodGroupProdSubGroup.toLowerCase().includes(search.toLowerCase())
        );
    }, [allocations, search]);

    const totalAllocated = useMemo(() => {
        return allocations.reduce((sum, s) => sum + (s.allocationQuantity || 0), 0);
    }, [allocations]);

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
                        description: "Column headers must match the template exactly: ProdGroupProdSubGroup, DisplayMaterialName, AllocationQuantity." 
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
                        toast({ title: "Import Successful", description: `${samplesToAdd.length} items added to Q4 Batch 1.` });
                        refetch();
                    } else {
                        toast({ variant: "destructive", title: "Upload Failed", description: "Database permission error." });
                    }
                }
            } catch (err) {
                toast({ variant: "destructive", title: "Technical Error", description: "Could not parse Excel file." });
            } finally {
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        };
        reader.readAsArrayBuffer(file);
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
                <Card className="border-2 shadow-sm bg-primary/5">
                    <CardHeader className="pb-2">
                        <CardDescription className="font-headline font-bold text-primary flex items-center gap-2 uppercase tracking-tighter">
                            <PackageCheck className="w-4 h-4" /> Total Q4 Batch Allocation
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black font-headline">{totalAllocated} <span className="text-sm font-normal text-muted-foreground">units</span></div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <Card className="border-2 shadow-lg overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b pb-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <CardTitle className="text-xl font-black font-headline">Q4 Allocation List</CardTitle>
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
                                        <TableHead className="font-bold text-foreground pl-6">Group</TableHead>
                                        <TableHead className="font-bold text-foreground">Material Name</TableHead>
                                        <TableHead className="text-center font-bold text-foreground w-32 pr-6">Allocation</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dataLoading ? (
                                        <TableRow><TableCell colSpan={3} className="h-64 text-center"><Loader2 className="animate-spin mx-auto text-primary" /><p className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Loading Database...</p></TableCell></TableRow>
                                    ) : filteredSamples.length > 0 ? (
                                        filteredSamples.map((sample) => {
                                            return (
                                                <TableRow key={sample.id} className="h-16 hover:bg-muted/30 border-b last:border-0">
                                                    <TableCell className="pl-6 font-bold text-primary text-xs uppercase tracking-tight">{sample.prodGroupProdSubGroup}</TableCell>
                                                    <TableCell className="font-medium text-sm">{sample.displayMaterialName}</TableCell>
                                                    <TableCell className="text-center pr-6">
                                                        <Badge variant="outline" className="font-black font-mono text-base px-3 h-8 min-w-[60px] flex items-center justify-center">
                                                            {sample.allocationQuantity}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    ) : (
                                        <TableRow><TableCell colSpan={3} className="h-64 text-center text-muted-foreground italic">No products uploaded yet.</TableCell></TableRow>
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
