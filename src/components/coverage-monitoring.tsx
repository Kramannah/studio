
'use client';

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
    format, 
    startOfMonth, 
    endOfMonth, 
    eachDayOfInterval, 
    parseISO, 
    addMonths,
    subMonths
} from "date-fns";
import { 
    ChevronLeft, 
    ChevronRight, 
    Loader2, 
    FileSpreadsheet,
    Info,
    CheckCircle2
} from "lucide-react";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { CoverageEntry, NonCallDay, UserProfile } from "@/lib/types";
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";

interface MonitoringCell {
    calls: number;
    nonCallReason?: string;
    isApproved?: boolean;
}

export function CoverageMonitoring({ userProfiles }: { userProfiles: Record<string, UserProfile>, userMap: any }) {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
    }, []);

    const getDistrictLabel = (pmr: UserProfile) => {
        if (pmr.managerId) {
            const manager = userProfiles[pmr.managerId];
            if (manager) {
                const name = manager.lastName;
                if (name === 'Ignacio') return 'VIS';
                if (name === 'Ligutom') return 'MIN';
                if (name === 'Nonato') return 'CL';
                if (name === 'Gonzales') return 'GMAS';
                if (name === 'Langit') return 'CL';
                if (name === 'Daquioag') return 'NL';
                if (name === 'Cabangon') return 'LSL';
                return 'HQ';
            }
        }
        return pmr.code?.split('-')[0] || "HQ";
    };

    const handleGenerateExport = async () => {
        if (!db || !mounted) return;
        setLoading(true);
        
        try {
            const startStr = startOfMonth(selectedDate).toISOString();
            const endStr = endOfMonth(selectedDate).toISOString();
            const days = eachDayOfInterval({ start: startOfMonth(selectedDate), end: endOfMonth(selectedDate) });

            // 1. Fetch relevant data
            const entriesQuery = query(
                collection(db, "coverageEntries"),
                where("coverageDate", ">=", startStr),
                where("coverageDate", "<=", endStr),
                limit(10000)
            );

            const ncdQuery = query(
                collection(db, "nonCallDays"),
                where("date", ">=", startStr),
                where("date", "<=", endStr)
            );

            const [entriesSnap, ncdSnap] = await Promise.all([
                getDocs(entriesQuery),
                getDocs(ncdQuery)
            ]);

            const entries = entriesSnap.docs.map(d => ({ id: d.id, ...d.data() } as CoverageEntry));
            const nonCallDays = ncdSnap.docs.map(d => ({ id: d.id, ...d.data() } as NonCallDay));

            // 2. Prepare PMR List
            const pmrList = Object.values(userProfiles)
                .filter(p => p.role === 'PMR' || !p.role)
                .sort((a, b) => {
                    const districtA = getDistrictLabel(a);
                    const districtB = getDistrictLabel(b);
                    if (districtA !== districtB) return districtA.localeCompare(districtB);
                    return (a.lastName || "").localeCompare(b.lastName || "");
                });

            // 3. Build Data Matrix
            const matrix = new Map<string, Map<string, MonitoringCell>>();
            pmrList.forEach(p => matrix.set(p.userId, new Map()));

            entries.forEach(e => {
                if (!e.userId || !matrix.has(e.userId)) return;
                const dateStr = format(parseISO(e.coverageDate || e.submittedAt), 'yyyy-MM-dd');
                const userMatrix = matrix.get(e.userId)!;
                const current = userMatrix.get(dateStr) || { calls: 0 };
                userMatrix.set(dateStr, { ...current, calls: current.calls + 1 });
            });

            nonCallDays.forEach(n => {
                if (!n.userId || !matrix.has(n.userId)) return;
                const dateStr = format(parseISO(n.date), 'yyyy-MM-dd');
                const userMatrix = matrix.get(n.userId)!;
                const current = userMatrix.get(dateStr) || { calls: 0 };
                userMatrix.set(dateStr, { 
                    ...current, 
                    nonCallReason: n.reason, 
                    isApproved: n.status === 'approved' 
                });
            });

            // 4. Compile Excel Rows
            const excelRows = pmrList.map(pmr => {
                const row: any = {
                    "DISTRICT": getDistrictLabel(pmr),
                    "CODE": pmr.code || "PMR",
                    "NAME": `${pmr.lastName}, ${pmr.firstName}`
                };

                days.forEach(day => {
                    const dateKey = format(day, 'yyyy-MM-dd');
                    const dayCol = format(day, 'd');
                    const cell = matrix.get(pmr.userId)?.get(dateKey);

                    if (cell) {
                        if (cell.nonCallReason && cell.isApproved) {
                            row[dayCol] = cell.nonCallReason;
                        } else if (cell.calls > 0) {
                            row[dayCol] = cell.calls;
                        } else {
                            row[dayCol] = "-";
                        }
                    } else {
                        row[dayCol] = "-";
                    }
                });

                return row;
            });

            // 5. Trigger Download
            const worksheet = XLSX.utils.json_to_sheet(excelRows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Coverage Audit");
            
            const fileName = `Coverage_Monitoring_${format(selectedDate, 'MMM_yyyy')}.xlsx`;
            XLSX.writeFile(workbook, fileName);

            toast({
                title: "Report Generated",
                description: `${pmrList.length} PMR records compiled successfully.`
            });

        } catch (error) {
            console.error("Export generation error:", error);
            toast({
                variant: "destructive",
                title: "Export Failed",
                description: "An error occurred while compiling the organization data."
            });
        } finally {
            setLoading(false);
        }
    };

    if (!mounted) return null;

    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] w-full animate-in fade-in duration-500 space-y-8">
            <Card className="max-w-2xl w-full border-2 shadow-lg rounded-2xl overflow-hidden">
                <CardHeader className="bg-primary/5 border-b-2 text-center py-10">
                    <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                        <FileSpreadsheet className="w-8 h-8 text-primary" />
                    </div>
                    <CardTitle className="text-3xl font-black font-headline text-primary tracking-tight">
                        Coverage Audit Compiler
                    </CardTitle>
                    <CardDescription className="text-base mt-2">
                        Generate a comprehensive monthly coverage report for all territories.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-10 space-y-8">
                    <div className="flex flex-col items-center gap-6">
                        <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Select Audit Period</p>
                        <div className="flex items-center gap-4 bg-muted/50 p-2 rounded-2xl border-2">
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => setSelectedDate(subMonths(selectedDate, 1))} 
                                className="h-12 w-12 rounded-xl"
                                disabled={loading}
                            >
                                <ChevronLeft className="h-6 w-6"/>
                            </Button>
                            <span className="px-8 font-black font-headline text-2xl uppercase tracking-tighter min-w-[200px] text-center">
                                {format(selectedDate, 'MMMM yyyy')}
                            </span>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => setSelectedDate(addMonths(selectedDate, 1))} 
                                className="h-12 w-12 rounded-xl"
                                disabled={loading}
                            >
                                <ChevronRight className="h-6 w-6"/>
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4">
                        <Button 
                            onClick={handleGenerateExport} 
                            disabled={loading} 
                            size="lg"
                            className="w-full h-16 text-lg font-black font-headline rounded-2xl shadow-xl transition-all active:scale-95"
                        >
                            {loading ? (
                                <><Loader2 className="mr-3 h-6 w-6 animate-spin" /> Compiling Records...</>
                            ) : (
                                <><FileSpreadsheet className="mr-3 h-6 w-6" /> Generate & Download Audit (.xlsx)</>
                            )}
                        </Button>
                        <p className="text-center text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                            {loading ? "Aggregating coverage entries and approved leaves..." : "Ready to process entire organization history"}
                        </p>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl w-full">
                <Card className="border-2 shadow-sm bg-muted/20">
                    <CardContent className="p-4 flex items-start gap-3">
                        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Audit Logic</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                The export includes daily report counts and approved Non-Call reasons (VL, SL, Meetings) cross-referenced from leave requests.
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-2 shadow-sm bg-muted/20">
                    <CardContent className="p-4 flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Compliance</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Monthly reports are generated according to standard field cycle monitoring requirements for all PMR levels.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
