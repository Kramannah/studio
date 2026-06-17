
'use client';

import { useState, useEffect } from "react";
import type { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmittedList } from "@/components/submitted-list";
import { MasterList } from "@/components/master-list";
import { PlanningCalendar } from "@/components/planning-calendar";
import { CallSummary } from "@/components/call-summary";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserDashboardProps {
    userId: string;
    allEntries: CoverageEntry[];
    allDoctors: Doctor[];
    allPlans: Plan[];
    allNonCallDays: NonCallDay[];
    allTimeLogs: TimeLog[];
    individualPlanningRequests?: PlanningPermissionRequest[];
    onDeleteEntry: (id: string) => void;
    usedQuantities: Record<string, number>;
    isAdminView?: boolean;
    userMap?: Record<string, { code: string; firstName: string; lastName: string; }>;
    onAddDoctor?: (doctor: Omit<Doctor, 'id'>) => void;
    onAddDoctorsBulk?: (doctors: Omit<Doctor, 'id'>[]) => void;
    onUpdateDoctor?: (doctor: Doctor) => void;
    onDeleteDoctor?: (id: string) => void;
    onDeleteDoctorsBulk?: (ids: string[]) => void;
    onFetchUserData?: (uid: string, month: string) => Promise<void>;
    selectedMonth?: string;
    onMonthChange?: (month: string) => void;
}

export function UserDashboard({ 
    userId, 
    allEntries = [], 
    allDoctors = [], 
    allPlans = [], 
    allNonCallDays = [], 
    allTimeLogs = [], 
    individualPlanningRequests = [],
    onDeleteEntry = () => {}, 
    isAdminView = false, 
    userMap,
    onAddDoctor = () => {}, 
    onAddDoctorsBulk = () => {}, 
    onUpdateDoctor = () => {}, 
    onDeleteDoctor = () => {}, 
    onDeleteDoctorsBulk = () => {},
    onFetchUserData,
    selectedMonth,
    onMonthChange
}: UserDashboardProps) {
    const [activeTab, setActiveTab] = useState('summary');
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        if (!onFetchUserData || !userId || !selectedMonth) return;
        setIsRefreshing(true);
        try {
            await onFetchUserData(userId, selectedMonth);
        } finally {
            setIsRefreshing(false);
        }
    };

    // Auto-fetch data when the user or month context changes to keep Admin views in sync
    useEffect(() => {
        if (onFetchUserData && userId && selectedMonth) {
            onFetchUserData(userId, selectedMonth);
        }
    }, [selectedMonth, userId, onFetchUserData]);
    
    return (
        <div className="space-y-6 w-full animate-in fade-in duration-500">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                {/* Fixed Layout: TabsList and Refresh button in a high-fidelity bar */}
                <div className="flex items-center justify-between gap-4 bg-[#0a0c14] p-1.5 rounded-xl border border-white/5 shadow-2xl overflow-x-auto overflow-y-hidden scrollbar-hide mb-6">
                    <TabsList className="bg-transparent h-10 p-0 flex gap-1">
                        <TabsTrigger 
                            value="summary" 
                            className="rounded-lg font-headline px-6 data-[state=active]:bg-[#10b981] data-[state=active]:text-white transition-all h-9"
                        >
                            Call Summary
                        </TabsTrigger>
                        <TabsTrigger 
                            value="submitted" 
                            className="rounded-lg font-headline px-6 data-[state=active]:bg-[#10b981] data-[state=active]:text-white transition-all h-9"
                        >
                            Reports
                        </TabsTrigger>
                        <TabsTrigger 
                            value="planning" 
                            className="rounded-lg font-headline px-6 data-[state=active]:bg-[#10b981] data-[state=active]:text-white transition-all h-9"
                        >
                            Planning
                        </TabsTrigger>
                        <TabsTrigger 
                            value="master" 
                            className="rounded-lg font-headline px-6 data-[state=active]:bg-[#10b981] data-[state=active]:text-white transition-all h-9"
                        >
                            Masterlist
                        </TabsTrigger>
                    </TabsList>

                    {onFetchUserData && (
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleRefresh} 
                            disabled={isRefreshing}
                            className="h-9 font-headline text-white hover:bg-white/5 gap-2 px-4 bg-[#111827] border border-white/5 rounded-lg shrink-0"
                        >
                            <RefreshCw className={cn(isRefreshing && "animate-spin")} size={14} />
                            Refresh Data
                        </Button>
                    )}
                </div>
                
                {/* Unified Tab Content Area: Ensure everything is inside <Tabs> */}
                <div className="pt-2 min-h-[400px]">
                    <TabsContent value="summary" className="mt-0 w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <CallSummary 
                            entries={allEntries} 
                            doctors={allDoctors} 
                            nonCallDays={allNonCallDays} 
                            timeLogs={allTimeLogs} 
                            selectedMonth={selectedMonth}
                            onMonthChange={onMonthChange}
                        />
                    </TabsContent>
                    
                    <TabsContent value="submitted" className="mt-0 w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <SubmittedList 
                            entries={allEntries} 
                            doctors={allDoctors} 
                            onDelete={onDeleteEntry} 
                            onEdit={() => {}} 
                            readOnly={!isAdminView} 
                        />
                    </TabsContent>
                    
                    <TabsContent value="planning" className="mt-0 w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <PlanningCalendar 
                            doctors={allDoctors} 
                            plans={allPlans} 
                            planningRequests={individualPlanningRequests} 
                            onRequestUnlock={async () => false} 
                            entries={allEntries} 
                            onAddPlan={() => {}} 
                            onAddPlansBulk={async () => false} 
                            onRemovePlan={() => {}} 
                            onLogCall={() => {}} 
                            nonCallDays={allNonCallDays} 
                            onAddNonCallDay={() => {}} 
                            readOnly={true} 
                            selectedMonth={selectedMonth}
                            onMonthChange={onMonthChange}
                        />
                    </TabsContent>
                    
                    <TabsContent value="master" className="mt-0 w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <MasterList 
                            doctors={allDoctors} 
                            entries={allEntries} 
                            onAddDoctor={onAddDoctor} 
                            onAddDoctorsBulk={onAddDoctorsBulk} 
                            onUpdateDoctor={onUpdateDoctor} 
                            onDeleteDoctor={onDeleteDoctor} 
                            onDeleteDoctorsBulk={onDeleteDoctorsBulk} 
                            readOnly={true} 
                        />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
