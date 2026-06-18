"use client"

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
    Database, 
    HardDrive, 
    ShieldCheck, 
    CheckCircle2, 
    Activity,
    Loader2,
    RefreshCw,
    Search,
    BarChart3,
    ArrowUpRight,
    AlertCircle
} from "lucide-react";
import { collection, query, limit, getDocs, getCountFromServer, where, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isBase64Image, uploadBase64ToStorage } from "@/lib/storage-utils";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * DATABASE OPTIMIZATION ENGINE (V9.0)
 * Manages the manual migration of legacy Base64 data to Firebase Storage.
 */
export function DatabaseMigrationTool() {
    const [status, setStatus] = useState<'idle' | 'scanning' | 'processing' | 'complete'>('idle');
    const [stats, setStats] = useState({ legacy: 0, optimized: 0, total: 0, globalMigrated: 0 });
    const [isProcessing, setIsProcessing] = useState(false);
    const [skippedCount, setSkippedCount] = useState(0);
    const { toast } = useToast();

    const scanDatabaseHealth = async () => {
        if (!db) return;
        setIsProcessing(true);
        
        try {
            // 1. Health Density Scan (Check latest 1,000)
            const snapshot = await getDocs(query(collection(db, "coverageEntries"), limit(1000)));
            let legacyCount = 0;
            
            snapshot.docs.forEach(d => {
                const data = d.data();
                const isLegacy = isBase64Image(data.signature) || 
                               isBase64Image(data.jointCallSignature) || 
                               (data.photos && Array.isArray(data.photos) && data.photos.some((p: string) => isBase64Image(p)));
                
                if (isLegacy) legacyCount++;
            });

            // 2. Exact Success Counter
            const countSnapshot = await getCountFromServer(
                query(collection(db, "coverageEntries"), where("migrationStatus", "==", "optimized"))
            );

            setStats({
                legacy: legacyCount,
                optimized: snapshot.docs.length - legacyCount,
                total: snapshot.docs.length,
                globalMigrated: countSnapshot.data().count
            });

            setStatus('idle');
        } catch (error: any) {
            console.warn("Health scan failure:", error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const startOptimization = async () => {
        if (!db || isProcessing) return;
        setIsProcessing(true);
        setStatus('processing');
        setSkippedCount(0);
        
        let processedInBatch = 0;
        let batchSkipped = 0;

        try {
            // Fetch potential legacy records (Broad scan for Admins)
            const snapshot = await getDocs(query(collection(db, "coverageEntries"), limit(200)));
            const legacyDocs = snapshot.docs.filter(d => {
                const data = d.data();
                return isBase64Image(data.signature) || 
                       isBase64Image(data.jointCallSignature) || 
                       (data.photos && Array.isArray(data.photos) && data.photos.some((p: string) => isBase64Image(p)));
            });

            if (legacyDocs.length === 0) {
                toast({ title: "Database Clean", description: "No legacy records found in the current queue." });
                setStatus('complete');
                setIsProcessing(false);
                return;
            }

            for (const docSnap of legacyDocs) {
                const data = docSnap.data();
                const uid = data.userId || "system_migration";
                const timestamp = Date.now();
                const updates: any = { migrationStatus: "optimized" };

                try {
                    // Upload Base64 to Storage
                    if (isBase64Image(data.signature)) {
                        updates.signature = await uploadBase64ToStorage(data.signature, `coverage/${uid}/${timestamp}_sig.jpg`);
                    }
                    if (isBase64Image(data.jointCallSignature)) {
                        updates.jointCallSignature = await uploadBase64ToStorage(data.jointCallSignature, `coverage/${uid}/${timestamp}_joint.jpg`);
                    }
                    if (data.photos && Array.isArray(data.photos)) {
                        updates.photos = await Promise.all(data.photos.map((p, i) => 
                            isBase64Image(p) ? uploadBase64ToStorage(p, `coverage/${uid}/${timestamp}_p${i}.jpg`) : Promise.resolve(p)
                        ));
                    }

                    // Update Firestore
                    await updateDoc(doc(db, "coverageEntries", docSnap.id), updates);
                    processedInBatch++;
                    
                    // Throttled loop to prevent Rule engine timeout
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (err: any) {
                    // Track Permission Propagation skips
                    batchSkipped++;
                    setSkippedCount(prev => prev + 1);
                }
            }

            toast({ 
                title: "Batch Finished", 
                description: `Optimized ${processedInBatch} records. ${batchSkipped} skipped (Rule Throttling).` 
            });

        } catch (error: any) {
            toast({ variant: "destructive", title: "Process Halted", description: error.message });
        } finally {
            setIsProcessing(false);
            scanDatabaseHealth();
        }
    };

    useEffect(() => {
        scanDatabaseHealth();
    }, []);

    const healthPercentage = stats.total > 0 ? Math.round((stats.optimized / stats.total) * 100) : 0;

    return (
        <Card className="border-2 shadow-lg max-w-4xl mx-auto">
            <CardHeader className="bg-primary/5 border-b-2">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-xl">
                        <Database className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl font-black font-headline tracking-tight text-primary">Migration Engine</CardTitle>
                        <CardDescription>Manually offload Base64 data to Firebase Storage.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-5 border-2 rounded-2xl bg-primary/10 flex flex-col items-center text-center gap-2 border-primary/20 shadow-sm">
                        <CheckCircle2 className="w-7 h-7 text-primary" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary/70">MIGRATED</p>
                        <p className="text-3xl font-black font-headline text-primary">{stats.globalMigrated.toLocaleString()}</p>
                    </div>
                    <div className="p-5 border-2 rounded-2xl bg-muted/30 flex flex-col items-center text-center gap-2">
                        <Activity className="w-6 h-6 text-muted-foreground" />
                        <p className="text-[10px] font-black uppercase tracking-widest">DENSITY</p>
                        <p className="text-sm font-bold">{healthPercentage}% Optimized</p>
                    </div>
                    <div className="p-5 border-2 rounded-2xl bg-muted/30 flex flex-col items-center text-center gap-2">
                        <BarChart3 className="w-6 h-6 text-muted-foreground" />
                        <p className="text-[10px] font-black uppercase tracking-widest">PENDING</p>
                        <p className="text-sm font-bold">{stats.legacy} in queue</p>
                    </div>
                </div>

                <div className="space-y-4 bg-muted/20 p-6 rounded-2xl border-2">
                    <div className="flex justify-between items-end">
                        <div>
                            <p className="text-sm font-black font-headline uppercase text-primary tracking-tight">
                                System Health (Recent Sample)
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {stats.optimized} optimized out of {stats.total} recent records.
                            </p>
                        </div>
                        <p className="text-2xl font-black font-headline">{healthPercentage}%</p>
                    </div>
                    <Progress value={healthPercentage} className="h-3 border-2" />
                </div>

                {skippedCount > 0 && (
                    <Alert variant="destructive" className="border-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle className="font-headline">Permission Propagation Delay</AlertTitle>
                        <AlertDescription className="text-xs">
                            {skippedCount} records were skipped because the Storage Rules engine throttled the requests. Run the batch again in 60 seconds.
                        </AlertDescription>
                    </Alert>
                )}

                <div className="pt-4 space-y-4">
                    <Button 
                        onClick={startOptimization} 
                        disabled={isProcessing} 
                        size="lg"
                        className="w-full h-16 text-lg font-black font-headline rounded-2xl shadow-xl transition-all active:scale-95 bg-primary text-primary-foreground"
                    >
                        {isProcessing ? (
                            <><RefreshCw className="mr-3 h-6 w-6 animate-spin" /> Processing Batch (200)...</>
                        ) : (
                            <><ArrowUpRight className="mr-3 h-6 w-6" /> Start Optimization Batch</>
                        )}
                    </Button>
                    <Button 
                        variant="outline" 
                        onClick={scanDatabaseHealth} 
                        disabled={isProcessing} 
                        className="w-full h-12 border-2 rounded-xl font-headline"
                    >
                        Refresh Health Telemetry
                    </Button>
                    <p className="text-center text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                        Throttling: 100ms per record. Max batch size: 200 records.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}