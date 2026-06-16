
'use client';

import { useState } from "react";
import type { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmittedList } from "@/components/submitted-list";
import { MasterList } from "@/components/master-list";
import { PlanningCalendar } from "@/components/planning-calendar";
import { CallSummary } from "@/components/call-summary";
import { Button } from "@/components/ui/button";
import { RefreshCw, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { format, parseISO, subMonths, addMonths } from "date-fns";
import { cn } from "@/lib/utils";

interface UserDashboardProps {
    userId: string;
    allEntries: CoverageEntry[];
    allDoctors: Doctor[];
    allPlans: Plan[];
    allNonCallDays: NonCallDay[];
    allTimeLogs: TimeLog[];
    onDeleteEntry: (id: string) => void;
    usedQuantities: Record<string, number>;
    isAdminView?: boolean;
    userMap?: Record<string, { code: string; firstName: string; lastName: string; }>;
    onAddDoctor?: (doctor: Omit<Doctor, 'id'>) => void;
    onAddDoctorsBulk?: (doctors: Omit<Doctor, 'id'>[]) => void;
    onUpdateDoctor?: (doctor: Doctor) => void;
    onDeleteDoctor?: (id: string) => void;
    onDeleteDoctorsBulk?: (ids: string[]) => void;
    // New props for Low Cost Monthly Fetching
    onFetchUserData?: (uid: string, month: string) => Promise<void>;
    selectedMonth?: string;
    onMonthChange?: (month: string) => void;
}

export function UserDashboard({ 
    userId, allEntries, allDoctors, allPlans, allNonCallDays, allTimeLogs, onDeleteEntry = () => {}, isAdminView = false, userMap,
    onAddDoctor = () => {}, onAddDoctorsBulk = () => {}, onUpdateDoctor = () => {}, onDeleteDoctor = () => {}, onDeleteDoctorsBulk = () => {},
    onFetchUserData, selectedMonth = format(new Date(), 'yyyy-MM'), onMonthChange
}: UserDashboardProps) {
    const [activeTab, setActiveTab] = useState('summary');
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        if (!onFetchUserData) return;
        setIsRefreshing(true);
        try {
            await onFetchUserData(userId, selectedMonth);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleMonthNavigate = (direction: 'prev' | 'next') => {
        if (!onMonthChange) return;
        const current = parseISO(selectedMonth + "-01");
        const nextDate = direction === 'prev' ? subMonths(current, 1) : addMonths(current, 1);
        onMonthChange(format(nextDate, 'yyyy-MM'));
    };
    
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/30 p-4 rounded-xl border-2">
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-background border-2 rounded-lg p-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMonthNavigate('prev')}>
                            <ChevronLeft size={16}/>
                        </Button>
                        <div className="flex items-center gap-2 px-3 text-xs font-black uppercase tracking-widest text-primary">
                            <CalendarIcon size={14} /> {format(parseISO(selectedMonth + "-01"), 'MMMM yyyy')}
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMonthNavigate('next')}>
                            <ChevronRight size={16}/>
                        </Button>
                    </div>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleRefresh} 
                        disabled={isRefreshing}
                        className="h-10 border-2 font-headline"
                    >
                        <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
                        {isRefreshing ? 'Loading...' : 'Refresh Data'}
                    </Button>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-fit">
                    <TabsList className="bg-muted/50 p-1 rounded-xl border-2 grid grid-cols-2 md:grid-cols-4 w-full h-auto">
                        <TabsTrigger value="summary" className="font-headline py-2">Call Summary</TabsTrigger>
                        <TabsTrigger value="submitted" className="font-headline py-2">Reports</TabsTrigger>
                        <TabsTrigger value="planning" className="font-headline py-2">Planning</TabsTrigger>
                        <TabsTrigger value="master" className="font-headline py-2">Masterlist</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
            
            <TabsContent value="summary" className="mt-0"><CallSummary entries={allEntries} doctors={allDoctors} nonCallDays={allNonCallDays} timeLogs={allTimeLogs} /></TabsContent>
            <TabsContent value="submitted" className="mt-0"><SubmittedList entries={allEntries} doctors={allDoctors} onDelete={onDeleteEntry} onEdit={() => {}} readOnly={!isAdminView} userMap={userMap} /></TabsContent>
            <TabsContent value="planning" className="mt-0"><PlanningCalendar doctors={allDoctors} plans={allPlans} planningRequests={[]} onRequestUnlock={async () => false} entries={allEntries} offlineEntries={[]} onAddPlan={() => {}} onAddPlansBulk={async () => false} onRemovePlan={() => {}} onLogCall={() => {}} nonCallDays={allNonCallDays} onAddNonCallDay={() => {}} readOnly={true} selectedMonth={selectedMonth} onMonthChange={onMonthChange} /></TabsContent>
            <TabsContent value="master" className="mt-0"><MasterList doctors={allDoctors} entries={allEntries} onAddDoctor={onAddDoctor} onAddDoctorsBulk={onAddDoctorsBulk} onUpdateDoctor={onUpdateDoctor} onDeleteDoctor={onDeleteDoctor} onDeleteDoctorsBulk={onDeleteDoctorsBulk} readOnly={!isAdminView} /></TabsContent>
        </div>
    );
}
