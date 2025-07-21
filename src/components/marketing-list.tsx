
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
import { useState, useMemo, useRef } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Upload, Download } from "lucide-react";
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type MarketingListProps = {
  samples: MarketingSample[];
  usedQuantities: Record<string, number>;
  onAddSamplesBulk: (samples: Omit<MarketingSample, 'id'>[]) => void;
}

export function MarketingList({ samples, usedQuantities, onAddSamplesBulk }: MarketingListProps) {
  const [filter, setFilter] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const filteredSamples = useMemo(() => {
    return samples.filter(sample =>
      sample.productGroup.toLowerCase().includes(filter.toLowerCase()) ||
      sample.materialName.toLowerCase().includes(filter.toLowerCase())
    );
  }, [samples, filter]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
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

        onAddSamplesBulk(mappedData);
      } catch (error) {
        console.error("Failed to parse Excel file", error);
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: "There was an error processing the Excel file. Please ensure it is a valid .xlsx or .xls file.",
        });
      } finally {
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
            <CardDescription>Upload and monitor your marketing promotional materials.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".xlsx, .xls"
            />
             <Button onClick={handleDownloadTemplate} variant="outline">
              <Download className="mr-2" />
              Download Template
            </Button>
            <Button onClick={handleUploadClick} variant="outline">
              <Upload className="mr-2" />
              Upload Masterlist
            </Button>
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
                    {filteredSamples.length > 0 ? (
                        filteredSamples.map((sample) => {
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
                                {samples.length > 0 ? "No samples match your filter." : "No marketing samples loaded. Upload a masterlist to begin."}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
      </CardContent>
    </Card>
  );
}
