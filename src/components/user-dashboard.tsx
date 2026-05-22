'use client';

import { useMemo, useState, useEffect } from "react";
import type { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, MarketingSample, PlanningPermissionRequest } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmittedList } from "@/components/submitted-list";
import { MasterList } from "@/components/master-list";
import { PlanningCalendar } from "@/components/planning-calendar";
import { CallSummary } from "@/components/call-summary";
import { format } from "date-fns";

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
    onFetchUserData?: (uid: string, month: string) => void;
}

export function UserDashboard({ 
    userId, 
    allEntries, 
    allDoctors, 
    allPlans, 
    allNonCallDays, 
    allTimeLogs, 
    individualPlanningRequests = [],
    onDeleteEntry = () => {},
    isAdminView = false,
    userMap,
    onAddDoctor = () => {},
    onAddDoctorsBulk = () => {},
    onUpdateDoctor = () => {},
    onDeleteDoctor = () => {},
    onDeleteDoctorsBulk = () => {},
    onFetchUserData
}: UserDashboardProps) {
    const [activeTab, setActiveTab] = useState('summary');
    
    // [QUERY_ON_DEMAND_LOGIC] - Shared month state for admin drilling
    const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));

    // Trigger re-fetch when Admin changes the month for the selected PMR
    useEffect(() => {
        if (isAdminView && onFetchUserData && userId) {
            onFetchUserData(userId, selectedMonth);
        }
    }, [selectedMonth, userId, isAdminView, onFetchUserData]);

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="summary" className="font-headline">Call Summary</TabsTrigger>
              <TabsTrigger value="submitted" className="font-headline">Submitted Coverage</TabsTrigger>
              <TabsTrigger value="planning" className="font-headline">Call Planning</TabsTrigger>
              <TabsTrigger value="master" className="font-headline">Doctor Masterlist</TabsTrigger>
            </TabsList>
            
            <TabsContent value="summary" className="mt-6">
              <CallSummary 
                entries={allEntries} 
                doctors={allDoctors} 
                nonCallDays={allNonCallDays} 
                timeLogs={allTimeLogs}
                isAdminView={isAdminView}
                selectedMonth={selectedMonth}
                onMonthChange={setSelectedMonth}
              />
            </TabsContent>
            <TabsContent value="submitted" className="mt-6">
              <SubmittedList 
                entries={allEntries} 
                doctors={allDoctors} 
                nonCallDays={allNonCallDays}
                onDelete={onDeleteEntry} 
                onEdit={() => {}} 
                readOnly={!isAdminView} 
                isAdminView={isAdminView} 
                userMap={userMap} 
                selectedMonth={selectedMonth}
                onMonthChange={setSelectedMonth}
              />
            </TabsContent>
            <TabsContent value="planning" className="mt-6">
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
            <TabsContent value="master" className="mt-6">
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