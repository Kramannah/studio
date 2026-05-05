
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
import { RefreshCw, ChevronLeft, ChevronRight, PackageCheck, FileSpreadsheet, PlusCircle, Edit2, Trash2, Download, Upload, Loader2, AlertCircle, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import * as XLSX from 'xlsx';
import { format } from "date-fns";
import { useAdminMarketingSamples } from "@/hooks/use-marketing-samples";
import { MarketingSampleDialog } from "./marketing-sample-dialog";
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
import { useToast } from "@/hooks/use-toast";

type MarketingListProps = {
  samples: MarketingSample[];
  usedQuantities: Record<string, number>;
  readOnly?: boolean;
  loading?: boolean;
  onRefresh?: () => void;
}

export function MarketingList({ samples, usedQuantities, readOnly = true, loading = false, onRefresh }: MarketingListProps) {
  const { deleteSample, runAutoSeed, addMarketingSamplesBulk } = useAdminMarketingSamples();
  const { toast } = useToast();
  const [filter, setFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsFormOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedSample, setSelectedSample] = useState<MarketingSample | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsPerPage = 15;

  // Auto-seed if missing products (Target total: 54)
  useEffect(() => {
    if (!loading && !readOnly && samples.length < 54) {
        runAutoSeed().then((success) => {
            if (success && onRefresh) onRefresh();
        });
    }
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

  const handleSyncSystemProducts = async () => {
    setIsUploading(true);
    const success = await runAutoSeed();
    if (success) {
        toast({ title: "Sync Successful", description: "54 system products updated." });
        onRefresh?.();
    }
    setIsUploading(false);
  };

  const handleExportExcel = () => {
    const dataToExport = filteredSamples.map(sample => {
        const used = Math.round(usedQuantities[sample.materialName] || 0);
        const allocated = Math.round(sample.allocationQuantity || 0);
        return {
            "Product Group": sample.productGroup,
            "Material Name": sample.materialName,
            "Allocated Quantity": allocated,
            "Remaining Quantity": allocated - used
        };
    });
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
    XLSX.writeFile(workbook, `marketing_samples_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
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
          name: findColIndex(['displaymaterialname', 'material name', 'material', 'name']),
          qty: findColIndex(['allocationquantity', 'allocation quantity', 'allocation', 'quantity', 'qty'])
        };

        if (colMap.name === -1 || colMap.qty === -1) {
          toast({ variant: "destructive", title: "Header Mismatch", description: "Could not find 'Material Name' or 'Quantity' columns." });
          setIsUploading(false);
          return;
        }

        const samplesToAdd: Omit<MarketingSample, 'id'>[] = [];
        for (const row of bodyRows) {
          const name = String(row[colMap.name] || '').trim();
          const qty = parseInt(String(row[colMap.qty]).replace(/[^0-9]/g, '')) || 0;
          const group = colMap.group > -1 ? String(row[colMap.group] || '').trim() : "Uncategorized";
          if (name) samplesToAdd.push({ productGroup: group, materialName: name, allocationQuantity: qty });
        }

        const success = await addMarketingSamplesBulk(samplesToAdd);
        if (success) {
          toast({ title: "Import Successful", description: `${samplesToAdd.length} products updated.` });
          onRefresh?.();
          setShowImport(false);
        }
      } catch (error) {
        toast({ variant: "destructive", title: "Upload Error", description: "Failed to process the file." });
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleEdit = (sample: MarketingSample) => {
      setSelectedSample(sample);
      setIsFormOpen(true);
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-lg border-2">
        <CardHeader>
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="font-headline text-2xl flex items-center gap-2 text-primary">
                  <PackageCheck className="w-6 h-6" />
                  Marketing Samples Inventory
              </CardTitle>
              <CardDescription className="text-base">
                  Live stock monitoring and allocation management.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
                {!readOnly && (
                    <>
                        <Button onClick={handleSyncSystemProducts} variant="secondary" className="border-2 font-headline h-11" disabled={isUploading}>
                           {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                           Sync 54 Products
                        </Button>
                        <Button onClick={() => setShowImport(!showImport)} variant="outline" className="border-2 font-headline h-11">
                            <Upload className="mr-2 h-4 w-4" /> Bulk Import
                        </Button>
                    </>
                )}
                <Button onClick={handleExportExcel} variant="outline" className="border-2 font-headline h-11">
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Data
                </Button>
                {onRefresh && (
                    <Button onClick={onRefresh} variant="outline" size="icon" disabled={loading} className="border-2 h-11 w-11">
                        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    </Button>
                )}
            </div>
          </div>
          
          {showImport && !readOnly && (
              <div className="mt-6 p-6 border-2 border-dashed rounded-xl bg-muted/30 animate-in slide-in-from-top-4 duration-300">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                      <div className="space-y-2">
                          <h3 className="font-headline font-bold text-lg">Excel Bulk Upload</h3>
                          <p className="text-sm text-muted-foreground">Upload your .xlsx or .csv file to update multiple items at once.</p>
                      </div>
                      <div className="shrink-0">
                          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls, .csv" />
                          <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading} size="lg" className="h-14 px-8 font-headline text-lg shadow-lg">
                              {isUploading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processing...</> : <><FileSpreadsheet className="mr-2 h-5 w-5" /> Select File</>}
                          </Button>
                      </div>
                  </div>
              </div>
          )}

          <div className="mt-4">
            <Input 
              placeholder="Search product or material..."
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
                          <TableHead className="text-center font-bold text-foreground">Allocation</TableHead>
                          <TableHead className="text-center font-bold text-foreground">Remaining</TableHead>
                          {!readOnly && <TableHead className="text-right font-bold text-foreground">Actions</TableHead>}
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                       {loading ? (
                          <TableRow>
                              <TableCell colSpan={readOnly ? 4 : 5} className="h-64 text-center">
                                  <RefreshCw className="inline-block mr-2 animate-spin text-primary" />
                                  <span className="font-headline text-lg">Loading inventory...</span>
                              </TableCell>
                          </TableRow>
                      ) : paginatedSamples.length > 0 ? (
                          paginatedSamples.map((sample) => {
                              const used = Math.round(usedQuantities[sample.materialName] || 0);
                              const allocated = Math.round(sample.allocationQuantity || 0);
                              const balance = allocated - used;
                              const isOutOfStock = balance <= 0;
                            
                              return (
                                  <TableRow key={sample.id} className={cn("h-16 hover:bg-muted/30 transition-colors", isOutOfStock && "bg-destructive/5")}>
                                      <TableCell className="font-bold text-primary">{sample.productGroup}</TableCell>
                                      <TableCell className="font-medium">{sample.materialName}</TableCell>
                                      <TableCell className="text-center font-mono">{allocated}</TableCell>
                                      <TableCell className="text-center">
                                          <div className="flex flex-col items-center gap-1">
                                              <span className={cn(
                                                  "font-black font-mono text-lg", 
                                                  isOutOfStock ? "text-destructive" : "text-green-500"
                                              )}>
                                                  {balance}
                                              </span>
                                          </div>
                                      </TableCell>
                                      {!readOnly && (
                                          <TableCell className="text-right">
                                              <div className="flex justify-end gap-1">
                                                  <Button variant="ghost" size="icon" onClick={() => handleEdit(sample)}>
                                                      <Edit2 className="h-4 w-4 text-primary" />
                                                  </Button>
                                                  <AlertDialog>
                                                      <AlertDialogTrigger asChild>
                                                          <Button variant="ghost" size="icon">
                                                              <Trash2 className="h-4 w-4 text-destructive" />
                                                          </Button>
                                                      </AlertDialogTrigger>
                                                      <AlertDialogContent>
                                                          <AlertDialogHeader>
                                                              <AlertDialogTitle>Delete Sample?</AlertDialogTitle>
                                                              <AlertDialogDescription>
                                                                  Remove <strong>{sample.materialName}</strong> from the inventory?
                                                              </AlertDialogDescription>
                                                          </AlertDialogHeader>
                                                          <AlertDialogFooter>
                                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                              <AlertDialogAction onClick={() => deleteSample(sample.id).then(() => onRefresh?.())} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                                                          </AlertDialogFooter>
                                                      </AlertDialogContent>
                                                  </AlertDialog>
                                              </div>
                                          </TableCell>
                                      )}
                                  </TableRow>
                              );
                          })
                      ) : (
                          <TableRow>
                              <TableCell colSpan={readOnly ? 4 : 5} className="h-48 text-center text-muted-foreground italic text-lg">
                                  No materials found. Syncing system database...
                              </TableCell>
                          </TableRow>
                      )}
                  </TableBody>
              </Table>
          </div>
          
          {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 px-1">
                  <p className="text-sm text-muted-foreground font-medium">
                      Page <span className="text-foreground font-bold">{currentPage}</span> of {totalPages}
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
      
      {!readOnly && (
          <MarketingSampleDialog 
            isOpen={isDialogOpen} 
            onOpenChange={setIsFormOpen} 
            onSave={() => onRefresh?.()} 
            sample={selectedSample} 
          />
      )}
    </div>
  );
}
