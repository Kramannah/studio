

'use client';

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
import { Wifi, WifiOff, RefreshCw, LogIn, LogOut, ShieldCheck, Notebook, ClipboardCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SubmittedList } from "@/components/submitted-list";
import type { Doctor, Plan, CoverageEntry } from "@/lib/types";
import { isToday, parseISO, isValid } from "date-fns";
import { useMarketingSamples } from "@/hooks/use-marketing-samples";
import { MarketingList } from "@/components/marketing-list";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { LoginPage } from "@/components/login-page";
import { ADMIN_UIDS, MANAGER_TEAMS } from "@/lib/admins";
import Link from "next/link";
import { TimeLogDialog } from "@/components/time-log-dialog";
import { useTimeLogs } from "@/hooks/use-time-logs";
import { SidebarProvider, Sidebar, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarHeader, SidebarFooter, SidebarTrigger, SidebarContent, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton } from '@/components/ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

type View = 'planning' | 'coverage' | 'offline' | 'submitted' | 'marketing' | 'summary' | 'master' | 'exams' | 'in-field-coaching';

export default function Home() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const isUserAdmin = useMemo(() => user && ADMIN_UIDS.includes(user.uid), [user]);
  const isUserManager = useMemo(() => user && Object.keys(MANAGER_TEAMS).includes(user.uid), [user]);
  const hasAdminAccess = isUserAdmin || isUserManager;


  const { marketingSamples, usedQuantities, loading: marketingSamplesLoading, refetch: refetchMarketingSamples } = useMarketingSamples();
  const { offlineEntries, masterEntries, saveEntry, deleteMasterEntry, isSyncing, syncAllOfflineEntries, isOnline, updateMasterEntry, updateOfflineEntry, loading: entriesLoading } = useOfflineSync(user?.uid);
  const { doctors, addDoctor, addDoctorsBulk, updateDoctor, deleteDoctor, deleteDoctorsBulk, loading: doctorsLoading } = useDoctors();
  const { plans, addPlan, removePlan, loading: plansLoading, syncAllOfflinePlans, offlinePlanCount } = usePlans();
  const { nonCallDays, addNonCallDay, loading: nonCallDaysLoading } = useNonCallDays();
  const { timeLogs, addTimeIn, addTimeOut, todaysTimeIn, loading: timeLogsLoading } = useTimeLogs();
  const [activeView, setActiveView] = useState<View>('planning');
  const [doctorToLog, setDoctorToLog] = useState<Doctor | null>(null);
  const [entryToEdit, setEntryToEdit] = useState<CoverageEntry | null>(null);
  const [isTimeLogDialogOpen, setIsTimeLogDialogOpen] = useState(false);
  const [timeLogMode, setTimeLogMode] = useState<"time-in" | "time-out">("time-in");

  useEffect(() => {
    if (isOnline) {
      syncAllOfflineEntries();
      if(syncAllOfflinePlans) syncAllOfflinePlans();
    }
  }, [isOnline, syncAllOfflineEntries, syncAllOfflinePlans]);
  
  useEffect(() => {
    // If the user is a manager, redirect them straight to the admin page.
    if (!authLoading && isUserManager) {
      router.push('/admin');
    }
  }, [authLoading, isUserManager, router]);

  const handleLogPlannedCall = (doctor: Doctor) => {
    setDoctorToLog(doctor);
    setEntryToEdit(null);
    setActiveView('coverage');
  };

  const handleEditEntry = (entry: CoverageEntry, isOffline: boolean = false) => {
    setEntryToEdit({ ...entry, isOffline });
    setDoctorToLog(null);
    setActiveView('coverage');
  };

  const handleFormSubmit = (savedOnline: boolean) => {
    setDoctorToLog(null);
    setEntryToEdit(null);
    setActiveView(savedOnline ? 'submitted' : 'offline');
  };

  const todaysPlans = useMemo(() => {
    return plans.filter(p => {
        const plannedDate = typeof p.plannedDate === 'string' ? parseISO(p.plannedDate) : p.plannedDate;
        return isValid(plannedDate) && isToday(plannedDate);
    });
  },[plans]);
  
  if (authLoading) {
    return (
        <div className="flex items-center justify-center min-h-screen bg-background">
            <RefreshCw className="w-12 h-12 animate-spin text-primary" />
        </div>
    )
  }
  
  if (!user || isUserManager) {
    // Show login page if no user, or a loading/redirecting message for managers.
    return isUserManager 
      ? <div className="flex items-center justify-center min-h-screen bg-background"><p>Redirecting to manager dashboard...</p></div>
      : <LoginPage />;
  }

  const handleCrmClick = () => {
    // Only change view if one of the sub-items is not already active
    const crmViews: View[] = ['planning', 'coverage', 'offline', 'submitted', 'summary', 'master', 'marketing'];
    if (!crmViews.includes(activeView)) {
      setActiveView('planning');
    }
  };

  const renderContent = () => {
    switch (activeView) {
      case 'planning':
        return <PlanningCalendar 
                doctors={doctors} 
                plans={plans}
                entries={masterEntries}
                onAddPlan={addPlan} 
                onRemovePlan={removePlan} 
                onLogCall={handleLogPlannedCall}
                nonCallDays={nonCallDays}
                onAddNonCallDay={addNonCallDay}
              />;
      case 'coverage':
        return <CoverageForm 
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
              />;
      case 'offline':
        return <OfflineList 
                entries={offlineEntries} 
                isSyncing={isSyncing} 
                syncAll={syncAllOfflineEntries} 
                isOnline={isOnline}
                onEdit={(entry) => handleEditEntry(entry, true)}
              />;
      case 'submitted':
        return <SubmittedList entries={masterEntries} onDelete={deleteMasterEntry} onEdit={(entry) => handleEditEntry(entry, false)} />;
      case 'marketing':
        return <MarketingList 
                samples={marketingSamples}
                usedQuantities={usedQuantities}
                onAddSamplesBulk={async () => {
                    alert('Only admins can upload a masterlist.');
                    return false;
                }}
                loading={marketingSamplesLoading}
                onRefresh={refetchMarketingSamples}
                readOnly={true}
              />;
      case 'summary':
        return <CallSummary entries={masterEntries} doctors={doctors} nonCallDays={nonCallDays} timeLogs={timeLogs} />;
      case 'master':
        return <MasterList 
                doctors={doctors}
                entries={masterEntries}
                onAddDoctor={addDoctor}
                onAddDoctorsBulk={addDoctorsBulk}
                onUpdateDoctor={updateDoctor} 
                onDeleteDoctor={deleteDoctor} 
                onDeleteDoctorsBulk={deleteDoctorsBulk}/>;
      case 'exams':
        return <Card>
                <CardHeader>
                  <CardTitle>Exams</CardTitle>
                  <CardDescription>This section is under construction.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Check back later for exam features!</p>
                </CardContent>
              </Card>;
      case 'in-field-coaching':
        return <Card>
                <CardHeader>
                  <CardTitle>In-Field Coaching</CardTitle>
                  <CardDescription>This section is under construction.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Check back later for In-Field Coaching features!</p>
                </CardContent>
              </Card>;
      default:
        return null;
    }
  }

  const isCrmActive = [
    'planning', 
    'coverage', 
    'offline', 
    'submitted', 
    'marketing', 
    'summary', 
    'master'
  ].includes(activeView);

  return (
    <SidebarProvider>
      <div className="flex flex-col min-h-screen bg-background text-foreground">
         <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b md:px-6 bg-background/80 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <SidebarTrigger/>
              <h1 className="text-xl font-bold md:text-2xl font-headline text-primary">SFE Offline</h1>
            </div>
            <div className="flex items-center gap-4">
                <Badge variant={isOnline ? "secondary" : "destructive"} className="flex items-center gap-2 px-3 py-1 font-headline">
                    {isSyncing ? <RefreshCw size={14} className="animate-spin" /> : (isOnline ? <Wifi size={14} /> : <WifiOff size={14} />)}
                    <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : (isOnline ? 'Online' : 'Offline')}</span>
                </Badge>
                {timeLogsLoading ? (
                    <Button size="sm" variant="outline" className="font-headline" disabled>
                        <RefreshCw className="mr-2 animate-spin"/> Loading...
                    </Button>
                ) : !todaysTimeIn ? (
                  <Button size="sm" variant="outline" className="font-headline" onClick={() => { setTimeLogMode("time-in"); setIsTimeLogDialogOpen(true); }}>
                      <LogIn className="mr-2"/>
                      Time In
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" className="font-headline" onClick={() => { setTimeLogMode("time-out"); setIsTimeLogDialogOpen(true); }}>
                      <LogOut className="mr-2"/>
                      Time Out
                  </Button>
                )}
            </div>
        </header>

        <div className="flex flex-1">
          <Sidebar>
            <SidebarContent>
              <SidebarMenu>
                <SidebarMenuItem isActive={isCrmActive}>
                  <SidebarMenuButton onClick={handleCrmClick} hasSubmenu>
                    <Notebook />
                    CRM
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton onClick={() => setActiveView('planning')} isActive={activeView === 'planning'}>Call Planning</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton onClick={() => setActiveView('coverage')} isActive={activeView === 'coverage'}>Call Reporting</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                       <SidebarMenuSubItem>
                        <SidebarMenuSubButton onClick={() => setActiveView('offline')} isActive={activeView === 'offline'}>
                          Offline Calls
                          {offlineEntries.length > 0 && <Badge className="ml-auto" variant="destructive">{offlineEntries.length}</Badge>}
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                       <SidebarMenuSubItem>
                        <SidebarMenuSubButton onClick={() => setActiveView('submitted')} isActive={activeView === 'submitted'}>Submitted Coverage</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton onClick={() => setActiveView('summary')} isActive={activeView === 'summary'}>Call Summary</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton onClick={() => setActiveView('master')} isActive={activeView === 'master'}>Doctor Masterlist</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                       <SidebarMenuSubItem>
                        <SidebarMenuSubButton onClick={() => setActiveView('marketing')} isActive={activeView === 'marketing'}>Marketing Samples</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setActiveView('in-field-coaching')} isActive={activeView === 'in-field-coaching'}>
                    <Users />
                    In-Field Coaching
                  </SidebarMenuButton>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setActiveView('exams')} isActive={activeView === 'exams'}>
                    <ClipboardCheck />
                    Exams
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarContent>
            <SidebarFooter>
                <div className="flex items-center gap-2 p-2">
                     <span className="text-sm text-muted-foreground truncate">{user.email}</span>
                </div>
                 {hasAdminAccess && (
                  <Link href="/admin" className="w-full">
                    <Button size="sm" variant="outline" className="w-full font-headline">
                      <ShieldCheck className="mr-2" />
                      {isUserAdmin ? 'Admin' : 'Manager View'}
                    </Button>
                  </Link>
                )}
              <SidebarMenu>
                <SidebarMenuItem>
                   <SidebarMenuButton onClick={logout}>
                    <LogOut />
                    Logout
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          </Sidebar>

          <main className="flex-1 w-full">
            <div className="w-full h-full p-4 md:p-6">
              {renderContent()}
            </div>
          </main>
        </div>
      </div>
      <TimeLogDialog 
        isOpen={isTimeLogDialogOpen}
        onOpenChange={setIsTimeLogDialogOpen}
        mode={timeLogMode}
        onTimeIn={addTimeIn}
        onTimeOut={addTimeOut}
      />
    </SidebarProvider>
  );
}
