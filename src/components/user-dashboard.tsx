'use client';

import { useMemo, useState } from "react";
import type { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, MarketingSample } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmittedList } from "@/components/submitted-list";
import { MasterList } from "@/components/master-list";
import { PlanningCalendar } from "@/components/planning-calendar";
import { CallSummary } from "@/components/call-summary";

interface UserDashboardProps {
    userId: string;
    allEntries: CoverageEntry[];
    allDoctors: Doctor[];
    allPlans: Plan[];
    allNonCallDays: NonCallDay[];
    allTimeLogs: TimeLog[];
    allMarketingSamples: MarketingSample[];
    onDeleteEntry: (id: string) => void;
    usedQuantities: Record<string, number>;
    isAdminView?: boolean;
    userMap?: Record<string, { code: string; firstName: string; lastName: string; }>;
    onAddDoctor?: (doctor: Omit<Doctor, 'id'>) => void;
    onAddDoctorsBulk?: (doctors: Omit<Doctor, 'id'>[]) => void;
    onUpdateDoctor?: (doctor: Doctor) => void;
    onDeleteDoctor?: (id: string) => void;
    onDeleteDoctorsBulk?: (ids: string[]) => void;
}

export function UserDashboard({ 
    userId, 
    allEntries, 
    allDoctors, 
    allPlans, 
    allNonCallDays, 
    allTimeLogs, 
    onDeleteEntry = () => {},
    isAdminView = false,
    userMap,
    onAddDoctor = () => {},
    onAddDoctorsBulk = () => {},
    onUpdateDoctor = () => {},
    onDeleteDoctor = () => {},
    onDeleteDoctorsBulk = () => {},
}: UserDashboardProps) {
    const [activeTab, setActiveTab] = useState('summary');

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
              />
            </TabsContent>
            <TabsContent value="submitted" className="mt-6">
              <SubmittedList 
                entries={allEntries} 
                doctors={allDoctors} 
                onDelete={onDeleteEntry} 
                onEdit={() => {}} 
                readOnly={!isAdminView} 
                isAdminView={isAdminView} 
                userMap={userMap} 
              />
            </TabsContent>
            <TabsContent value="planning" className="mt-6">
                <PlanningCalendar 
                    doctors={allDoctors} 
                    plans={allPlans}
                    planningRequests={[]} // Logic for team planning requests can be extended if needed
                    onRequestUnlock={async () => false}
                    entries={allEntries}
                    offlineEntries={[]}
                    onAddPlan={() => {}} 
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
