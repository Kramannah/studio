
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
import { useState, useMemo, useEffect } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { RefreshCw, ChevronLeft, ChevronRight, PackageCheck, FileSpreadsheet, PlusCircle, Edit2, Trash2, Database, ListPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import * as XLSX from 'xlsx';
import { format } from "date-fns";
import { useAdminMarketingSamples } from "@/hooks/use-marketing-samples";
import { MarketingSampleDialog } from "./marketing-sample-dialog";
import { AddMarketingSamples } from "./add-marketing-samples";
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

type MarketingListProps = {
  samples: MarketingSample[];
  usedQuantities: Record<string, number>;
  readOnly?: boolean;
  loading?: boolean;
  onRefresh?: () => void;
}

export function MarketingList({ samples, usedQuantities, readOnly = true, loading = false, onRefresh }: MarketingListProps) {
  const { deleteSample, populateOfficialList } = useAdminMarketingSamples();
  const [filter, setFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsFormOpen] = useState(false);
  const [isPopulating, setIsPopulating] = useState(false);
  const [selectedSample, setSelectedSample] = useState<MarketingSample | undefined>(undefined);
  const itemsPerPage = 15;

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

  const handlePopulateOfficial = async () => {
      setIsPopulating(true);
      const success = await populateOfficialList();
      if (success && onRefresh) onRefresh();
      setIsPopulating(false);
  }

  return (
    <div className="space-y-6">
      {!readOnly && (
          <div className="w-full">
              <AddMarketingSamples onRefresh={onRefresh} />
          </div>
      )}

      <Card className="shadow-lg border-2">
        <CardHeader>
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="font-headline text-2xl flex items-center gap-2 text-primary">
                  <PackageCheck className="w-6 h-6" />
                  Inventory List
              </CardTitle>
              <CardDescription className="text-base">
                  Live stock monitoring and allocation management.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
                {!readOnly && (
                    <>
                        <Button onClick={handlePopulateOfficial} variant="outline" className="border-2 font-headline h-11" disabled={isPopulating}>
                            {isPopulating ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <ListPlus className="mr-2 h-4 w-4" />}
                            Load Official 50 Items
                        </Button>
                        <Button onClick={() => { setSelectedSample(undefined); setIsFormOpen(true); }} variant="default" className="font-headline h-11">
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Single
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
                                                  <Button variant="ghost" size="icon" onClick={() => { setSelectedSample(sample); setIsFormOpen(true); }}>
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
                                                              <AlertDialogHeader>
                                                                  Remove <strong>{sample.materialName}</strong> from the inventory?
                                                              </AlertDialogHeader>
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
                                  No items found. Use the official list button or upload inventory.
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
