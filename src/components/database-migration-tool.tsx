
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
    Search
} from "lucide-react";
import { collection, query, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isBase64Image } from "@/lib/storage-utils";
import { useToast } from "@/hooks/use-toast";

/**
 * SYSTEM HEALTH MONITOR (Self-Healing Observer)
 * This tool no longer performs "Push" migrations (which encounter identity deadlocks).
 * It now monitors the background "Self-Healing" progress across the organization.
 */
export function DatabaseMigrationTool() {
    const [status, setStatus] = useState<'idle' | 'scanning' | 'complete'>('idle');
    const [stats, setStats] = useState({ legacy: 0, optimized: 0, total: 0 });
    const [isProcessing, setIsProcessing] = useState(false);
    const { toast } = useToast();

    const scanDatabaseHealth = async () => {
        if (!db) return;
        setIsProcessing(true);
        setStatus('scanning');
        
        try {
            // Scan latest 1000 records to gauge organization-wide health
            const snapshot = await getDocs(query(collection(db, "coverageEntries"), limit(1000)));
            let legacyCount = 0;
            
            snapshot.docs.forEach(d => {
                const data = d.data();
                const isLegacy = isBase64Image(data.signature) || 
                               isBase64Image(data.jointCallSignature) || 
                               (data.photos && Array.isArray(data.photos) && data.photos.some((p: string) => isBase64Image(p)));
                
                if (isLegacy) legacyCount++;
            });

            setStats({
                legacy: legacyCount,
                optimized: snapshot.docs.length - legacyCount,
                total: snapshot.docs.length
            });

            setStatus('complete');
            toast({ title: "Health Scan Complete", description: `Detected ${legacyCount} records needing self-healing.` });

        } catch (error: any) {
            console.warn("Health scan failure:", error.message);
            toast({ variant: "destructive", title: "Scan Failed", description: "Database is heavily congested." });
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
                        <CardTitle className="text-2xl font-black font-headline">Organization Health Monitor</CardTitle>
                        <CardDescription>Observing the distributed "Self-Healing" migration process.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 border-2 rounded-2xl bg-muted/30 flex flex-col items-center text-center gap-2">
                        <Search className="w-6 h-6 text-muted-foreground" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Distributed</p>
                        <p className="text-xs text-muted-foreground">PMRs clean their own records.</p>
                    </div>
                    <div className="p-4 border-2 rounded-2xl bg-muted/30 flex flex-col items-center text-center gap-2">
                        <ShieldCheck className="w-6 h-6 text-primary" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Authorized</p>
                        <p className="text-xs text-muted-foreground">Bypasses permission deadlocks.</p>
                    </div>
                    <div className="p-4 border-2 rounded-2xl bg-muted/30 flex flex-col items-center text-center gap-2">
                        <CheckCircle2 className="w-6 h-6 text-primary" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Automatic</p>
                        <p className="text-xs text-muted-foreground">Zero-touch for field reps.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <div>
                            <p className="text-sm font-black font-headline uppercase text-primary tracking-tight">
                                Overall Optimization Status
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {stats.legacy} legacy records remaining in current sample.
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
                            <><RefreshCw className="mr-3 h-6 w-6 animate-spin" /> Scanning Global Data...</>
                        ) : (
                            <><Database className="mr-3 h-6 w-6" /> Refresh Organization Stats</>
                        )}
                    </Button>
                    <p className="text-center text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-4">
                        Migration is now distributed. Stats reflect a sample of 1,000 recent records.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
