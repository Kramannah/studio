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
import { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Upload, Download, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type MarketingListProps = {
  samples: MarketingSample[];
  usedQuantities: Record<string, number>;
  onAddSamplesBulk: (samples: Omit<MarketingSample, 'id'>[]) => Promise<boolean>;
  readOnly?: boolean;
  loading?: boolean;
  onRefresh?: () => void;
}

export function MarketingList({ samples, usedQuantities, onAddSamplesBulk, readOnly = false, loading = false, onRefresh }: MarketingListProps) {
  const [filter, setFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  const filteredSamples = useMemo(() => {
    return samples.filter(sample =>
      sample.productGroup.toLowerCase().includes(filter.toLowerCase()) ||
      sample.materialName.toLowerCase().includes(filter.toLowerCase())
    );
  }, [samples, filter]);

  // Reset to first page when filtering
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
        const json = XLSX.utils.sheet_to_json<any>(worksheet);

        const requiredFields: (keyof Omit<MarketingSample, 'id'>)[] = ['productGroup', 'materialName', 'allocationQuantity'];
        
        const mappedData = json.map(row => ({
            productGroup: row['ProdGroupProdSubGroup'],
            materialName: row['DisplayMaterialName'],
            allocationQuantity: row['AllocationQuantity']
        }));

        const isValid = mappedData.every(row => requiredFields.every(field => row[field] !== undefined));

        if (!isValid) {
          toast({
            variant: "destructive",
            title: "Upload Failed",
            description: "The Excel file is missing required columns (ProdGroupProdSubGroup, DisplayMaterialName, AllocationQuantity) or contains invalid data.",
          });
          return;
        }

        const success = await onAddSamplesBulk(mappedData);
        if (success && onRefresh) {
            onRefresh();
        }

      } catch (error) {
        console.error("Failed to parse Excel file", error);
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: "There was an error processing the Excel file. Please ensure it is a valid .xlsx or .xls file.",
        });
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = () => {
    const headers = ['ProdGroupProdSubGroup', 'DisplayMaterialName', 'AllocationQuantity'];
    const sampleData = [
      { ProdGroupProdSubGroup: 'Anti-Fungals - Inox', DisplayMaterialName: 'PQ3_Integumentary System Notepad', AllocationQuantity: 10 },
      { ProdGroupProdSubGroup: 'Anti-Fungals - Ketovid', DisplayMaterialName: 'SQ1_Ketovid 15g-CF03080-2/28/2028', AllocationQuantity: 30 }
    ];
    
    const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Samples Template');
  
    worksheet['!cols'] = [
      { wch: 30 },
      { wch: 40 },
      { wch: 20 },
    ];

    XLSX.writeFile(workbook, 'marketing_samples_template.xlsx');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="font-headline">Marketing Samples Inventory</CardTitle>
            <CardDescription>{readOnly ? 'A list of all available marketing materials and their balances.' : 'Upload and manage the company-wide marketing promotional materials.'}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {!readOnly && (
                <>
                    <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".xlsx, .xls"
                    />
                    <Button onClick={handleDownloadTemplate} variant="outline" disabled={isUploading}>
                        <Download className="mr-2" />
                        Download Template
                    </Button>
                    <Button onClick={handleUploadClick} variant="outline" disabled={isUploading}>
                        {isUploading ? <RefreshCw className="mr-2 animate-spin"/> : <Upload className="mr-2" />}
                        {isUploading ? 'Uploading...' : 'Upload Masterlist'}
                    </Button>
                </>
            )}
            {onRefresh && (
                 <Button onClick={onRefresh} variant="outline" size="icon" disabled={loading}>
                    <RefreshCw className={cn(loading && "animate-spin")} />
                </Button>
            )}
          </div>
        </div>
        <div className="mt-4">
          <Input 
            placeholder="Filter by product group or material name..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Product Group</TableHead>
                        <TableHead>Material Name</TableHead>
                        <TableHead className="text-center">Allocated</TableHead>
                        <TableHead className="text-center">Used</TableHead>
                        <TableHead className="text-center">Balance</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                     {loading ? (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center">
                                <RefreshCw className="inline-block mr-2 animate-spin" /> Loading samples...
                            </TableCell>
                        </TableRow>
                    ) : paginatedSamples.length > 0 ? (
                        paginatedSamples.map((sample) => {
                            const used = usedQuantities[sample.materialName] || 0;
                            const balance = sample.allocationQuantity - used;
                            const isLowStock = balance <= 0;
                          
                            return (
                                <TableRow key={sample.id} className={cn(isLowStock && "bg-destructive/10")}>
                                    <TableCell className="font-medium">{sample.productGroup}</TableCell>
                                    <TableCell>{sample.materialName}</TableCell>
                                    <TableCell className="text-center">{sample.allocationQuantity}</TableCell>
                                    <TableCell className="text-center">{used}</TableCell>
                                    <TableCell className={cn("text-center font-bold", isLowStock ? "text-destructive" : "text-primary")}>{balance}</TableCell>
                                </TableRow>
                            );
                        })
                    ) : (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center">
                                {samples.length > 0 ? "No samples match your filter." : "No marketing samples loaded. An admin needs to upload a masterlist."}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
        
        {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                    Showing {Math.min(filteredSamples.length, (currentPage - 1) * itemsPerPage + 1)} to {Math.min(filteredSamples.length, currentPage * itemsPerPage)} of {filteredSamples.length} samples
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                    >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Previous
                    </Button>
                    <span className="text-sm font-medium">
                        Page {currentPage} of {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                    >
                        Next
                        <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                </div>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
