
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
import { RefreshCw, ChevronLeft, ChevronRight, PackageCheck, FileSpreadsheet, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from 'xlsx';
import { format } from "date-fns";

type MarketingListProps = {
  samples: MarketingSample[];
  usedQuantities: Record<string, number>;
  readOnly?: boolean;
  loading?: boolean;
  onRefresh?: () => void;
}

export function MarketingList({ samples, usedQuantities, readOnly = true, loading = false, onRefresh }: MarketingListProps) {
  const [filter, setFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const filteredSamples = useMemo(() => {
    try {
        if (!samples || !Array.isArray(samples)) return [];
        
        const safeFilter = `${filter ?? ""}`.toLowerCase().trim();
        
        return samples.filter(sample => {
            if (!sample || typeof sample !== 'object') return false;
            
            const group = `${sample.productGroup ?? ""}`.toLowerCase();
            const name = `${sample.materialName ?? ""}`.toLowerCase();
            
            return group.includes(safeFilter) || name.includes(safeFilter);
        });
    } catch (e) {
        console.error("Marketing list filter issue:", e);
        return [];
    }
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
        const name = `${sample.materialName ?? "Unknown Item"}`;
        const used = Math.round(usedQuantities[name] ?? 0);
        const allocated = Math.round(sample.allocationQuantity ?? 0);
        return {
            "Product Group": `${sample.productGroup ?? "Uncategorized"}`,
            "Material Name": name,
            "Allocated Quantity": allocated,
            "Remaining Quantity": Math.max(0, allocated - used)
        };
    });
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
    XLSX.writeFile(workbook, `marketing_samples_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg border-2">
        <CardHeader>
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="font-headline text-2xl flex items-center gap-2 text-primary">
                  <PackageCheck className="w-6 h-6" />
                  Official Material List
              </CardTitle>
              <CardDescription className="text-base">
                  Displaying the official marketing items and samples.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
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
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search products or material..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-10 h-11 border-2"
              />
            </div>
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
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                       {loading && paginatedSamples.length === 0 ? (
                          <TableRow>
                              <TableCell colSpan={3} className="h-64 text-center">
                                  <RefreshCw className="inline-block mr-2 animate-spin text-primary" />
                                  <span className="font-headline text-lg">Loading inventory...</span>
                              </TableCell>
                          </TableRow>
                      ) : paginatedSamples.length > 0 ? (
                          paginatedSamples.map((sample) => {
                              return (
                                  <TableRow key={sample.id} className="h-16 hover:bg-muted/30 transition-colors">
                                      <TableCell className="font-bold text-primary">{`${sample.productGroup ?? "Uncategorized"}`}</TableCell>
                                      <TableCell className="font-medium">{`${sample.materialName ?? "Unknown Item"}`}</TableCell>
                                      <TableCell className="text-center font-mono font-bold">{Math.round(sample.allocationQuantity ?? 0)}</TableCell>
                                  </TableRow>
                              );
                          })
                      ) : (
                          <TableRow>
                              <TableCell colSpan={3} className="h-48 text-center text-muted-foreground italic text-lg">
                                  No items found matching your search.
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
    </div>
  );
}
