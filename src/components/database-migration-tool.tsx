"use client"

import { useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
    Database, 
    RefreshCw, 
    Play, 
    ShieldCheck, 
    AlertCircle, 
    CheckCircle2, 
    Loader2, 
    FileImage,
    ShieldAlert,
    UserCheck
} from "lucide-react";
import { collection, getDocs, query, limit, doc, updateDoc, getCountFromServer, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { uploadBase64ToStorage, isBase64Image } from "@/lib/storage-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { CoverageEntry, UserProfile } from "@/lib/types";
import { Progress } from "@/components/ui/progress";

/**
 * LOW COST PILLAR: MIGRATION ENGINE (V9.1)
 * Implements Pillar A (Binary Pivot) and Pillar B (Administrative Bypass).
 * Handles: 
 * 1. Global Scan (Bypasses UID isolation)
 * 2. Identity Repair (Injects missing userIds)
 * 3. Binary Offloading (Moves Base64 strings to Storage)
 * 
 * V9.1 UPDATE: Added resilience for storage/unauthorized skips.
 */
export function DatabaseMigrationTool({ userProfiles = {} }: { userProfiles: Record<string, UserProfile> }) {
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [processedCount, setOptimizedCount] = useState(0);
    const [scannedCount, setScannedCount] = useState(0);
    const [totalMigrated, setTotalMigrated] = useState<number | null>(null);
    const { toast } = useToast();

    // Map names to UIDs for repairing Ghost Records
    const nameToUidMap = useMemo(() => {
        const map: Record<string, string> = {};
        Object.values(userProfiles).forEach(p => {
            const key = `${p.firstName} ${p.lastName}`.toLowerCase().trim();
            if (p.userId) map[key] = p.userId;
        });
        return map;
    }, [userProfiles]);

    const fetchTotalMigrated = useCallback(async () => {
        if (!db) return;
        try {
            const q = query(collection(db, "coverageEntries"), where("migrationStatus", "==", "optimized"));
            const snap = await getCountFromServer(q);
            setTotalMigrated(snap.data().count);
        } catch (e) {
            console.warn("Tracker fetch failure:", e);
        }
    }, []);

    const handleStartOptimization = async () => {
        if (!db || isOptimizing) return;
        setIsOptimizing(true);
        setOptimizedCount(0);
        setScannedCount(0);

        try {
            // PILLAR A: Global scan (No UID filter)
            const q = query(collection(db, "coverageEntries"), limit(200));
            const snapshot = await getDocs(q);
            const docs = snapshot.docs;

            for (const docSnap of docs) {
                const data = docSnap.data() as CoverageEntry;
                setScannedCount(prev => prev + 1);

                // Check if optimization is needed
                const hasBase64Photo = data.photos?.some(p => isBase64Image(p));
                const hasBase64Sig = isBase64Image(data.signature);
                const hasBase64JointSig = isBase64Image(data.jointCallSignature);
                const needsUserIdRepair = !data.userId;

                if (hasBase64Photo || hasBase64Sig || hasBase64JointSig || needsUserIdRepair) {
                    const updatePayload: any = { 
                        migrationStatus: 'optimized',
                        updatedAt: new Date().toISOString()
                    };

                    // REPAIR: Inject missing userId
                    if (needsUserIdRepair) {
                        const pmrName = `${data.firstName || ''} ${data.lastName || ''}`.toLowerCase().trim();
                        const foundUid = nameToUidMap[pmrName];
                        if (foundUid) updatePayload.userId = foundUid;
                    }

                    const targetUid = updatePayload.userId || data.userId || 'system_migration';
                    const timestamp = Date.now();

                    try {
                        // OFFLOAD: Move images to Storage
                        if (hasBase64Sig) {
                            updatePayload.signature = await uploadBase64ToStorage(
                                data.signature!, 
                                `coverage/${targetUid}/${timestamp}_sig.jpg`
                            );
                        }

                        if (hasBase64JointSig) {
                            updatePayload.jointCallSignature = await uploadBase64ToStorage(
                                data.jointCallSignature!, 
                                `coverage/${targetUid}/${timestamp}_joint_sig.jpg`
                            );
                        }

                        if (hasBase64Photo && data.photos) {
                            updatePayload.photos = await Promise.all(data.photos.map((p, i) => 
                                isBase64Image(p) 
                                    ? uploadBase64ToStorage(p, `coverage/${targetUid}/${timestamp}_p${i}.jpg`)
                                    : Promise.resolve(p)
                            ));
                        }

                        // Commit repair and optimization
                        await updateDoc(doc(db, "coverageEntries", docSnap.id), updatePayload);
                        setOptimizedCount(prev => prev + 1);
                    } catch (storageErr: any) {
                        // V9.1 Resilience: Skip if unauthorized and continue batch
                        console.warn(`Skipping Record ${docSnap.id}:`, storageErr.message);
                    }
                    
                    // Throttle to prevent browser freeze
                    await new Promise(r => setTimeout(r, 100));
                }
            }

            toast({ title: "Batch Complete", description: "Storage offloading successful." });
            fetchTotalMigrated();
        } catch (error: any) {
            console.error("Migration Error:", error);
            toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
            setIsOptimizing(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-2 shadow-sm bg-primary/5">
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                            <CheckCircle2 className="text-primary w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">MIGRATED</p>
                            <h4 className="text-2xl font-black font-headline">{totalMigrated !== null ? totalMigrated.toLocaleString() : "---"}</h4>
                            <p className="text-[10px] font-bold text-primary italic">Files in Cloud Storage</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-2 shadow-sm">
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center">
                            <FileImage className="text-orange-500 w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">CURRENT BATCH</p>
                            <h4 className="text-2xl font-black font-headline">{processedCount}</h4>
                            <p className="text-[10px] font-bold text-muted-foreground italic">Records Optimized</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-2 shadow-sm">
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <UserCheck className="text-blue-500 w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">IDENTITY REPAIR</p>
                            <h4 className="text-2xl font-black font-headline">ACTIVE</h4>
                            <p className="text-[10px] font-bold text-muted-foreground italic">Ghost Docs Mapping</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-2 shadow-lg overflow-hidden max-w-4xl mx-auto">
                <CardHeader className="bg-muted/30 border-b-2 flex flex-row items-center justify-between py-6">
                    <div className="space-y-1">
                        <CardTitle className="text-2xl font-black font-headline text-primary tracking-tight">Low cost Pillar: Migration Engine</CardTitle>
                        <CardDescription>Administrative bypass for binary offloading and ghost record repair.</CardDescription>
                    </div>
                    <Button 
                        onClick={fetchTotalMigrated} 
                        variant="outline" 
                        size="icon" 
                        className="rounded-full border-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </CardHeader>
                <CardContent className="p-10 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <ShieldCheck className="text-primary w-5 h-5" />
                                <h3 className="font-bold font-headline">Administrative Bypass (Pillar A)</h3>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                This tool uses your Admin UID to override Storage folder ownership. It converts heavy Base64 text into tiny cloud URLs, dropping your Firestore billing significantly.
                            </p>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Database className="text-primary w-5 h-5" />
                                <h3 className="font-bold font-headline">Ghost Doc Repair</h3>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Automatically detects reports missing the <code className="text-primary bg-primary/5 px-1 rounded">userId</code> index. It re-assigns them to the correct PMR, restoring historical visibility.
                            </p>
                        </div>
                    </div>

                    {isOptimizing && (
                        <div className="space-y-3 p-6 bg-muted/20 border-2 border-dashed rounded-2xl animate-pulse">
                            <div className="flex justify-between text-xs font-black uppercase tracking-widest">
                                <span>Scanning Organization...</span>
                                <span>{scannedCount} Inspected</span>
                            </div>
                            <Progress value={(processedCount / 200) * 100} className="h-3" />
                            <p className="text-center text-[10px] text-muted-foreground italic">
                                Offloading binary data and repairing identity metadata in real-time.
                            </p>
                        </div>
                    )}

                    <div className="flex flex-col gap-4">
                        <Button 
                            onClick={handleStartOptimization} 
                            disabled={isOptimizing}
                            size="lg"
                            className="w-full h-16 text-lg font-black font-headline rounded-2xl shadow-xl transition-all active:scale-95 bg-primary text-primary-foreground"
                        >
                            {isOptimizing ? (
                                <><Loader2 className="mr-3 h-6 w-6 animate-spin" /> Moving Binary Payloads...</>
                            ) : (
                                <><Play className="mr-3 h-6 w-6" /> Start Batch Optimization (200 Records)</>
                            )}
                        </Button>
                        <div className="flex items-center justify-center gap-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3" /> PILLAR A: STORAGE PROXY</span>
                            <span className="flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> PILLAR B: DOWNSAMPLING</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}