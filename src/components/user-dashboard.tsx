'use client';

import { useState, useEffect, useRef } from "react";
import type { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest, MarketingEvent } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmittedList } from "@/components/submitted-list";
import { MasterList } from "@/components/master-list";
import { PlanningCalendar } from "@/components/planning-calendar";
import { CallSummary } from "@/components/call-summary";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Q4AllocationView } from "./q4-allocation-view";
import { MarketingEventsView } from "./marketing-events-view";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
    onFetchUserData?: (uid: string, month: string, force?: boolean, trend?: boolean, summary?: boolean) => Promise<void>;
    selectedMonth?: string;
    onMonthChange?: (month: string) => void;
    syncSource?: 'cache' | 'server' | null;
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
    onMonthChange,
    syncSource
}: UserDashboardProps) {
    const [activeTab, setActiveTab] = useState('summary');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loadTrend, setLoadTrend] = useState(false);
    const lastFetchedRef = useRef<string>("");

    useEffect(() => {
        if (onFetchUserData && userId && selectedMonth) {
            // Updated logic: Include month-wide summary records for both 'summary' and 'submitted' tabs.
            // This ensures the Calendar view in the reports tab can show activity indicators for all dates.
            const needsSummary = activeTab === 'summary' || activeTab === 'submitted';
            const fetchKey = `${userId}_${selectedMonth}_${loadTrend}_${needsSummary}`;
            
            if (lastFetchedRef.current !== fetchKey) {
                lastFetchedRef.current = fetchKey;
                onFetchUserData(userId, selectedMonth, false, loadTrend, needsSummary);
            }
        }
    }, [selectedMonth, userId, onFetchUserData, loadTrend, activeTab]);

    const handleRefresh = async () => {
        if (!onFetchUserData || !userId || !selectedMonth) return;
        setIsRefreshing(true);
        try {
            const needsSummary = activeTab === 'summary' || activeTab === 'submitted';
            await onFetchUserData(userId, selectedMonth, true, loadTrend, needsSummary);
        } finally {
            setIsRefreshing(false);
        }
    };

    const pmrInfo = userMap?.[userId];
    const dashboardPmrName = pmrInfo ? `${pmrInfo.firstName} ${pmrInfo.lastName}` : (userId || "PMR");
    
    const renderCacheStatus = () => {
      return (
        <TooltipProvider>
          {syncSource === 'server' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-blue-600/50 cursor-help ml-2" />
              </TooltipTrigger>
              <TooltipContent><p className="font-headline text-[9px] uppercase">Live from Firestore</p></TooltipContent>
            </Tooltip>
          )}
          {syncSource === 'cache' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 border border-green-600/50 cursor-help ml-2" />
              </TooltipTrigger>
              <TooltipContent><p className="font-headline text-[9px] uppercase">Loaded from local cache</p></TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      );
    };

    return (
        <div className="space-y-6 w-full animate-in fade-in duration-500">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex items-center justify-between gap-4 bg-[#0a0c14] p-1.5 rounded-xl border border-white/5 shadow-2xl overflow-x-auto overflow-y-hidden scrollbar-hide mb-6">
                    <div className="flex items-center gap-4">
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
                                value="events" 
                                className="rounded-lg font-headline px-6 data-[state=active]:bg-[#10b981] data-[state=active]:text-white transition-all h-9"
                            >
                                Marketing Events
                            </TabsTrigger>
                            <TabsTrigger 
                                value="master" 
                                className="rounded-lg font-headline px-6 data-[state=active]:bg-[#10b981] data-[state=active]:text-white transition-all h-9"
                            >
                                Masterlist
                            </TabsTrigger>
                            <TabsTrigger 
                                value="allocation" 
                                className="rounded-lg font-headline px-6 data-[state=active]:bg-[#10b981] data-[state=active]:text-white transition-all h-9"
                            >
                                Samples
                            </TabsTrigger>
                        </TabsList>
                        
                        {renderCacheStatus()}
                    </div>

                    {onFetchUserData && (
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleRefresh} 
                            disabled={isRefreshing}
                            className="h-9 font-headline text-white hover:bg-white/5 gap-2 px-4 bg-[#111827] border border-white/5 rounded-lg shrink-0"
                        >
                            {isRefreshing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                            Refresh Data
                        </Button>
                    )}
                </div>
                
                <div className="pt-2 min-h-[400px]">
                    <TabsContent value="summary" className="mt-0 w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <CallSummary 
                            pmrName={dashboardPmrName}
                            entries={allEntries || []} 
                            doctors={allDoctors || []} 
                            nonCallDays={allNonCallDays || []} 
                            timeLogs={allTimeLogs || []} 
                            selectedMonth={selectedMonth}
                            onMonthChange={onMonthChange}
                            loadTrend={loadTrend}
                            onLoadTrend={setLoadTrend}
                        />
                    </TabsContent>
                    
                    <TabsContent value="submitted" className="mt-0 w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <SubmittedList 
                            entries={allEntries || []} 
                            allEntries={allEntries || []}
                            doctors={allDoctors || []} 
                            nonCallDays={allNonCallDays || []}
                            onDelete={onDeleteEntry} 
                            onEdit={() => {}} 
                            readOnly={!isAdminView} 
                            selectedMonth={selectedMonth}
                            onMonthChange={onMonthChange}
                        />
                    </TabsContent>
                    
                    <TabsContent value="planning" className="mt-0 w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <PlanningCalendar 
                            doctors={allDoctors || []} 
                            plans={allPlans || []} 
                            planningRequests={individualPlanningRequests || []} 
                            onRequestUnlock={async () => false} 
                            entries={allEntries || []} 
                            onAddPlan={() => {}} 
                            onAddPlansBulk={async () => false} 
                            onRemovePlan={() => {}} 
                            onLogCall={() => {}} 
                            nonCallDays={allNonCallDays || []} 
                            onAddNonCallDay={() => {}} 
                            readOnly={true} 
                            selectedMonth={selectedMonth}
                            onMonthChange={onMonthChange}
                        />
                    </TabsContent>

                    <TabsContent value="events" className="mt-0 w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <MarketingEventsView userId={userId} readOnly={true} pmrName={dashboardPmrName} />
                    </TabsContent>
                    
                    <TabsContent value="master" className="mt-0 w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <MasterList 
                            doctors={allDoctors || []} 
                            entries={allEntries || []} 
                            onAddDoctor={onAddDoctor} 
                            onAddDoctorsBulk={onAddDoctorsBulk} 
                            onUpdateDoctor={onUpdateDoctor} 
                            onDeleteDoctor={onDeleteDoctor} 
                            onDeleteDoctorsBulk={onDeleteDoctorsBulk} 
                            readOnly={true} 
                        />
                    </TabsContent>

                    <TabsContent value="allocation" className="mt-0 w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <Q4AllocationView readOnly={true} userId={userId} />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
