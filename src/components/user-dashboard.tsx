

'use client';

import { useMemo, useState } from "react";
import type { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, MarketingSample } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmittedList } from "@/components/submitted-list";
import { MasterList } from "@/components/master-list";
import { PlanningCalendar } from "@/components/planning-calendar";
import { CallSummary } from "@/components/call-summary";
import { MarketingList } from "./marketing-list";

interface UserDashboardProps {
    userId: string;
    allEntries?: CoverageEntry[];
    allDoctors?: Doctor[];
    allPlans?: Plan[];
    allNonCallDays?: NonCallDay[];
    allTimeLogs?: TimeLog[];
    allMarketingSamples: MarketingSample[];
    onDeleteEntry?: (id: string) => void;
    usedQuantities?: Record<string, number>;
}

export function UserDashboard({ 
    userId, 
    allEntries, 
    allDoctors, 
    allPlans, 
    allNonCallDays, 
    allTimeLogs, 
    allMarketingSamples, 
    onDeleteEntry = () => {},
    usedQuantities
}: UserDashboardProps) {
    const [activeTab, setActiveTab] = useState('summary');

    const userData = useMemo(() => {
        return {
            entries: (allEntries || []).filter(e => e.userId === userId),
            doctors: (allDoctors || []).filter(d => d.userId === userId),
            plans: (allPlans || []).filter(p => p.userId === userId),
            nonCallDays: (allNonCallDays || []).filter(ncd => ncd.userId === userId),
            timeLogs: (allTimeLogs || []).filter(tl => tl.userId === userId),
        }
    }, [userId, allEntries, allDoctors, allPlans, allNonCallDays, allTimeLogs]);

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="summary" className="font-headline">Call Summary</TabsTrigger>
              <TabsTrigger value="submitted" className="font-headline">Submitted Coverage</TabsTrigger>
              <TabsTrigger value="planning" className="font-headline">Call Planning</TabsTrigger>
              <TabsTrigger value="master" className="font-headline">Doctor Masterlist</TabsTrigger>
              <TabsTrigger value="marketing" className="font-headline">Marketing Samples</TabsTrigger>
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
              <SubmittedList entries={userData.entries} onDelete={onDeleteEntry} onEdit={() => {}} readOnly={false} />
            </TabsContent>
            <TabsContent value="planning" className="mt-6">
                <PlanningCalendar 
                    doctors={userData.doctors} 
                    plans={userData.plans}
                    entries={userData.entries}
                    offlineEntries={[]}
                    onAddPlan={() => {}} 
                    onRemovePlan={() => {}} 
                    onLogCall={() => {}}
                    nonCallDays={userData.nonCallDays}
                    onAddNonCallDay={() => {}}
                    readOnly={true}
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
                    onDeleteDoctorsBulk={() => {}}
                    readOnly={true}
                />
            </TabsContent>
            <TabsContent value="marketing" className="mt-6">
                <MarketingList 
                    samples={allMarketingSamples}
                    usedQuantities={usedQuantities || {}}
                    onAddSamplesBulk={async () => false}
                    readOnly={true}
                />
            </TabsContent>
          </Tabs>
    );
}
