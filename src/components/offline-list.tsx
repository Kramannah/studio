
"use client"

import type { CoverageEntry } from "@/lib/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { format, parseISO, isValid } from "date-fns";
import Image from "next/image";
import React, { useState } from "react";
import { Button } from "./ui/button";
import { RefreshCw, Hourglass, Edit, Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";

type OfflineListProps = {
  entries: CoverageEntry[];
  isSyncing: boolean;
  isOnline: boolean;
  syncAll: () => void;
  onEdit: (entry: CoverageEntry) => void;
};

export function OfflineList({ entries, isSyncing, isOnline, syncAll, onEdit }: OfflineListProps) {
  const [previewData, setPreviewData] = useState<{ src: string, title: string } | null>(null);

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">No offline entries pending.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
       <Card>
        <CardHeader>
            <div className="flex items-center justify-between">
                <div>
                    <CardTitle className="font-headline">Pending Entries</CardTitle>
                    <CardDescription>{entries.length} entries waiting to be synced.</CardDescription>
                </div>
                <Button onClick={syncAll} disabled={isSyncing || !isOnline} className="font-headline">
                    {isSyncing ? <RefreshCw className="mr-2 animate-spin" /> : <RefreshCw className="mr-2" />}
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                </Button>
            </div>
        </CardHeader>
      </Card>
      {entries.map(entry => {
        const coverageDate = entry.coverageDate ? parseISO(entry.coverageDate) : null;
        const submittedAt = entry.submittedAt ? parseISO(entry.submittedAt) : null;

        return (
          <Card key={entry.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-headline">{entry.firstName} {entry.lastName}</CardTitle>
                  <CardDescription>{entry.specialty} - {entry.clinic}</CardDescription>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Hourglass size={14} />
                  <span>Pending Sync</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p><strong>Coverage Date:</strong> {coverageDate && isValid(coverageDate) ? format(coverageDate, "PPP") : 'Invalid Date'}</p>
                    <p><strong>Coverage Type:</strong> <span className="capitalize">{entry.coverageType}</span></p>
                    <p><strong>Submitted:</strong> {submittedAt && isValid(submittedAt) ? format(submittedAt, "PPpp") : 'Invalid Date'}</p>
                  </div>
                  <div className="flex flex-wrap gap-4">
                      {entry.photos && entry.photos.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold uppercase text-muted-foreground">Proof Photo</h4>
                          <div 
                            className="relative h-20 w-32 rounded-md overflow-hidden border-2 border-primary/20 cursor-pointer group"
                            onClick={() => setPreviewData({ src: entry.photos![0], title: `Offline Photo: ${entry.firstName}` })}
                          >
                            <Image src={entry.photos[0]} alt="proof" fill className="object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Maximize2 className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        </div>
                      )}
                      {entry.signature && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold uppercase text-muted-foreground">Signature</h4>
                          <div 
                            className="p-1 bg-white border rounded-md shadow-sm flex items-center justify-center h-20 w-32 cursor-pointer group relative"
                            onClick={() => setPreviewData({ src: entry.signature!, title: `Offline Signature: ${entry.firstName}` })}
                          >
                              <Image src={entry.signature} alt="signature" width={100} height={50} className="object-contain" />
                              <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Maximize2 className="w-4 h-4 text-primary" />
                            </div>
                          </div>
                        </div>
                      )}
                  </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" onClick={() => onEdit(entry)}>
                  <Edit className="mr-2" />
                  Edit Entry
              </Button>
            </CardFooter>
          </Card>
        )
      })}

        <Dialog open={!!previewData} onOpenChange={(open) => !open && setPreviewData(null)}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden border-none bg-black/90">
                <div className="relative w-full h-[80vh] flex items-center justify-center p-4">
                    {previewData?.src && (
                        <Image 
                            src={previewData.src} 
                            alt="Proof Preview" 
                            width={1200} 
                            height={800} 
                            className={cn(
                                "max-w-full max-h-full object-contain rounded-md shadow-2xl",
                                previewData.title.includes("Signature") ? "bg-white p-8" : ""
                            )} 
                        />
                    )}
                </div>
                <div className="absolute top-4 left-4">
                    <Badge className="bg-primary text-primary-foreground font-headline text-sm px-4 py-1.5 shadow-lg">
                        {previewData?.title}
                    </Badge>
                </div>
            </DialogContent>
        </Dialog>
    </div>
  );
}
