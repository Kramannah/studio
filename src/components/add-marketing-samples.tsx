"use client"

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, PackagePlus, FileDown, Loader2 } from "lucide-react";
import { useAdminMarketingSamples } from "@/hooks/use-marketing-samples";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import type { MarketingSample } from "@/lib/types";

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

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        if (json.length < 2) {
          toast({ variant: "destructive", title: "Empty File", description: "Your Excel file has no data." });
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
          toast({ variant: "destructive", title: "Missing Columns", description: "Ensure headers are: ProdGroupProdSubGroup, DisplayMaterialName, AllocationQuantity" });
          setIsUploading(false);
          return;
        }

        const samplesToAdd: Omit<MarketingSample, 'id'>[] = [];
        for (const row of bodyRows) {
          const name = String(row[colMap.name] || '').trim();
          const qty = Number(row[colMap.qty]);
          const group = colMap.group > -1 ? String(row[colMap.group] || '').trim() : "Uncategorized";
          if (name && !isNaN(qty)) {
            samplesToAdd.push({ productGroup: group, materialName: name, allocationQuantity: Math.round(qty) });
          }
        }

        const success = await addMarketingSamplesBulk(samplesToAdd);
        if (success) {
          toast({ title: "Import Successful", description: `${samplesToAdd.length} materials updated.` });
          if (onRefresh) onRefresh();
        }
      } catch (error: any) {
        toast({ variant: "destructive", title: "Technical Error", description: error.message || "Failed to process Excel file." });
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
            Upload your Excel file to update allocations for marketing samples.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-headline font-bold text-lg">1. Preparation</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Download the official template to ensure your column headers match the system's requirements. The file must be in <strong>.xlsx</strong> or <strong>.xls</strong> format.
              </p>
              <Button onClick={handleDownloadTemplate} variant="outline" className="w-full border-2 h-12 font-headline">
                <FileDown className="mr-2 h-5 w-5" /> Download Template
              </Button>
            </div>

            <div className="space-y-4">
              <h3 className="font-headline font-bold text-lg">2. Upload & Sync</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Once your file is ready, click below to upload. The system will automatically match materials and update their total allocated quantities.
              </p>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls" />
              <Button 
                onClick={handleUploadClick} 
                disabled={isUploading} 
                className="w-full h-12 font-headline shadow-lg transition-all active:scale-95"
              >
                {isUploading ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processing File...</>
                ) : (
                  <><Download className="mr-2 h-5 w-5 rotate-180" /> Import Excel File</>
                )}
              </Button>
            </div>
          </div>

          <div className="mt-8 p-4 bg-muted/30 rounded-xl border-2 border-dashed">
            <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Technical Requirements</h4>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li>Columns required: <strong>ProdGroupProdSubGroup</strong>, <strong>DisplayMaterialName</strong>, <strong>AllocationQuantity</strong></li>
              <li>Material names must be unique to avoid overwriting unrelated products.</li>
              <li>Quantities will be rounded to the nearest whole number.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
