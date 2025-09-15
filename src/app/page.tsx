
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
import { Wifi, WifiOff, RefreshCw, Clock, LogIn, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { SubmittedList } from "@/components/submitted-list";
import type { Doctor, Plan, CoverageEntry } from "@/lib/types";
import { isToday, parseISO, format } from "date-fns";
import { useMarketingSamples } from "@/hooks/use-marketing-samples";
import { MarketingList } from "@/components/marketing-list";
import { useTimeLog } from "@/hooks/use-time-log";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TimeInDialog } from "@/components/time-in-dialog";
import { TimeOutDialog } from "@/components/time-out-dialog";
import { useAuth } from "@/hooks/use-auth";
import { LoginPage } from "@/components/login-page";


export default function Home() {
  const { user, loading: authLoading, logout } = useAuth();
  const { marketingSamples, addMarketingSamplesBulk, usedQuantities, updateSampleUsage } = useMarketingSamples();
  const { offlineEntries, masterEntries, saveEntry, deleteMasterEntry, isSyncing, syncAllOfflineEntries, isOnline, updateMasterEntry, updateOfflineEntry } = useOfflineSync(updateSampleUsage, user?.uid);
  const { doctors, addDoctor, addDoctorsBulk, updateDoctor, deleteDoctor, loading: doctorsLoading } = useDoctors();
  const { plans, addPlan, removePlan, loading: plansLoading } = usePlans();
  const { nonCallDays, addNonCallDay, loading: nonCallDaysLoading } = useNonCallDays();
  const { timeLogs, currentTimeLog, handleTimeIn, handleTimeOut, clearTimeLogs, userId, loading: timeLogLoading } = useTimeLog();
  const [activeTab, setActiveTab] = useState('planning');
  const [doctorToLog, setDoctorToLog] = useState<Doctor | null>(null);
  const [entryToEdit, setEntryToEdit] = useState<CoverageEntry | null>(null);
  const [isTimeInDialogOpen, setIsTimeInDialogOpen] = useState(false);
  const [isTimeOutDialogOpen, setIsTimeOutDialogOpen] = useState(false);

  const handleLogPlannedCall = (doctor: Doctor) => {
    setDoctorToLog(doctor);
    setEntryToEdit(null);
    setActiveTab('coverage');
  };

  const handleEditEntry = (entry: CoverageEntry, isOffline: boolean = false) => {
    setEntryToEdit({ ...entry, isOffline });
    setDoctorToLog(null);
    setActiveTab('coverage');
  };

  const handleFormSubmit = () => {
    setDoctorToLog(null);
    setEntryToEdit(null);
    setActiveTab('submitted');
  };

  const todaysPlans = plans.filter(p => isToday(parseISO(p.plannedDate)));

  const handleTimeInSubmit = (locationType: 'inbase' | 'outbase') => {
    handleTimeIn(locationType);
    setIsTimeInDialogOpen(false);
  };

  const handleTimeOutSubmit = () => {
    handleTimeOut();
    setIsTimeOutDialogOpen(false);
  };
  
  const anyLoading = authLoading || doctorsLoading || plansLoading || nonCallDaysLoading || timeLogLoading;

  if (anyLoading) {
    return (
        <div className="flex items-center justify-center min-h-screen bg-background">
            <RefreshCw className="w-12 h-12 animate-spin text-primary" />
        </div>
    )
  }

  if (!user) {
    return <LoginPage />;
  }

  if (!currentTimeLog) {
    return (
      <>
        <div className="flex flex-col min-h-screen bg-background text-foreground">
          <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b md:px-6 bg-background/80 backdrop-blur-sm">
            <h1 className="text-xl font-bold md:text-2xl font-headline text-primary">SFE Offline coverage</h1>
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{user.email}</span>
                <Button variant="outline" size="sm" onClick={logout}>Logout</Button>
            </div>
          </header>
          <main className="flex-1 flex items-center justify-center p-4 md:p-6">
            <Card className="w-full max-w-md">
              <CardHeader className="text-center">
                <Clock className="w-12 h-12 mx-auto text-primary"/>
                <CardTitle className="mt-4 font-headline">Ready to Start Your Day?</CardTitle>
                <CardDescription>Click the button below to log your time-in and begin your tasks.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button size="lg" className="w-full font-headline" onClick={() => setIsTimeInDialogOpen(true)}>
                  <LogIn className="mr-2" />
                  Time In
                </Button>
              </CardContent>
            </Card>
          </main>
        </div>
        <TimeInDialog
          isOpen={isTimeInDialogOpen}
          onOpenChange={setIsTimeInDialogOpen}
          onTimeIn={handleTimeInSubmit}
          userId={userId}
        />
      </>
    )
  }

  return (
    <>
      <div className="flex flex-col min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b md:px-6 bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold md:text-2xl font-headline text-primary">SFE Offline coverage</h1>
            <div className="text-sm text-muted-foreground font-headline">
                Timed in at: {format(parseISO(currentTimeLog.timeIn), "hh:mm a")}
              </div>
          </div>
          <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground hidden sm:inline">{user.email}</span>
              <Badge variant={isOnline ? "secondary" : "destructive"} className="flex items-center gap-2 px-3 py-1 font-headline">
                  {isSyncing ? <RefreshCw size={14} className="animate-spin" /> : (isOnline ? <Wifi size={14} /> : <WifiOff size={14} />)}
                  <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : (isOnline ? 'Online' : 'Offline')}</span>
              </Badge>
              <Button size="sm" variant="destructive" className="font-headline" onClick={() => setIsTimeOutDialogOpen(true)}>
                <LogOut className="mr-2"/>
                Time Out
              </Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="planning" className="font-headline">Call Planning</TabsTrigger>
              <TabsTrigger value="coverage" className="font-headline">Call Reporting</TabsTrigger>
              <TabsTrigger value="offline" className="relative font-headline">
                Offline Call
                {offlineEntries.length > 0 && 
                  <Badge className="absolute w-5 h-5 p-0 text-xs -top-2 -right-2 " variant="destructive">{offlineEntries.length}</Badge>
                }
              </TabsTrigger>
              <TabsTrigger value="submitted" className="font-headline">Submitted Coverage</TabsTrigger>
              <TabsTrigger value="marketing" className="font-headline">Marketing Samples</TabsTrigger>
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
                onUpdate={entryToEdit?.isOffline ? updateOfflineEntry : updateMasterEntry}
                isOnline={isOnline} 
                doctors={doctors}
                marketingSamples={marketingSamples}
                masterEntries={masterEntries}
                initialDoctor={doctorToLog} 
                onFormSubmit={handleFormSubmit}
                todaysPlans={todaysPlans}
                offlineEntries={offlineEntries}
                entryToEdit={entryToEdit}
              />
            </TabsContent>
            <TabsContent value="offline" className="mt-6">
              <OfflineList 
                entries={offlineEntries} 
                isSyncing={isSyncing} 
                syncAll={syncAllOfflineEntries} 
                isOnline={isOnline}
                onEdit={(entry) => handleEditEntry(entry, true)}
              />
            </TabsContent>
            <TabsContent value="submitted" className="mt-6">
              <SubmittedList entries={masterEntries} onDelete={deleteMasterEntry} onEdit={(entry) => handleEditEntry(entry, false)} />
            </TabsContent>
            <TabsContent value="marketing" className="mt-6">
              <MarketingList 
                samples={marketingSamples}
                usedQuantities={usedQuantities}
                onAddSamplesBulk={addMarketingSamplesBulk}
              />
            </TabsContent>
            <TabsContent value="summary" className="mt-6">
              <CallSummary entries={masterEntries} doctors={doctors} nonCallDays={nonCallDays} timeLogs={timeLogs} clearTimeLogs={clearTimeLogs} />
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
       <TimeOutDialog
          isOpen={isTimeOutDialogOpen && !!currentTimeLog}
          onOpenChange={setIsTimeOutDialogOpen}
          onTimeOut={handleTimeOutSubmit}
          userId={userId}
        />
    </>
  );
}
