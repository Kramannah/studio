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
import { RefreshCw, ChevronLeft, ChevronRight, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";

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
  const itemsPerPage = 10;

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
                Real-time tracking of promotional materials. Deductions are processed automatically from coverage reports.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {onRefresh && (
                 <Button onClick={onRefresh} variant="outline" size="icon" disabled={loading} className="border-2">
                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
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
