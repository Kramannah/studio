'use client';

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
    format, 
    startOfMonth, 
    endOfMonth, 
    parseISO, 
    isAfter,
    isValid
} from "date-fns";
import { 
    Loader2, 
    FileSpreadsheet,
    Package,
    CheckCircle2,
    Info,
    Users,
    Pill
} from "lucide-react";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { parseAnyDate, getStartOfYearISO } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CoverageEntry, UserProfile, Q4Allocation, IndividualAllocation } from "@/lib/types";
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { MANAGER_TEAMS } from "@/lib/admins";
import { managers } from "@/lib/managers";
import { USER_DATA_MAP } from "@/lib/user-data";

export function SampleInventoryAudit({ 
    userProfiles 
}: { 
    userProfiles: Record<string, UserProfile>
}) {
    const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
    const [selectedManagerId, setSelectedManagerId] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const months = useMemo(() => {
        const list = [];
        const currentYear = new Date().getFullYear();
        for (let i = -6; i <= 3; i++) {
            const date = new Date(currentYear, new Date().getMonth() + i, 1);
            list.push({
                value: format(date, 'yyyy-MM'),
                label: format(date, 'MMMM yyyy')
            });
        }
        return list;
    }, []);

    const handleGenerateReport = async () => {
        if (!db || !selectedManagerId) {
            toast({ variant: "destructive", title: "Selection Required", description: "Please select a territory first." });
            return;
        }
        setLoading(true);
        
        try {
            const refDate = parseISO(selectedMonth + "-01");
            const monthStart = startOfMonth(refDate);
            const monthEnd = endOfMonth(refDate);

            // Usage range
            const yearStartStr = getStartOfYearISO();
            const yearStartDate = parseISO(yearStartStr);

            const allPmrIds = new Set<string>();
            if (selectedManagerId === "all") {
                Object.values(MANAGER_TEAMS).forEach(team => team.forEach(id => allPmrIds.add(id)));
                Object.values(userProfiles).forEach(p => {
                    if (p.managerId && p.managerId !== 'none') allPmrIds.add(p.userId);
                });
            } else {
                const teamIds = MANAGER_TEAMS[selectedManagerId] || [];
                const dynamicIds = Object.values(userProfiles)
                    .filter(p => p.managerId === selectedManagerId)
                    .map(p => p.userId);
                teamIds.forEach(id => allPmrIds.add(id));
                dynamicIds.forEach(id => allPmrIds.add(id));
            }

            const targetUserIds = Array.from(allPmrIds);
            if (targetUserIds.length === 0) {
                toast({ variant: "destructive", title: "No PMRs Found", description: "No representatives assigned to the selected territory." });
                setLoading(false);
                return;
            }

            // 1. Fetch Master Inventory & Overrides
            const [samplesSnap, overridesSnap] = await Promise.all([
                getDocs(query(collection(db, "marketingSamples"), limit(1000))),
                getDocs(query(collection(db, "individualAllocations"), limit(5000)))
            ]);

            const globalSamples = samplesSnap.docs.map(d => ({ 
                id: d.id, 
                name: (d.data().displayMaterialName || d.data().materialName || "Unknown").toString().trim(),
                group: (d.data().prodGroupProdSubGroup || d.data().productGroup || "Uncategorized").toString().trim(),
                qty: Number(d.data().allocationQuantity || 0)
            }));

            const overridesMap = new Map<string, number>();
            overridesSnap.docs.forEach(d => {
                const data = d.data();
                overridesMap.set(`${data.userId}_${data.sampleId}`, data.quantity);
            });

            const excelRows: any[] = [];

            // 2. Process PMRs
            for (const uid of targetUserIds) {
                const entriesSnap = await getDocs(query(
                    collection(db, "coverageEntries"), 
                    where("userId", "==", uid), 
                    where("coverageDate", ">=", yearStartStr),
                    limit(5000)
                ));

                const userMonthlyUsage: Record<string, number> = {};
                const userTotalUsage: Record<string, number> = {};

                entriesSnap.docs.forEach(d => {
                    const data = d.data() as CoverageEntry;
                    const cDate = parseAnyDate(data.coverageDate || data.submittedAt);
                    if (!cDate || !isAfter(cDate, yearStartDate)) return;

                    const isCurrentMonth = cDate >= monthStart && cDate <= monthEnd;

                    const process = (name?: string, qty?: number) => {
                        const key = String(name ?? "").toLowerCase().trim();
                        if (!key) return;
                        const qVal = Math.round(Number(qty || 0));
                        if (!isNaN(qVal) && qVal !== 0) {
                            userTotalUsage[key] = (userTotalUsage[key] || 0) + qVal;
                            if (isCurrentMonth) {
                                userMonthlyUsage[key] = (userMonthlyUsage[key] || 0) + qVal;
                            }
                        }
                    };

                    process(data.primarySampleName, data.primaryProductQty);
                    process(data.secondarySampleName, data.secondaryProductQty);
                    data.reminderProducts?.forEach(rp => process(rp.sampleName, rp.quantity));
                });

                const profile = userProfiles[uid];
                const meta = USER_DATA_MAP[uid];
                const pmrName = profile ? `${profile.lastName}, ${profile.firstName}` : meta ? `${meta.lastName}, ${meta.firstName}` : "Unknown User";
                const pmrCode = profile?.code || meta?.code || "PMR";

                let pmrManagerName = "Unassigned";
                const mId = profile?.managerId || Object.keys(MANAGER_TEAMS).find(m => (MANAGER_TEAMS[m] || []).includes(uid));
                const hManager = managers.find(m => m.uid === mId);
                pmrManagerName = hManager ? hManager.name : (mId || "DSM Assigned");

                globalSamples.forEach(sample => {
                    const overrideKey = `${uid}_${sample.id}`;
                    const allocated = overridesMap.has(overrideKey) ? overridesMap.get(overrideKey)! : sample.qty;
                    const usedInMonth = userMonthlyUsage[sample.name.toLowerCase()] || 0;
                    const usedTotal = userTotalUsage[sample.name.toLowerCase()] || 0;
                    const balance = Math.max(0, allocated - usedTotal);

                    if (allocated > 0 || usedInMonth > 0 || usedTotal > 0) {
                        excelRows.push({
                            "District Manager": pmrManagerName,
                            "Employee Code": pmrCode,
                            "Representative": pmrName,
                            "Category": sample.group,
                            "Material": sample.name,
                            "Allocated Qty": allocated,
                            "Used This Month": usedInMonth,
                            "Remaining Balance": balance
                        });
                    }
                });
            }

            if (excelRows.length === 0) {
                toast({ variant: "destructive", title: "No Data Found", description: "No sample usage recorded for the selected period." });
                setLoading(false);
                return;
            }

            const ws = XLSX.utils.json_to_sheet(excelRows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Inventory Audit");
            
            const territoryName = selectedManagerId === "all" ? "Global" : (managers.find(m => m.uid === selectedManagerId)?.name || "Territory");
            const fileName = `Samples_Audit_${territoryName.replace(/\s+/g, '_')}_${selectedMonth}.xlsx`;
            XLSX.writeFile(wb, fileName);

            toast({ title: "Audit Exported", description: `Compiled usage records for ${targetUserIds.length} representatives.` });

        } catch (error: any) {
            console.error("Inventory Audit Engine Error:", error);
            toast({ variant: "destructive", title: "Export Failed", description: "An error occurred while compiling the inventory data." });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] w-full animate-in fade-in duration-500 space-y-8">
            <Card className="max-w-2xl w-full border-2 shadow-lg rounded-2xl overflow-hidden">
                <CardHeader className="bg-primary/5 border-b-2 text-center py-10">
                    <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                        <Pill className="w-8 h-8 text-primary" />
                    </div>
                    <CardTitle className="text-3xl font-black font-headline text-primary tracking-tight">
                        Sample Inventory Audit
                    </CardTitle>
                    <CardDescription className="text-base mt-2">
                        Extract sample distribution records and remaining balances for field personnel.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-10 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <Users className="w-3 h-3" /> Select Territory
                            </p>
                            <Select value={selectedManagerId} onValueChange={setSelectedManagerId}>
                                <SelectTrigger className="h-12 font-headline border-2 rounded-xl bg-muted/30">
                                    <SelectValue placeholder="Select Territory" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Districts (Global)</SelectItem>
                                    {managers.map(m => (
                                        <SelectItem key={m.uid} value={m.uid}>
                                            {m.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Select Audit Period</p>
                            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                <SelectTrigger className="h-12 font-headline border-2 rounded-xl bg-muted/30">
                                    <SelectValue placeholder="Select Period" />
                                </SelectTrigger>
                                <SelectContent>
                                    {months.map(m => (
                                        <SelectItem key={m.value} value={m.value}>
                                            {m.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4">
                        <Button 
                            onClick={handleGenerateReport} 
                            disabled={loading || !selectedManagerId} 
                            size="lg"
                            className="w-full h-20 text-xl font-black font-headline rounded-2xl shadow-xl transition-all active:scale-95 group"
                        >
                            {loading ? (
                                <><Loader2 className="mr-3 h-6 w-6 animate-spin" /> Compiling Inventory...</>
                            ) : (
                                <><FileSpreadsheet className="mr-3 h-6 w-6 group-hover:scale-110 transition-transform" /> Generate Samples Report (.xlsx)</>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl w-full">
                <Card className="border-2 shadow-sm bg-muted/20">
                    <CardContent className="p-4 flex items-start gap-3">
                        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Calculation Method</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Used This Month counts visits within the selected period. Remaining Balance accounts for total usage since the start of the year.
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-2 shadow-sm bg-muted/20">
                    <CardContent className="p-4 flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Global Accuracy</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                The audit considers both Global Template allocations and individual PMR overrides for pinpoint precision.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
