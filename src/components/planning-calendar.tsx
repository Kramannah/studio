"use client"

import type { Doctor, Plan, NonCallDay, CoverageEntry, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { format, parseISO, isSameMonth, isValid, startOfMonth, isAfter, startOfDay, startOfToday, isSameDay, addMonths, subMonths } from "date-fns";
import React, { useState, useMemo, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { 
  PlusCircle, 
  CalendarOff, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Unlock, 
  Loader2, 
  Lock, 
  FileSpreadsheet, 
  Filter, 
  RotateCcw, 
  Search 
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NonCallDayDialog } from "./non-call-day-dialog";
import { PlanningPermissionDialog } from "./planning-permission-dialog";
import { getWeekMonday, isCurrentWeek, isPastWeek, cn, PH_HOLIDAYS, getHolidayName, parseAnyDate } from "@/lib/utils";
import { Checkbox } from "./ui/checkbox";
import * as XLSX from 'xlsx-js-style';
import { useToast } from "@/hooks/use-toast";

type PlanningCalendarProps = {
  doctors: Doctor[];
  plans: Plan[];
  planningRequests: PlanningPermissionRequest[];
  onRequestUnlock: (week: Date, reason: string) => Promise<boolean>;
  entries: CoverageEntry[];
  offlineEntries?: CoverageEntry[];
  onAddPlan: (doctor: Doctor, plannedDate: Date) => void;
  onAddPlansBulk: (doctors: Doctor[], plannedDate: Date) => Promise<boolean>;
  onRemovePlan: (planId: string) => void;
  onLogCall: (doctor: Doctor, plannedDate: Date, callType: 'planned' | 'unplanned') => void;
  nonCallDays: NonCallDay[];
  onAddNonCallDay: (entry: Omit<NonCallDay, 'id' | 'userId' | 'date' | 'status'>) => void;
  readOnly?: boolean;
  selectedMonth?: string;
  onMonthChange?: (month: string) => void;
  pmrName?: string;
  profile?: UserProfile | null;
};

const dayTypeLabels: Record<NonCallDay['dayType'], string> = {
    'wholeday': 'Whole Day',
    'halfday-am': 'Half Day (AM)',
    'halfday-pm': 'Half Day (PM)',
};

const StatusIcon = ({ status }: { status: NonCallDay['status'] | 'holiday' }) => {
    switch (status) {
        case 'holiday':
        case 'approved':
            return <CheckCircle className="w-5 h-5 text-primary" />;
        case 'rejected':
            return <XCircle className="w-5 h-5 text-destructive" />;
        case 'pending':
        default:
            return <Clock className="w-5 h-5 text-yellow-500" />;
    }
};

export function PlanningCalendar({ 
    doctors = [], 
    plans = [], 
    planningRequests = [],
    onRequestUnlock,
    entries = [], 
    offlineEntries = [],
    onAddPlan, 
    onAddPlansBulk,
    onRemovePlan, 
    onLogCall, 
    nonCallDays = [], 
    onAddNonCallDay, 
    readOnly = false,
    selectedMonth,
    onMonthChange,
    pmrName = "Representative",
    profile
}: PlanningCalendarProps) {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    const [isAddPlanDialogOpen, setIsAddPlanDialogOpen] = useState(false);
    const [isNonCallDialogOpen, setIsNonCallDialogOpen] = useState(false);
    const [isUnlockDialogOpen, setIsUnlockDialogOpen] = useState(false);
    const [doctorFilter, setDoctorFilter] = useState("");
    const [frequencyFilter, setFrequencyFilter] = useState<string>("all");
    const [selectedDoctorIds, setSelectedDoctorIds] = useState<Set<string>>(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [mounted, setMounted] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setSelectedDate(new Date());
        setMounted(true);
    }, []);

    const allEntries = useMemo(() => [...entries, ...(offlineEntries || [])], [entries, offlineEntries]);

    const entriesByDate = useMemo(() => {
        const groups: Record<string, CoverageEntry[]> = {};
        allEntries.forEach(e => {
            const d = parseAnyDate(e.coverageDate) || parseAnyDate(e.submittedAt);
            if (d && isValid(d)) {
                const key = format(d, 'yyyy-MM-dd');
                if (!groups[key]) groups[key] = [];
                groups[key].push(e);
            }
        });
        return groups;
    }, [allEntries]);

    const plansByDate = useMemo(() => {
        const groups: Record<string, Plan[]> = {};
        (plans || []).forEach(plan => {
            const d = parseAnyDate(plan.plannedDate);
            if(d && isValid(d)) {
                const dateStr = format(d, 'yyyy-MM-dd');
                if (!groups[dateStr]) groups[dateStr] = [];
                groups[dateStr].push(plan);
            }
        });
        return groups;
    }, [plans]);
    
    const nonCallDaysByDate = useMemo(() => {
        const groups: Record<string, NonCallDay[]> = {};
        (nonCallDays || []).forEach(day => {
            const d = parseAnyDate(day.date);
            if(d && isValid(d)) {
                const dateStr = format(d, 'yyyy-MM-dd');
                if (!groups[dateStr]) groups[dateStr] = [];
                groups[dateStr].push(day);
            }
        });
        return groups;
    }, [nonCallDays]);

    const approvedWeekMondays = useMemo(() => {
        return new Set(
            planningRequests
                .filter(r => r.status === 'approved')
                .map(r => {
                    const d = parseAnyDate(r.weekStartDate);
                    return d && isValid(d) ? format(d, 'yyyy-MM-dd') : '';
                })
                .filter(Boolean)
        );
    }, [planningRequests]);

    const holidayDates = useMemo(() => {
        return Object.keys(PH_HOLIDAYS || {}).map(d => parseISO(d));
    }, []);

    const isLocked = useMemo(() => {
        if (!selectedDate || isCurrentWeek(selectedDate) || !isPastWeek(selectedDate)) return false;
        const mondayStr = format(getWeekMonday(selectedDate), 'yyyy-MM-dd');
        return !approvedWeekMondays.has(mondayStr);
    }, [selectedDate, approvedWeekMondays]);

    const visitCountsForSelectedMonth = useMemo(() => {
        const counts: Record<string, number> = {};
        const referenceDate = selectedDate || new Date();
        
        allEntries.forEach(e => {
            const d = parseAnyDate(e.coverageDate) || parseAnyDate(e.submittedAt);
            if (d && isValid(d) && isSameMonth(d, referenceDate)) {
                const first = String(e.firstName || "").toLowerCase().trim();
                const last = String(e.lastName || "").toLowerCase().trim();
                const nameKey = `${first}|${last}`;
                counts[nameKey] = (counts[nameKey] || 0) + 1;
            }
        });
        return counts;
    }, [allEntries, selectedDate]);

    const selectedDayStats = useMemo(() => {
        if (!selectedDate) return { total: 0, covered: 0, planned: 0, unplanned: 0 };
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const dayPlans = plansByDate[dateStr] || [];
        const dayEntries = entriesByDate[dateStr] || [];
        
        const matchesPlan = (e: CoverageEntry, p: Plan) => {
            const eFirst = String(e.firstName || "").toLowerCase().trim();
            const eLast = String(e.lastName || "").toLowerCase().trim();
            const pFirst = String(p.doctorFirstName || "").toLowerCase().trim();
            const pLast = String(p.doctorLastName || "").toLowerCase().trim();
            return eFirst === pFirst && eLast === pLast;
        };

        const total = dayPlans.length;
        const coveredCount = dayPlans.filter(p => dayEntries.some(e => matchesPlan(e, p))).length;

        let plannedAchievedCount = 0;
        let unplannedAchievedCount = 0;

        dayEntries.forEach(entry => {
            const matchingPlan = dayPlans.find(p => matchesPlan(entry, p));
            if (matchingPlan) {
                plannedAchievedCount++;
            } else {
                unplannedAchievedCount++;
            }
        });

        return {
            total,
            covered: coveredCount,
            planned: plannedAchievedCount,
            unplanned: unplannedAchievedCount
        };
    }, [selectedDate, plansByDate, entriesByDate]);

    const filteredDoctorsForSearch = useMemo(() => {
        const q = (doctorFilter ?? "").toString().toLowerCase().trim();
        const freq = frequencyFilter;
        
        const doctorList = Array.from((doctors || []).reduce((acc, d) => d.id ? acc.set(d.id, d) : acc, new Map<string, Doctor>()).values());
        
        return doctorList.filter(d => {
            const matchesSearch = !q || (
                `${String(d.firstName || "")} ${String(d.lastName || "")}`.toLowerCase().includes(q) ||
                String(d.municipality || "").toLowerCase().includes(q) ||
                String(d.specialty || "").toLowerCase().includes(q)
            );
            const matchesFreq = freq === "all" || d.frequency === freq;
            return matchesSearch && matchesFreq;
        });
    }, [doctors, doctorFilter, frequencyFilter]);

    const handleSaveNonCallDay = (data: {reason: string, remarks?: string, dayType: 'wholeday' | 'halfday-am' | 'halfday-pm'}) => {
        if(selectedDate) {
            onAddNonCallDay({
                date: selectedDate.toISOString(),
                reason: data.reason,
                remarks: data.remarks || "",
                dayType: data.dayType,
            });
            setIsNonCallDialogOpen(false);
        }
    };
    
    const handleLogCallClick = (plan: Plan) => {
        const doctor = (doctors || []).find(d => d.id === plan.doctorId) || (doctors || []).find(d => 
            String(d.firstName || "").toLowerCase().trim() === String(plan.doctorFirstName || "").toLowerCase().trim() &&
            String(d.lastName || "").toLowerCase().trim() === String(plan.doctorLastName || "").toLowerCase().trim()
        );

        if (doctor && plan.plannedDate) {
            onLogCall(doctor, parseAnyDate(plan.plannedDate) || new Date(), plan.callType || 'unplanned');
        }
    };

    const toggleDoctorSelection = (id: string) => {
        setSelectedDoctorIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleBulkSubmit = async () => {
        if (selectedDoctorIds.size === 0 || !selectedDate) return;
        setIsSubmitting(true);
        const doctorsToPlan = (doctors || []).filter(d => selectedDoctorIds.has(d.id));
        const success = await onAddPlansBulk(doctorsToPlan, selectedDate);
        if (success) {
            setIsAddPlanDialogOpen(false);
            setSelectedDoctorIds(new Set());
            setDoctorFilter("");
            setFrequencyFilter("all");
        }
        setIsSubmitting(false);
    };

    const handleExportExcel = async () => {
        if (plans.length === 0) {
            toast({ variant: "destructive", title: "No Plans Found", description: "There are no plotted calls to export." });
            return;
        }
        setIsExporting(true);
        try {
            const referenceDate = selectedMonth ? parseISO(selectedMonth + "-01") : new Date();
            const monthLabel = format(referenceDate, "MMMM yyyy");
            const monthStart = startOfMonth(referenceDate);
            const weeks: Date[] = [];
            let weekIter = getWeekMonday(monthStart);
            for (let i = 0; i < 5; i++) {
                weeks.push(new Date(weekIter));
                weekIter.setDate(weekIter.getDate() + 7);
            }

            const plansByWeekAndDay: Record<number, Record<number, Plan[]>> = {};
            for (let i = 0; i < 5; i++) {
                plansByWeekAndDay[i] = { 0: [], 1: [], 2: [], 3: [], 4: [] };
            }
            plans.forEach(plan => {
                const pDate = parseAnyDate(plan.plannedDate);
                if (!pDate) return;
                weeks.forEach((weekMon, wIdx) => {
                    const diffMs = pDate.getTime() - weekMon.getTime();
                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    if (diffDays >= 0 && diffDays < 5) {
                        plansByWeekAndDay[wIdx][diffDays].push(plan);
                    }
                });
            });

            const rows: any[][] = [];
            const merges: any[] = [
                { s: { r: 0, c: 1 }, e: { r: 0, c: 25 } }, 
                { s: { r: 1, c: 1 }, e: { r: 1, c: 25 } },
                { s: { r: 2, c: 1 }, e: { r: 2, c: 25 } },
                { s: { r: 3, c: 1 }, e: { r: 3, c: 25 } },
            ];

            for (let i = 0; i < 1500; i++) rows[i] = new Array(30).fill("");
            
            rows[0][1] = "PMR DAILY CALL PLAN";
            rows[1][1] = `PMR Name: ${pmrName}`;
            rows[2][1] = `Area/Territory: ${profile?.code || "N/A"}`;
            rows[3][1] = `Month: ${monthLabel}`;

            const dayNames = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
            const subHeaders = ["No", "MD Name", "Spec", "Freq", "Clinic Add"];
            let currentRow = 4;

            weeks.forEach((_, wIdx) => {
                rows[currentRow][1] = `WEEK ${wIdx + 1}`;
                merges.push({ s: { r: currentRow, c: 1 }, e: { r: currentRow, c: 25 } });
                
                const dayHeaderRow = currentRow + 1;
                const subHeaderRow = dayHeaderRow + 1;
                
                dayNames.forEach((name, dIdx) => {
                    const colStart = 1 + (dIdx * 5);
                    rows[dayHeaderRow][colStart] = name;
                    merges.push({ s: { r: dayHeaderRow, c: colStart }, e: { r: dayHeaderRow, c: colStart + 4 } });
                    
                    subHeaders.forEach((h, hIdx) => {
                        rows[subHeaderRow][colStart + hIdx] = h;
                    });

                    const dayPlans = plansByWeekAndDay[wIdx][dIdx];
                    const dataRowStart = subHeaderRow + 1;
                    const maxRows = Math.max(16, dayPlans.length);
                    
                    for (let r = 0; r < maxRows; r++) {
                        const targetRowIdx = dataRowStart + r;
                        rows[targetRowIdx][colStart] = (r + 1).toString();
                        const plan = dayPlans[r];
                        if (plan) {
                            const doctor = doctors.find(d => d.id === plan.doctorId) || doctors.find(d => 
                                String(d.firstName || "").toLowerCase().trim() === String(plan.doctorFirstName || "").toLowerCase().trim() &&
                                String(d.lastName || "").toLowerCase().trim() === String(plan.doctorLastName || "").toLowerCase().trim()
                            );
                            rows[targetRowIdx][colStart + 1] = `${plan.doctorFirstName} ${plan.doctorLastName}`;
                            rows[targetRowIdx][colStart + 2] = doctor?.specialty || "";
                            rows[targetRowIdx][colStart + 3] = doctor?.frequency || "";
                            rows[targetRowIdx][colStart + 4] = doctor?.clinic || "";
                        }
                    }

                    // Account Section
                    const auxHeaderRow = dataRowStart + maxRows + 1;
                    rows[auxHeaderRow][colStart] = "No";
                    rows[auxHeaderRow][colStart + 1] = "Acct Name";
                    merges.push({ s: { r: auxHeaderRow, c: colStart + 1 }, e: { r: auxHeaderRow, c: colStart + 2 } });
                    rows[auxHeaderRow][colStart + 3] = "Address";
                    merges.push({ s: { r: auxHeaderRow, c: colStart + 3 }, e: { r: auxHeaderRow, c: colStart + 4 } });
                    
                    for (let r = 0; r < 3; r++) {
                        rows[auxHeaderRow + 1 + r][colStart] = (r + 1).toString();
                    }
                });

                currentRow += 1 + 1 + 1 + 16 + 1 + 4 + 1; 
            });

            const worksheet = XLSX.utils.aoa_to_sheet(rows);
            worksheet['!merges'] = merges;
            const wscols = [{ wch: 2 }]; 
            for (let i = 0; i < 5; i++) {
                wscols.push({ wch: 4 }, { wch: 20 }, { wch: 10 }, { wch: 6 }, { wch: 20 });
            }
            worksheet['!cols'] = wscols;

            const range = XLSX.utils.decode_range(worksheet['!ref']!);
            for (let R = range.s.r; R <= range.e.r; ++R) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const addr = XLSX.utils.encode_cell({ c: C, r: R });
                    if (!worksheet[addr]) continue;
                    const cell = worksheet[addr];
                    const val = String(cell.v || "");

                    cell.s = {
                        font: { name: 'Arial', sz: 8 },
                        border: {
                            top: { style: 'thin' }, bottom: { style: 'thin' },
                            left: { style: 'thin' }, right: { style: 'thin' }
                        },
                        alignment: { vertical: 'center', wrapText: true, horizontal: 'left' }
                    };

                    if (R < 4) {
                        cell.s.font.bold = true;
                        cell.s.font.sz = 10;
                        cell.s.border = {};
                        if (R === 0) { cell.s.font.sz = 12; cell.s.font.underline = true; }
                        continue;
                    }

                    if (val.startsWith("WEEK ") && C === 1) {
                        cell.s.fill = { fgColor: { rgb: "FFFF00" } };
                        cell.s.font.bold = true;
                        cell.s.alignment.horizontal = 'center';
                        cell.s.font.sz = 10;
                    }

                    if (dayNames.includes(val) || subHeaders.includes(val) || val === "Acct Name" || val === "Address") {
                        cell.s.fill = { fgColor: { rgb: "92D050" } };
                        cell.s.font.bold = true;
                        cell.s.alignment.horizontal = 'center';
                    }

                    // Frequency Column Styling (Index 4, 9, 14, 19, 24)
                    if (C > 0 && (C - 4) % 5 === 0 && R > 6) {
                        cell.s.fill = { fgColor: { rgb: "DDEBF7" } };
                        cell.s.alignment.horizontal = 'center';
                    }
                    
                    if (C % 5 === 1 && R > 4) {
                        cell.s.alignment.horizontal = 'center';
                    }
                }
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Call Plan");
            XLSX.writeFile(workbook, `${pmrName.replace(/\s+/g, '_')}_Call_Plan.xlsx`);
            toast({ title: "Plan Exported" });
        } catch (error) {
            console.error("Export Error:", error);
            toast({ variant: "destructive", title: "Export Failed" });
        } finally {
            setIsExporting(false);
        }
    };

    const selectedHoliday = useMemo(() => selectedDate ? getHolidayName(selectedDate) : null, [selectedDate]);
    
    const selectedDayPlans = useMemo(() => {
        if (!selectedDate) return [];
        return plansByDate[format(selectedDate, 'yyyy-MM-dd')] || [];
    }, [selectedDate, plansByDate]);

    const selectedDayNonCallDays = useMemo(() => {
        if (!selectedDate) return [];
        return nonCallDaysByDate[format(selectedDate, 'yyyy-MM-dd')] || [];
    }, [selectedDate, nonCallDaysByDate]);

    if (!mounted) return null;

    return (
        <div className="w-full space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold font-headline text-primary">Call Planning</h2>
                    <p className="text-muted-foreground text-lg">Schedule and manage your doctor visits efficiently.</p>
                </div>
                <Button variant="outline" onClick={handleExportExcel} disabled={isExporting} className="h-12 border-2 rounded-xl font-headline gap-2">
                    {isExporting ? <Loader2 className="animate-spin h-5 w-5" /> : <FileSpreadsheet className="w-5 h-5 text-primary" />}
                    {isExporting ? 'Exporting...' : 'Export Plan (.xlsx)'}
                </Button>
            </div>

            <div className="flex flex-col xl:flex-row gap-8 items-start">
                <div className="w-full xl:w-[400px] shrink-0">
                    <Card className="shadow-md border-2 overflow-hidden">
                        <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={setSelectedDate}
                            month={selectedMonth ? parseISO(selectedMonth + "-01") : undefined}
                            onMonthChange={(m) => onMonthChange?.(format(m, 'yyyy-MM'))}
                            modifiers={{ 
                                planned: Object.keys(plansByDate).map(d => parseISO(d)),
                                nonCall: Object.keys(nonCallDaysByDate).map(d => parseISO(d)),
                                holiday: holidayDates,
                                weekend: { dayOfWeek: [0, 6] }
                            }}
                            modifiersStyles={{
                                planned: { border: '3px solid hsl(var(--primary))', fontWeight: 'bold' },
                                nonCall: { backgroundColor: 'hsl(var(--destructive) / 0.15)', color: 'hsl(var(--destructive))', fontWeight: 'bold' },
                                holiday: { backgroundColor: 'hsl(var(--accent) / 0.3)', color: 'hsl(var(--accent-foreground))', textDecoration: 'underline' }
                            }}
                            components={{
                                DayContent: ({ date, activeModifiers }) => {
                                    const dateString = format(date, 'yyyy-MM-dd');
                                    const count = plansByDate[dateString]?.length;
                                    return (
                                        <div className="relative flex items-center justify-center w-full h-full">
                                            {date.getDate()}
                                            {count && !activeModifiers?.nonCall && (
                                                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-black shadow-sm">
                                                    {count}
                                                </span>
                                            )}
                                        </div>
                                    );
                                },
                            }}
                            className="w-full p-4 bg-card"
                        />
                    </Card>
                </div>

                <div className="flex-1 w-full space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/30 p-4 rounded-xl border-2">
                        <div className="space-y-3">
                            <h3 className="text-2xl font-black font-headline tracking-tight flex items-center gap-2">
                                Activity for {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "No date selected"}
                                {isLocked && <Lock className="w-5 h-5 text-destructive" />}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="outline" className="h-7 px-3 font-bold border-2 bg-background/50">Total Scheduled: {selectedDayStats.total}</Badge>
                                <Badge variant="outline" className="h-7 px-3 font-bold border-2 border-primary/30 text-primary bg-primary/10">Covered: {selectedDayStats.covered}</Badge>
                                <Badge variant="outline" className="h-7 px-3 font-bold border-2 border-teal-500/30 text-teal-500 bg-teal-500/10">Planned Achieved: {selectedDayStats.planned}</Badge>
                                <Badge variant="outline" className="h-7 px-3 font-bold border-2 border-orange-500/30 text-orange-500 bg-orange-500/10">Unplanned Achieved: {selectedDayStats.unplanned}</Badge>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {!readOnly && (
                                <>
                                    {isLocked ? (
                                        <Button variant="outline" onClick={() => setIsUnlockDialogOpen(true)} className="h-10 border-2 font-headline gap-2">
                                            <Unlock className="w-4 h-4 text-primary" /> Unlock Week
                                        </Button>
                                    ) : (
                                        <Button onClick={() => setIsAddPlanDialogOpen(true)} className="h-10 font-headline gap-2">
                                            <PlusCircle className="w-4 h-4" /> Add Visits
                                        </Button>
                                    )}
                                    <Button variant="outline" onClick={() => setIsNonCallDialogOpen(true)} className="h-10 border-orange-500/50 text-orange-500 font-headline gap-2" disabled={isLocked}>
                                        <CalendarOff className="w-4 h-4" /> Log Leave
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    {(selectedDayNonCallDays.length > 0 || selectedHoliday) && (
                        <div className="space-y-3">
                            {selectedHoliday && (
                                <div className="flex items-center justify-between gap-4 bg-orange-500/5 border-2 border-orange-500/20 p-3 rounded-xl">
                                    <div className="flex items-center gap-4">
                                        <StatusIcon status="holiday" />
                                        <p className="font-black font-headline text-lg text-orange-500">{selectedHoliday}</p>
                                    </div>
                                </div>
                            )}
                            {selectedDayNonCallDays.map((day) => (
                                <div key={day.id} className="flex items-center justify-between gap-4 bg-orange-500/5 border-2 border-orange-500/20 p-3 rounded-xl">
                                    <div className="flex items-center gap-4">
                                        <StatusIcon status={day.status} />
                                        <div>
                                            <p className="font-black font-headline text-lg text-orange-500 leading-none">{day.reason}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{dayTypeLabels[day.dayType]}</p>
                                                {day.remarks && (
                                                    <>
                                                        <span className="text-white/20 text-[10px]">•</span>
                                                        <p className="text-[10px] text-white/60 italic lowercase">{day.remarks}</p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="capitalize font-black border-2">{day.status}</Badge>
                                </div>
                            ))}
                        </div>
                    )}

                    <Card className="shadow-lg border-2 rounded-xl overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 h-14">
                                    <TableHead className="font-bold">Doctor</TableHead>
                                    <TableHead className="font-bold">Location</TableHead>
                                    <TableHead className="font-bold">Call Type</TableHead>
                                    <TableHead className="font-bold">Status</TableHead>
                                    <TableHead className="text-right font-bold">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selectedDayPlans.length > 0 ? (
                                    selectedDayPlans.map((plan) => {
                                        const doctor = (doctors || []).find(d => d.id === plan.doctorId) || (doctors || []).find(d => 
                                            String(d.firstName || "").toLowerCase().trim() === String(plan.doctorFirstName || "").toLowerCase().trim() &&
                                            String(d.lastName || "").toLowerCase().trim() === String(plan.doctorLastName || "").toLowerCase().trim()
                                        );

                                        const dateStr = format(selectedDate || new Date(), 'yyyy-MM-dd');
                                        const isCovered = (entriesByDate[dateStr] || []).some(e => 
                                            String(e.firstName || "").toLowerCase().trim() === String(plan.doctorFirstName || "").toLowerCase().trim() && 
                                            String(e.lastName || "").toLowerCase().trim() === String(plan.doctorLastName || "").toLowerCase().trim()
                                        );
                                        return (
                                            <TableRow key={plan.id} className="h-16 border-b last:border-0 hover:bg-muted/10">
                                                <TableCell>
                                                    <Button variant="link" className="p-0 h-auto font-black text-sm uppercase tracking-tight text-primary" onClick={() => handleLogCallClick(plan)} disabled={readOnly || isCovered}>
                                                        {plan.doctorFirstName} {plan.doctorLastName}
                                                    </Button>
                                                </TableCell>
                                                <TableCell>{doctor?.municipality || "—"}</TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary" className="capitalize text-[10px] font-bold">
                                                        {plan.callType || 'unplanned'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                     <Badge variant="outline" className={cn("font-black text-[10px] uppercase", isCovered && "bg-primary/10 text-primary border-primary/30")}>
                                                        {isCovered ? 'Covered' : 'Not Covered'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {!readOnly && <Button variant="ghost" size="icon" onClick={() => onRemovePlan(plan.id)} disabled={isLocked || isCovered}><XCircle size={18} className="text-destructive" /></Button>}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                ) : (
                                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">No visits planned for this day.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </div>
            </div>

            <Dialog open={isAddPlanDialogOpen} onOpenChange={setIsAddPlanDialogOpen}>
                <DialogContent className="w-[94vw] max-w-5xl h-[90vh] flex flex-col p-0 overflow-hidden bg-background border-2 shadow-2xl">
                    <DialogHeader className="p-4 shrink-0">
                        <DialogTitle className="text-lg font-headline font-black">Plan Visits: {selectedDate ? format(selectedDate, "MMMM d, yyyy") : ""}</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 flex flex-col p-4 pt-0 space-y-4 overflow-hidden">
                        <div className="flex flex-col sm:flex-row gap-4 shrink-0">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input placeholder="Search name or location..." value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} className="pl-10 border-2" />
                            </div>
                            <div className="w-full sm:w-[220px]">
                                <Select value={frequencyFilter} onValueChange={setFrequencyFilter}>
                                    <SelectTrigger className="border-2 h-10">
                                        <div className="flex items-center gap-2">
                                            <Filter className="w-3.5 h-3.5 opacity-50" />
                                            <SelectValue placeholder="All Frequencies" />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Frequencies</SelectItem>
                                        <SelectItem value="1x">Target: 1x visits</SelectItem>
                                        <SelectItem value="2x">Target: 2x visits</SelectItem>
                                        <SelectItem value="3x">Target: 3x visits</SelectItem>
                                        <SelectItem value="4x">Target: 4x visits</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto scrollbar-hide">
                            <Table className="w-full">
                                <TableHeader className="sticky top-0 bg-background z-20"><TableRow><TableHead className="w-[40px]"></TableHead><TableHead className="text-xs font-bold">Doctor</TableHead><TableHead className="w-[80px] text-center text-xs font-bold">Freq</TableHead><TableHead className="w-[60px] text-center text-xs font-bold">Left</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {filteredDoctorsForSearch.length > 0 ? (
                                        filteredDoctorsForSearch.map(doctor => {
                                            const first = String(doctor.firstName || "").toLowerCase().trim();
                                            const last = String(doctor.lastName || "").toLowerCase().trim();
                                            const actualCount = visitCountsForSelectedMonth[`${first}|${last}`] || 0;
                                            const targetCount = parseInt(String(doctor.frequency || '1x').replace('x', ''), 10) || 0;
                                            return (
                                                <TableRow key={doctor.id}>
                                                    <TableCell><Checkbox checked={selectedDoctorIds.has(doctor.id)} onCheckedChange={() => toggleDoctorSelection(doctor.id)} /></TableCell>
                                                    <TableCell className="font-bold text-xs">
                                                        <div className="flex flex-col">
                                                            <span>{doctor.firstName} {doctor.lastName}</span>
                                                            <span className="text-[9px] text-muted-foreground uppercase font-black tracking-tighter">{doctor.specialty}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center"><Badge variant="outline" className="font-mono text-[10px]">{doctor.frequency}</Badge></TableCell>
                                                    <TableCell className="w-[60px] font-mono text-xs font-black text-center">{Math.max(0, targetCount - actualCount)}</TableCell>
                                                </TableRow>
                                            )
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-40 text-center text-muted-foreground italic">
                                                No doctors found matching filters.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                    <DialogFooter className="p-4 pt-0 gap-3 shrink-0 flex-col sm:flex-row items-stretch sm:items-center">
                        <div className="flex items-center gap-2 flex-1">
                            <Button variant="outline" onClick={() => setIsAddPlanDialogOpen(false)} disabled={isSubmitting} className="font-bold border-2">Close</Button>
                            {selectedDoctorIds.size > 0 && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" className="text-destructive hover:bg-destructive/10 font-bold gap-2">
                                            <RotateCcw className="w-4 h-4" /> Unselect All
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Unselect all doctors?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will clear your current selection of {selectedDoctorIds.size} doctor(s).
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => setSelectedDoctorIds(new Set())} className="bg-destructive text-white">Confirm Unselect</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                                )}
                        </div>
                        <Button onClick={handleBulkSubmit} disabled={isSubmitting || selectedDoctorIds.size === 0} className="font-headline font-black shadow-lg">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                            Schedule ({selectedDoctorIds.size})
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {selectedDate && (
                <>
                    <NonCallDayDialog isOpen={isNonCallDialogOpen} onOpenChange={setIsNonCallDialogOpen} onSave={handleSaveNonCallDay} selectedDate={selectedDate} />
                    <PlanningPermissionDialog isOpen={isUnlockDialogOpen} onOpenChange={setIsUnlockDialogOpen} onConfirm={(reason) => onRequestUnlock(getWeekMonday(selectedDate), reason)} weekStartDate={getWeekMonday(selectedDate)} />
                </>
            )}
        </div>
    );
}
