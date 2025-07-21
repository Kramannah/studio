
'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoverageForm } from '@/components/coverage-form';
import { OfflineList } from '@/components/offline-list';
import { MasterList } from '@/components/master-list';
import { CallSummary } from '@/components/call-summary';
import { PlanningCalendar } from '@/components/planning-calendar';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { useDoctors } from '@/hooks/use-doctors';
import { usePlans } from '@/hooks/use-plans';
import { useNonCallDays } from '@/hooks/use-non-call-days';
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { SubmittedList } from "@/components/submitted-list";
import type { Doctor, Plan, CoverageEntry } from "@/lib/types";
import { isToday, parseISO } from "date-fns";

export default function Home() {
  const { offlineEntries, masterEntries, saveEntry, deleteMasterEntry, isSyncing, syncAllOfflineEntries, updateMasterEntry } = useOfflineSync();
  const { doctors, addDoctor, addDoctorsBulk, updateDoctor, deleteDoctor } = useDoctors();
  const { plans, addPlan, removePlan } = usePlans();
  const { nonCallDays, addNonCallDay } = useNonCallDays();
  const [isOnline, setIsOnline] = useState(true);
  const [activeTab, setActiveTab] = useState('planning');
  const [doctorToLog, setDoctorToLog] = useState<Doctor | null>(null);
  const [entryToEdit, setEntryToEdit] = useState<CoverageEntry | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'onLine' in navigator) {
      setIsOnline(navigator.onLine);
    }
    
    const handleOnline = () => {
        setIsOnline(true);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLogPlannedCall = (doctor: Doctor) => {
    setDoctorToLog(doctor);
    setEntryToEdit(null);
    setActiveTab('coverage');
  };

  const handleEditEntry = (entry: CoverageEntry) => {
    setEntryToEdit(entry);
    setDoctorToLog(null);
    setActiveTab('coverage');
  };

  const handleFormSubmit = () => {
    setDoctorToLog(null);
    setEntryToEdit(null);
  };

  const todaysPlans = plans.filter(p => isToday(parseISO(p.plannedDate)));


  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b md:px-6 bg-background/80 backdrop-blur-sm">
        <h1 className="text-xl font-bold md:text-2xl font-headline text-primary">SFE Offline coverage</h1>
        <div className="flex items-center gap-2">
            <Badge variant={isOnline ? "secondary" : "destructive"} className="flex items-center gap-2 px-3 py-1 font-headline">
                {isSyncing ? <RefreshCw size={14} className="animate-spin" /> : (isOnline ? <Wifi size={14} /> : <WifiOff size={14} />)}
                <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : (isOnline ? 'Online' : 'Offline')}</span>
            </Badge>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="planning" className="font-headline">Call Planning</TabsTrigger>
            <TabsTrigger value="coverage" className="font-headline">Call Reporting</TabsTrigger>
            <TabsTrigger value="offline" className="relative font-headline">
              Offline Call
              {offlineEntries.length > 0 && 
                <Badge className="absolute w-5 h-5 p-0 text-xs -top-2 -right-2 " variant="destructive">{offlineEntries.length}</Badge>
              }
            </TabsTrigger>
            <TabsTrigger value="submitted" className="font-headline">Submitted Coverage</TabsTrigger>
            <TabsTrigger value="summary" className="font-headline">Call Summary</TabsTrigger>
            <TabsTrigger value="master" className="font-headline">Doctor Masterlist</TabsTrigger>
          </TabsList>
          
          <TabsContent value="planning" className="mt-6">
            <PlanningCalendar 
              doctors={doctors} 
              plans={plans}
              entries={masterEntries}
              onAddPlan={addPlan} 
              onRemovePlan={removePlan} 
              onLogCall={handleLogPlannedCall}
              nonCallDays={nonCallDays}
              onAddNonCallDay={addNonCallDay}
            />
          </TabsContent>
          <TabsContent value="coverage" className="mt-6">
            <CoverageForm 
              onSave={saveEntry}
              onUpdate={updateMasterEntry}
              isOnline={isOnline} 
              doctors={doctors} 
              masterEntries={masterEntries}
              initialDoctor={doctorToLog} 
              onFormSubmit={handleFormSubmit}
              todaysPlans={todaysPlans}
              offlineEntries={offlineEntries}
              entryToEdit={entryToEdit}
            />
          </TabsContent>
          <TabsContent value="offline" className="mt-6">
            <OfflineList entries={offlineEntries} isSyncing={isSyncing} syncAll={syncAllOfflineEntries} isOnline={isOnline} />
          </TabsContent>
          <TabsContent value="submitted" className="mt-6">
            <SubmittedList entries={masterEntries} onDelete={deleteMasterEntry} onEdit={handleEditEntry} />
          </TabsContent>
          <TabsContent value="summary" className="mt-6">
            <CallSummary entries={masterEntries} doctors={doctors} nonCallDays={nonCallDays}/>
          </TabsContent>
          <TabsContent value="master" className="mt-6">
            <MasterList 
              doctors={doctors}
              entries={masterEntries}
              onAddDoctor={addDoctor}
              onAddDoctorsBulk={addDoctorsBulk}
              onUpdateDoctor={updateDoctor} 
              onDeleteDoctor={deleteDoctor} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
