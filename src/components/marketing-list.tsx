
"use client"

import type { MarketingSample } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { useState, useMemo, useEffect, useRef } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { RefreshCw, ChevronLeft, ChevronRight, PackageCheck, PlusCircle, Download, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import * as XLSX from 'xlsx';
import { format } from "date-fns";
import { useAdminMarketingSamples } from "@/hooks/use-marketing-samples";
import { useToast } from "@/hooks/use-toast";

type MarketingListProps = {
  samples: MarketingSample[];
  usedQuantities: Record<string, number>;
  readOnly?: boolean;
  loading?: boolean;
  onRefresh?: () => void;
}

export function MarketingList({ samples, usedQuantities, loading = false, onRefresh }: MarketingListProps) {
  const [filter, setFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addMarketingSamplesBulk, runAutoSeed } = useAdminMarketingSamples();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  // Run auto-seed only once when the list is first loaded
  useEffect(() => {
    const performSeed = async () => {
        if (samples.length === 0 && !loading && !readOnly) {
            await runAutoSeed();
            if (onRefresh) onRefresh();
        }
    };
    performSeed();
  }, [samples.length, loading, readOnly, runAutoSeed, onRefresh]);

  const filteredSamples = useMemo(() => {
    return samples.filter(sample =>
      sample.productGroup.toLowerCase().includes(filter.toLowerCase()) ||
      sample.materialName.toLowerCase().includes(filter.toLowerCase())
    );
  }, [samples, filter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  const totalPages = Math.ceil(filteredSamples.length / itemsPerPage);
  
  const paginatedSamples = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredSamples.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSamples, currentPage]);

  const handleUploadClick = () => {
      fileInputRef.current?.click();
  };

  const handleDownloadTemplate = () => {
      const headers = ['ProdGroupProdSubGroup', 'DisplayMaterialName', 'AllocationQuantity'];
      const sampleData = [
          {
              'ProdGroupProdSubGroup': 'Antihistamine - Ricam Syrup',
              'DisplayMaterialName': 'PQ3_Frutos Candy',
              'AllocationQuantity': 180
          }
      ];
      const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
      XLSX.writeFile(workbook, "marketing_samples_template.xlsx");
  };

  const handleExportExcel = () => {
    const dataToExport = filteredSamples.map(sample => {
      return {
        "ProdGroupProdSubGroup": sample.productGroup,
        "DisplayMaterialName": sample.materialName,
        "AllocationQuantity": Math.round(sample.allocationQuantity || 0),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Marketing Samples");
    XLSX.writeFile(workbook, `existing_marketing_samples_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
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
              const sheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[sheetName];
              const json: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

              if (json.length < 2) {
                  toast({ variant: "destructive", title: "Empty File", description: "The Excel file is empty." });
                  setIsUploading(false);
                  return;
              }

              const headerRow = json[0].map((h: any) => String(h || '').toLowerCase().trim());
              const bodyRows = json.slice(1);

              const findColIndex = (possibleNames: string[]) => {
                  for (const name of possibleNames) {
                      const index = headerRow.findIndex((h) => h.includes(name.toLowerCase()));
                      if (index > -1) return index;
                  }
                  return -1;
              };

              const colMap = {
                  group: findColIndex(['prodgroupprodsubgroup', 'product group', 'product', 'group']),
                  name: findColIndex(['displaymaterialname', 'material name', 'material', 'name', 'item']),
                  qty: findColIndex(['allocationquantity', 'allocation quantity', 'allocation', 'quantity', 'qty'])
              };

              if (colMap.name === -1 || colMap.qty === -1) {
                  toast({ variant: "destructive", title: "Missing Columns", description: "Use the provided template headers." });
                  setIsUploading(false);
                  return;
              }

              const samplesToAdd: Omit<MarketingSample, 'id'>[] = [];
              for (const row of bodyRows) {
                  const name = String(row[colMap.name] || '').trim();
                  const qty = Number(row[colMap.qty]);
                  const group = colMap.group > -1 ? String(row[colMap.group] || '').trim() : "Uncategorized";

                  if (name && !isNaN(qty)) {
                      samplesToAdd.push({
                          productGroup: group,
                          materialName: name,
                          allocationQuantity: Math.round(qty)
                      });
                  }
              }

              const success = await addMarketingSamplesBulk(samplesToAdd);
              if (success) {
                toast({ title: "Upload Successful", description: "Inventory has been updated." });
                if (onRefresh) onRefresh();
              } else {
                toast({ variant: "destructive", title: "Upload Failed", description: "Check permissions or file format." });
              }
          } catch (error) {
              toast({ variant: "destructive", title: "Upload Error" });
          } finally {
              setIsUploading(false);
              if (fileInputRef.current) fileInputRef.current.value = "";
          }
      };
      reader.readAsArrayBuffer(file);
  };

  return (
    <Card className="shadow-lg border-2">
      <CardHeader>
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="font-headline text-2xl flex items-center gap-2 text-primary">
                <PackageCheck className="w-6 h-6" />
                Marketing Samples Inventory
            </CardTitle>
            <CardDescription className="text-base">
                Real-time tracking of promotional materials.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls" />
            <Button onClick={handleExportExcel} variant="outline" className="border-2 font-headline h-11">
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Data
            </Button>
            <Button onClick={handleDownloadTemplate} variant="outline" className="border-2 font-headline h-11">
                <Download className="mr-2 h-4 w-4" /> Template
            </Button>
            <Button onClick={handleUploadClick} disabled={isUploading} className="font-headline shadow-md h-11 px-6">
                {isUploading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                Add Sample
            </Button>
            {onRefresh && (
                 <Button onClick={onRefresh} variant="outline" size="icon" disabled={loading || isUploading} className="border-2 h-11 w-11">
                    <RefreshCw className={cn("h-4 w-4", (loading || isUploading) && "animate-spin")} />
                </Button>
            )}
          </div>
        </div>
        <div className="mt-4">
          <Input 
            placeholder="Filter by product or material name..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-md h-11 border-2"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="border-2 rounded-xl overflow-hidden shadow-sm">
            <Table>
                <TableHeader className="bg-muted/50 h-14">
                    <TableRow>
                        <TableHead className="font-bold text-foreground">Product Group</TableHead>
                        <TableHead className="font-bold text-foreground">Material Name</TableHead>
                        <TableHead className="text-center font-bold text-foreground">Allocated</TableHead>
                        <TableHead className="text-center font-bold text-foreground">Used / Given</TableHead>
                        <TableHead className="text-center font-bold text-foreground">Balance</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                     {loading ? (
                        <TableRow>
                            <TableCell colSpan={5} className="h-64 text-center">
                                <RefreshCw className="inline-block mr-2 animate-spin text-primary" />
                                <span className="font-headline text-lg">Recalculating stock...</span>
                            </TableCell>
                        </TableRow>
                    ) : paginatedSamples.length > 0 ? (
                        paginatedSamples.map((sample) => {
                            const used = Math.round(usedQuantities[sample.materialName] || 0);
                            const allocated = Math.round(sample.allocationQuantity || 0);
                            const balance = allocated - used;
                            const isOutOfStock = balance <= 0;
                            const isLowStock = !isOutOfStock && balance <= 5;
                          
                            return (
                                <TableRow key={sample.id} className={cn("h-16 hover:bg-muted/30 transition-colors", isOutOfStock && "bg-destructive/5")}>
                                    <TableCell className="font-bold text-primary">{sample.productGroup}</TableCell>
                                    <TableCell className="font-medium">{sample.materialName}</TableCell>
                                    <TableCell className="text-center font-mono">{allocated}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="secondary" className="font-mono text-sm px-3">{used}</Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className={cn(
                                                "font-black font-mono text-lg", 
                                                isOutOfStock ? "text-destructive" : (isLowStock ? "text-orange-500" : "text-green-500")
                                            )}>
                                                {balance}
                                            </span>
                                            {isOutOfStock && <span className="text-[10px] font-black text-destructive uppercase tracking-tighter">OUT OF STOCK</span>}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    ) : (
                        <TableRow>
                            <TableCell colSpan={5} className="h-48 text-center text-muted-foreground italic text-lg">
                                {samples.length > 0 ? "No materials match your filter." : "Inventory list is empty."}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
        
        {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 px-1">
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
                    Viewing <span className="text-foreground font-bold">{Math.min(filteredSamples.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(filteredSamples.length, currentPage * itemsPerPage)}</span> of {filteredSamples.length} materials
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="h-9 rounded-lg border-2 font-headline"
                    >
                        <ChevronLeft className="w-4 h-4 mr-2" /> Previous
                    </Button>
                    <Badge className="h-9 px-4 rounded-lg font-bold text-sm bg-muted/50 text-foreground border-2">{currentPage} / {totalPages}</Badge>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="h-9 rounded-lg border-2 font-headline"
                    >
                        Next <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                </div>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
