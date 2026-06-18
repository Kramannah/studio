"use client"

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
    Database, 
    HardDrive, 
    ArrowRight, 
    CheckCircle2, 
    AlertTriangle,
    Loader2,
    RefreshCw
} from "lucide-react";
import { collection, query, limit, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { uploadBase64ToStorage, isBase64Image } from "@/lib/storage-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * DATABASE MIGRATION TOOL
 * Moves legacy Base64 strings from coverageEntries to Firebase Storage.
 */
export function DatabaseMigrationTool() {
    const [status, setStatus] = useState<'idle' | 'scanning' | 'migrating' | 'complete'>('idle');
    const [progress, setProgress] = useState({ current: 0, total: 0, errors: 0 });
    const [isProcessing, setIsProcessing] = useState(false);
    const { toast } = useToast();

    const startMigration = async () => {
        if (!db) return;
        setIsProcessing(true);
        setStatus('scanning');
        
        try {
            // 1. Fetch documents that might need migration (Broad scan)
            const snapshot = await getDocs(query(collection(db, "coverageEntries"), limit(200)));
            const docsToMigrate = snapshot.docs.filter(d => {
                const data = d.data();
                return (
                    isBase64Image(data.signature) || 
                    isBase64Image(data.jointCallSignature) || 
                    (data.photos && data.photos.some((p: string) => isBase64Image(p)))
                );
            });

            if (docsToMigrate.length === 0) {
                setStatus('complete');
                toast({ title: "No Base64 records found", description: "Your database is already optimized." });
                setIsProcessing(false);
                return;
            }

            setStatus('migrating');
            setProgress({ current: 0, total: docsToMigrate.length, errors: 0 });

            for (let i = 0; i < docsToMigrate.length; i++) {
                const docSnap = docsToMigrate[i];
                const data = docSnap.data();
                const uid = data.userId || "migrated";
                const timestamp = Date.now();
                const updates: any = {};

                try {
                    // Move Signature
                    if (isBase64Image(data.signature)) {
                        updates.signature = await uploadBase64ToStorage(data.signature, `coverage/${uid}/${timestamp}_mig_sig.jpg`);
                    }

                    // Move Joint Signature
                    if (isBase64Image(data.jointCallSignature)) {
                        updates.jointCallSignature = await uploadBase64ToStorage(data.jointCallSignature, `coverage/${uid}/${timestamp}_mig_joint.jpg`);
                    }

                    // Move Photos
                    if (data.photos && Array.isArray(data.photos)) {
                        const newPhotos = await Promise.all(data.photos.map(async (p, idx) => {
                            if (isBase64Image(p)) {
                                return await uploadBase64ToStorage(p, `coverage/${uid}/${timestamp}_mig_photo_${idx}.jpg`);
                            }
                            return p;
                        }));
                        updates.photos = newPhotos;
                    }

                    // Update Firestore document with URLs
                    await updateDoc(doc(db, "coverageEntries", docSnap.id), updates);
                    setProgress(p => ({ ...p, current: i + 1 }));

                } catch (err) {
                    console.error(`Migration failed for doc ${docSnap.id}:`, err);
                    setProgress(p => ({ ...p, current: i + 1, errors: p.errors + 1 }));
                }
            }

            setStatus('complete');
            toast({ title: "Migration Batch Finished", description: `Processed ${docsToMigrate.length} records.` });

        } catch (error) {
            console.error("Migration fatal error:", error);
            toast({ variant: "destructive", title: "Migration Failed", description: "An unexpected error occurred during batch processing." });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Card className="border-2 shadow-lg max-w-4xl mx-auto">
            <CardHeader className="bg-primary/5 border-b-2">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-xl">
                        <Database className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl font-black font-headline">Payload Optimization Engine</CardTitle>
                        <CardDescription>Move legacy Base64 images to Firebase Storage to shrink document size and fix veteran account crashes.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 border-2 rounded-2xl bg-muted/30 flex flex-col items-center text-center gap-2">
                        <Database className="w-6 h-6 text-muted-foreground" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Step 1: Scan</p>
                        <p className="text-xs text-muted-foreground">Find documents with inline Base64 data strings.</p>
                    </div>
                    <div className="p-4 border-2 rounded-2xl bg-muted/30 flex flex-col items-center text-center gap-2">
                        <HardDrive className="w-6 h-6 text-muted-foreground" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Step 2: Offload</p>
                        <p className="text-xs text-muted-foreground">Upload images to binary storage bucket.</p>
                    </div>
                    <div className="p-4 border-2 rounded-2xl bg-muted/30 flex flex-col items-center text-center gap-2">
                        <CheckCircle2 className="w-6 h-6 text-muted-foreground" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Step 3: Point</p>
                        <p className="text-xs text-muted-foreground">Replace Base64 strings with lightweight URLs.</p>
                    </div>
                </div>

                {status !== 'idle' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-sm font-black font-headline uppercase text-primary tracking-tight">
                                    {status === 'scanning' && "Scanning for legacy records..."}
                                    {status === 'migrating' && "Migrating binary assets..."}
                                    {status === 'complete' && "Optimization complete!"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Processed {progress.current} of {progress.total} identified records.
                                </p>
                            </div>
                            <p className="text-2xl font-black font-headline">
                                {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%
                            </p>
                        </div>
                        <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} className="h-3 border-2" />
                        
                        {progress.errors > 0 && (
                            <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20 text-xs font-bold">
                                <AlertTriangle className="w-4 h-4" />
                                Warning: {progress.errors} records failed to migrate.
                            </div>
                        )}
                    </div>
                )}

                <div className="pt-4">
                    <Button 
                        onClick={startMigration} 
                        disabled={isProcessing} 
                        size="lg"
                        className="w-full h-16 text-lg font-black font-headline rounded-2xl shadow-xl transition-all active:scale-95"
                    >
                        {isProcessing ? (
                            <>
                                {status === 'scanning' ? <RefreshCw className="mr-3 h-6 w-6 animate-spin" /> : <Loader2 className="mr-3 h-6 w-6 animate-spin" />}
                                Processing Database (Don't Close Window)...
                            </>
                        ) : (
                            <>
                                <Database className="mr-3 h-6 w-6" />
                                {status === 'complete' ? 'Run Another Batch' : 'Start Optimization Migration'}
                            </>
                        )}
                    </Button>
                    <p className="text-center text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-4">
                        Note: Migration processes 200 documents per batch to avoid network timeouts.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
