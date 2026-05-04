
"use client"

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, PackagePlus, FileDown, Loader2, FileSpreadsheet, AlertCircle } from "lucide-react";
import { useAdminMarketingSamples } from "@/hooks/use-marketing-samples";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import type { MarketingSample } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function AddMarketingSamples({ onRefresh }: { onRefresh?: () => void }) {
  const { addMarketingSamplesBulk } = useAdminMarketingSamples();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDownloadTemplate = () => {
    const headers = ['ProdGroupProdSubGroup', 'DisplayMaterialName', 'AllocationQuantity'];
    const sampleData = [
        { 'ProdGroupProdSubGroup': 'Antihistamine - Ricam Syrup', 'DisplayMaterialName': 'PQ3_Frutos Candy', 'AllocationQuantity': 180 }
    ];
    const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
    XLSX.writeFile(workbook, "marketing_samples_template.xlsx");
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file extension manually for immediate feedback
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(extension || '')) {
        toast({ 
            variant: "destructive", 
            title: "Invalid File Type", 
            description: "Please upload an Excel (.xlsx, .xls) or CSV (.csv) file." 
        });
        return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // Parse JSON with defensive header mapping
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
          group: findColIndex(['prodgroupprodsubgroup', 'product group', 'product', 'group', 'category']),
          name: findColIndex(['displaymaterialname', 'material name', 'material', 'name', 'item']),
          qty: findColIndex(['allocationquantity', 'allocation quantity', 'allocation', 'quantity', 'qty', 'count'])
        };

        if (colMap.name === -1 || colMap.qty === -1) {
          toast({ 
              variant: "destructive", 
              title: "Header Mismatch", 
              description: "Could not find 'Material Name' or 'Quantity' columns. Please use the official template." 
          });
          setIsUploading(false);
          return;
        }

        const samplesToAdd: Omit<MarketingSample, 'id'>[] = [];
        for (const row of bodyRows) {
          const name = String(row[colMap.name] || '').trim();
          const qtyString = String(row[colMap.qty]).replace(/[^0-9.]/g, '');
          const qty = parseFloat(qtyString);
          const group = colMap.group > -1 ? String(row[colMap.group] || '').trim() : "Uncategorized";
          
          if (name && !isNaN(qty)) {
            samplesToAdd.push({ 
                productGroup: group, 
                materialName: name, 
                allocationQuantity: Math.round(qty) 
            });
          }
        }

        if (samplesToAdd.length === 0) {
            toast({ variant: "destructive", title: "No Valid Data", description: "No valid products found in the file." });
            setIsUploading(false);
            return;
        }

        const success = await addMarketingSamplesBulk(samplesToAdd);
        if (success) {
          toast({ title: "Import Successful", description: `${samplesToAdd.length} products updated in the database.` });
          if (onRefresh) onRefresh();
        }
      } catch (error: any) {
        console.error("PARSING ERROR:", error);
        toast({ variant: "destructive", title: "Technical Error", description: "Failed to read the file. Ensure it is not password protected." });
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="border-2 shadow-lg">
        <CardHeader className="bg-primary/5 border-b-2">
          <CardTitle className="font-headline text-2xl flex items-center gap-2 text-primary">
            <PackagePlus className="w-6 h-6" />
            Bulk Inventory Management
          </CardTitle>
          <CardDescription className="text-base">
            Upload your Excel or CSV file to update allocations for marketing samples.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-headline font-bold text-lg flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-muted-foreground" />
                1. Preparation
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Download the official template to ensure your column headers match the system's requirements. 
              </p>
              <Button onClick={handleDownloadTemplate} variant="outline" className="w-full border-2 h-12 font-headline">
                <FileDown className="mr-2 h-5 w-5" /> Download Template
              </Button>
            </div>

            <div className="space-y-4">
              <h3 className="font-headline font-bold text-lg flex items-center gap-2">
                <PackagePlus className="w-5 h-5 text-muted-foreground" />
                2. Upload & Sync
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Click below to select your file. The system will automatically update the total allocated quantities.
              </p>
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
                className="w-full h-12 font-headline shadow-lg transition-all active:scale-95"
              >
                {isUploading ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processing Database...</>
                ) : (
                  <><Download className="mr-2 h-5 w-5 rotate-180" /> Import File (.xlsx, .xls, .csv)</>
                )}
              </Button>
            </div>
          </div>

          <Alert className="mt-8 border-2 bg-muted/30">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="font-headline font-bold">Technical Requirements</AlertTitle>
            <AlertDescription className="text-xs space-y-2 mt-1">
              <p>• Supported Formats: <strong>Excel (.xlsx, .xls)</strong> and <strong>CSV (.csv)</strong></p>
              <p>• Mandatory Headers: <strong>DisplayMaterialName</strong> and <strong>AllocationQuantity</strong></p>
              <p>• Security: Ensure you are logged in as <strong>mbustamante@hovidinc.com</strong> to perform this action.</p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
