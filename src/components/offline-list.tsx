
"use client"

import type { CoverageEntry } from "@/lib/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { format, parseISO, isValid } from "date-fns";
import Image from "next/image";
import React, { useState, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { RefreshCw, Hourglass, Edit, Maximize2, Trash2, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { cn, parseAnyDate } from "@/lib/utils";
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

const ZoomableImage = ({ src, alt, isSignature = false }: { src: string; alt: string; isSignature?: boolean }) => {
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      setOrigin({ x, y });

      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      setScale((s) => Math.min(Math.max(s + delta, 1), 8));
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden w-full aspect-[4/3] rounded-2xl bg-black/10 border-2 border-white/5 cursor-crosshair group"
    >
      <div
        className="w-full h-full transition-transform duration-150 ease-out"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: `${origin.x}% ${origin.y}%`,
        }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          className={cn(
            "object-contain",
            isSignature ? "bg-white p-12" : ""
          )}
        />
      </div>
      <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Badge variant="secondary" className="bg-black/60 backdrop-blur-md text-white border-none font-mono">
            {Math.round(scale * 100)}%
        </Badge>
        <Button 
            size="icon" 
            variant="secondary" 
            className="h-8 w-8 rounded-full bg-black/60 hover:bg-primary border-none text-white"
            onClick={(e) => { e.stopPropagation(); setScale(1); setOrigin({ x: 50, y: 50 }); }}
        >
            <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

type OfflineListProps = {
  entries: CoverageEntry[];
  isSyncing: boolean;
  isOnline: boolean;
  syncAll: () => void;
  onEdit: (entry: CoverageEntry) => void;
  onDelete?: (id: string) => void;
};

export function OfflineList({ entries, isSyncing, isOnline, syncAll, onEdit, onDelete }: OfflineListProps) {
  const [previewData, setPreviewData] = useState<{ src: string, title: string, isSignature?: boolean } | null>(null);

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
        const coverageDate = parseAnyDate(entry.coverageDate);
        const submittedAt = parseAnyDate(entry.submittedAt);

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
                    <p><strong>Coverage Date:</strong> {coverageDate && isValid(coverageDate) ? format(coverageDate, "PPP") : <span className="text-destructive font-bold">Invalid Date</span>}</p>
                    <p><strong>Coverage Type:</strong> <span className="capitalize">{entry.coverageType}</span></p>
                    <p><strong>Captured:</strong> {submittedAt && isValid(submittedAt) ? format(submittedAt, "PPpp") : <span className="text-destructive font-bold">Invalid Date</span>}</p>
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
                            onClick={() => setPreviewData({ src: entry.signature!, title: `Offline Signature: ${entry.firstName}`, isSignature: true })}
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
            <CardFooter className="gap-3">
              <Button variant="outline" className="flex-1 font-headline" onClick={() => onEdit(entry)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Entry
              </Button>
              {onDelete && (
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground font-headline h-10 px-4">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Discard Offline Report?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently remove this report from your phone's memory. It will not be synced to the database. Use this to clear stuck or duplicate reports.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(entry.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Delete Permanently
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
              )}
            </CardFooter>
          </Card>
        )
      })}

        <Dialog open={!!previewData} onOpenChange={(open) => !open && setPreviewData(null)}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden border-none bg-black/90">
                <DialogHeader className="sr-only">
                    <DialogTitle>{previewData?.title || "Offline Proof Preview"}</DialogTitle>
                </DialogHeader>
                <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <Badge className="bg-primary text-primary-foreground font-headline text-sm px-4 py-1.5 shadow-lg">
                            {previewData?.title}
                        </Badge>
                        <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">Scroll wheel to zoom to cursor</p>
                    </div>
                    {previewData?.src && (
                        <ZoomableImage src={previewData.src} alt="Proof Preview" isSignature={previewData.isSignature} />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    </div>
  );
}
