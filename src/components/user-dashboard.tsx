
'use client';

import { useMemo, useState } from "react";
import type { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog } from "@/lib/types";
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
}

export function UserDashboard({ userId, allEntries, allDoctors, allPlans, allNonCallDays, allTimeLogs }: UserDashboardProps) {
    const [activeTab, setActiveTab] = useState('summary');

    const userData = useMemo(() => {
        return {
            entries: allEntries.filter(e => e.userId === userId),
            doctors: allDoctors.filter(d => d.userId === userId),
            plans: allPlans.filter(p => p.userId === userId),
            nonCallDays: allNonCallDays.filter(ncd => ncd.userId === userId),
            timeLogs: allTimeLogs.filter(tl => tl.userId === userId)
        }
    }, [userId, allEntries, allDoctors, allPlans, allNonCallDays, allTimeLogs]);

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
                entries={userData.entries} 
                doctors={userData.doctors} 
                nonCallDays={userData.nonCallDays} 
                timeLogs={userData.timeLogs} 
              />
            </TabsContent>
            <TabsContent value="submitted" className="mt-6">
              <SubmittedList entries={userData.entries} onDelete={() => {}} onEdit={() => {}} />
            </TabsContent>
            <TabsContent value="planning" className="mt-6">
                <PlanningCalendar 
                    doctors={userData.doctors} 
                    plans={userData.plans}
                    entries={userData.entries}
                    onAddPlan={() => {}} 
                    onRemovePlan={() => {}} 
                    onLogCall={() => {}}
                    nonCallDays={userData.nonCallDays}
                    onAddNonCallDay={() => {}}
                />
            </TabsContent>
            <TabsContent value="master" className="mt-6">
                <MasterList 
                    doctors={userData.doctors}
                    entries={userData.entries}
                    onAddDoctor={() => {}}
                    onAddDoctorsBulk={() => {}}
                    onUpdateDoctor={() => {}} 
                    onDeleteDoctor={() => {}} 
                />
            </TabsContent>
          </Tabs>
    );
}
