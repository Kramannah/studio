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
    BarChart3
} from "lucide-react";
import { collection, query, limit, getDocs, getCountFromServer, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isBase64Image } from "@/lib/storage-utils";
import { useToast } from "@/hooks/use-toast";

/**
 * SYSTEM HEALTH MONITOR (Self-Healing Observer)
 * Tracks background migration progress across the organization.
 */
export function DatabaseMigrationTool() {
    const [status, setStatus] = useState<'idle' | 'scanning' | 'complete'>('idle');
    const [stats, setStats] = useState({ legacy: 0, optimized: 0, total: 0, globalMigrated: 0 });
    const [isProcessing, setIsProcessing] = useState(false);
    const { toast } = useToast();

    const scanDatabaseHealth = async () => {
        if (!db) return;
        setIsProcessing(true);
        setStatus('scanning');
        
        try {
            // 1. Density Sample (Check latest 1,000 for health percentage)
            const snapshot = await getDocs(query(collection(db, "coverageEntries"), limit(1000)));
            let legacyCount = 0;
            
            snapshot.docs.forEach(d => {
                const data = d.data();
                const isLegacy = isBase64Image(data.signature) || 
                               isBase64Image(data.jointCallSignature) || 
                               (data.photos && Array.isArray(data.photos) && data.photos.some((p: string) => isBase64Image(p)));
                
                if (isLegacy) legacyCount++;
            });

            // 2. Global Aggregate Count (Total exact number of migrated files)
            const countSnapshot = await getCountFromServer(
                query(collection(db, "coverageEntries"), where("migrationStatus", "==", "optimized"))
            );
            const globalCount = countSnapshot.data().count;

            setStats({
                legacy: legacyCount,
                optimized: snapshot.docs.length - legacyCount,
                total: snapshot.docs.length,
                globalMigrated: globalCount
            });

            setStatus('complete');
            toast({ title: "Audit Complete", description: "Database telemetry updated." });

        } catch (error: any) {
            console.warn("Audit failure:", error.message);
            toast({ variant: "destructive", title: "Audit Failed", description: "Unable to reach database." });
        } finally {
            setIsProcessing(false);
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
                        <Activity className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl font-black font-headline tracking-tight">Organization Health Monitor</CardTitle>
                        <CardDescription>Real-time telemetry for the background "Self-Healing" process.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-5 border-2 rounded-2xl bg-primary/10 flex flex-col items-center text-center gap-2 border-primary/20 shadow-sm animate-in zoom-in-95 duration-500">
                        <CheckCircle2 className="w-7 h-7 text-primary" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary/70">Files Migrated</p>
                        <p className="text-3xl font-black font-headline text-primary">{stats.globalMigrated.toLocaleString()}</p>
                    </div>
                    <div className="p-5 border-2 rounded-2xl bg-muted/30 flex flex-col items-center text-center gap-2">
                        <Search className="w-6 h-6 text-muted-foreground" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Efficiency</p>
                        <p className="text-sm font-bold">{healthPercentage}% Health</p>
                    </div>
                    <div className="p-5 border-2 rounded-2xl bg-muted/30 flex flex-col items-center text-center gap-2">
                        <BarChart3 className="w-6 h-6 text-muted-foreground" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Pending</p>
                        <p className="text-sm font-bold">{stats.legacy} in sample</p>
                    </div>
                </div>

                <div className="space-y-4 bg-muted/20 p-6 rounded-2xl border-2">
                    <div className="flex justify-between items-end">
                        <div>
                            <p className="text-sm font-black font-headline uppercase text-primary tracking-tight">
                                Optimization Density (Recent Data)
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {stats.optimized} records offloaded in current sample of {stats.total}.
                            </p>
                        </div>
                        <p className="text-2xl font-black font-headline">
                            {healthPercentage}%
                        </p>
                    </div>
                    <Progress value={healthPercentage} className="h-3 border-2" />
                </div>

                <div className="pt-4">
                    <Button 
                        onClick={scanDatabaseHealth} 
                        disabled={isProcessing} 
                        size="lg"
                        className="w-full h-16 text-lg font-black font-headline rounded-2xl shadow-xl transition-all active:scale-95"
                    >
                        {isProcessing ? (
                            <><RefreshCw className="mr-3 h-6 w-6 animate-spin" /> Fetching Global Telemetry...</>
                        ) : (
                            <><Database className="mr-3 h-6 w-6" /> Refresh Organization Stats</>
                        )}
                    </Button>
                    <p className="text-center text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-4">
                        Migration status is tracked globally. Density stats reflect the 1,000 most recent records.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}