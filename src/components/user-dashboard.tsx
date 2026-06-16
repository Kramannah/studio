
'use client';

import { useState, useEffect } from "react";
import type { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmittedList } from "@/components/submitted-list";
import { MasterList } from "@/components/master-list";
import { PlanningCalendar } from "@/components/planning-calendar";
import { CallSummary } from "@/components/call-summary";
import { Button } from "@/components/ui/button";
import { RefreshCw, LayoutGrid, ClipboardList, CalendarDays, UsersRound } from "lucide-react";

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
    onFetchUserData?: (uid: string) => Promise<void>;
}

export function UserDashboard({ 
    userId, 
    allEntries = [], 
    allDoctors = [], 
    allPlans = [], 
    allNonCallDays = [], 
    allTimeLogs = [], 
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
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        if (!onFetchUserData || !userId) return;
        setIsRefreshing(true);
        try {
            await onFetchUserData(userId);
        } finally {
            setIsRefreshing(false);
        }
    };
    
    return (
        <div className="space-y-6 w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/20 p-2 rounded-xl border">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-fit">
                    <TabsList className="bg-transparent p-1 grid grid-cols-2 md:grid-cols-4 w-full h-auto gap-2">
                        <TabsTrigger value="summary" className="font-headline data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
                            <LayoutGrid size={16} /> Call Summary
                        </TabsTrigger>
                        <TabsTrigger value="submitted" className="font-headline data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
                            <ClipboardList size={16} /> Reports
                        </TabsTrigger>
                        <TabsTrigger value="planning" className="font-headline data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
                            <CalendarDays size={16} /> Planning
                        </TabsTrigger>
                        <TabsTrigger value="master" className="font-headline data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
                            <UsersRound size={16} /> Masterlist
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                {onFetchUserData && (
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleRefresh} 
                        disabled={isRefreshing}
                        className="h-10 border-2 font-headline"
                    >
                        <RefreshCw className={isRefreshing ? "animate-spin mr-2" : "mr-2"} size={16} />
                        Sync Latest
                    </Button>
                )}
            </div>
            
            <TabsContent value="summary" className="mt-0 w-full">
                <CallSummary entries={allEntries} doctors={allDoctors} nonCallDays={allNonCallDays} timeLogs={allTimeLogs} />
            </TabsContent>
            
            <TabsContent value="submitted" className="mt-0 w-full">
                <SubmittedList entries={allEntries} doctors={allDoctors} nonCallDays={allNonCallDays} onDelete={onDeleteEntry} onEdit={() => {}} readOnly={!isAdminView} />
            </TabsContent>
            
            <TabsContent value="planning" className="mt-0 w-full">
                <PlanningCalendar 
                    doctors={allDoctors} 
                    plans={allPlans} 
                    planningRequests={[]} 
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
            
            <TabsContent value="master" className="mt-0 w-full">
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
        </div>
    );
}
