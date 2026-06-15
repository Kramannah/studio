
'use client';

import { useMemo, useState, useEffect, useCallback } from "react";
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
    individualAvailableMonths?: string[];
    onDeleteEntry: (id: string) => void;
    usedQuantities: Record<string, number>;
    isAdminView?: boolean;
    userMap?: Record<string, { code: string; firstName: string; lastName: string; }>;
    onAddDoctor?: (doctor: Omit<Doctor, 'id'>) => void;
    onAddDoctorsBulk?: (doctors: Omit<Doctor, 'id'>[]) => void;
    onUpdateDoctor?: (doctor: Doctor) => void;
    onDeleteDoctor?: (id: string) => void;
    onDeleteDoctorsBulk?: (ids: string[]) => void;
    onFetchUserData?: (uid: string, month: string, force?: boolean) => void;
    selectedMonth: string;
    onMonthChange: (month: string) => void;
}

export function UserDashboard({ 
    userId, 
    allEntries, 
    allDoctors, 
    allPlans, 
    allNonCallDays, 
    allTimeLogs, 
    individualPlanningRequests = [],
    individualAvailableMonths = [],
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
    
    useEffect(() => {
        if (isAdminView && onFetchUserData && userId) {
            onFetchUserData(userId, selectedMonth);
        }
    }, [userId, isAdminView, onFetchUserData, selectedMonth]);

    const handleManualRefresh = useCallback(async () => {
        if (isAdminView && onFetchUserData && userId) {
            setIsRefreshing(true);
            try {
                // Defensive await to catch any unexpected rejection that might escape the hook
                await onFetchUserData(userId, selectedMonth, true);
            } catch (err) {
                console.warn("Manual data refresh timed out or failed:", err);
            } finally {
                setTimeout(() => setIsRefreshing(false), 800);
            }
        }
    }, [userId, selectedMonth, isAdminView, onFetchUserData]);

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <TabsList className="bg-muted/50 p-1 rounded-xl border-2 grid grid-cols-2 md:grid-cols-4 w-full md:w-fit h-auto">
                    <TabsTrigger value="summary" className="font-headline py-2">Call Summary</TabsTrigger>
                    <TabsTrigger value="submitted" className="font-headline py-2">Reports</TabsTrigger>
                    <TabsTrigger value="planning" className="font-headline py-2">Planning</TabsTrigger>
                    <TabsTrigger value="master" className="font-headline py-2">Masterlist</TabsTrigger>
                </TabsList>
                {isAdminView && (
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="font-headline h-10 border-2 gap-2" 
                        onClick={handleManualRefresh}
                        disabled={isRefreshing}
                    >
                        <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
                        {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
                    </Button>
                )}
            </div>
            
            <TabsContent value="summary" className="mt-0">
              <CallSummary 
                entries={allEntries} 
                availableMonths={individualAvailableMonths}
                doctors={allDoctors} 
                nonCallDays={allNonCallDays} 
                timeLogs={allTimeLogs}
                isAdminView={isAdminView}
                selectedMonth={selectedMonth} 
                onMonthChange={onMonthChange} 
              />
            </TabsContent>
            <TabsContent value="submitted" className="mt-0">
              <SubmittedList 
                entries={allEntries} 
                availableMonths={individualAvailableMonths}
                doctors={allDoctors} 
                nonCallDays={allNonCallDays}
                onDelete={onDeleteEntry} 
                onEdit={() => {}} 
                readOnly={!isAdminView} 
                isAdminView={isAdminView} 
                userMap={userMap} 
                selectedMonth={selectedMonth} 
                onMonthChange={onMonthChange} 
              />
            </TabsContent>
            <TabsContent value="planning" className="mt-0">
                <PlanningCalendar 
                    doctors={allDoctors} 
                    plans={allPlans}
                    planningRequests={individualPlanningRequests}
                    onRequestUnlock={async () => false}
                    entries={allEntries}
                    offlineEntries={[]}
                    onAddPlan={() => {}} 
                    onAddPlansBulk={async () => false}
                    onRemovePlan={() => {}} 
                    onLogCall={() => {}}
                    nonCallDays={allNonCallDays}
                    onAddNonCallDay={() => {}}
                    readOnly={true}
                />
            </TabsContent>
            <TabsContent value="master" className="mt-0">
                <MasterList 
                    doctors={allDoctors}
                    entries={allEntries}
                    onAddDoctor={onAddDoctor}
                    onAddDoctorsBulk={onAddDoctorsBulk}
                    onUpdateDoctor={onUpdateDoctor} 
                    onDeleteDoctor={onDeleteDoctor}
                    onDeleteDoctorsBulk={onDeleteDoctorsBulk}
                    readOnly={!isAdminView}
                />
            </TabsContent>
          </Tabs>
    );
}
