'use client';

import { useOfflineSync } from '@/hooks/use-offline-sync';
import { useDoctors } from '@/hooks/use-doctors';
import { usePlans } from '@/hooks/use-plans';
import { useNonCallDays } from '@/hooks/use-non-call-days';
import { useQ4Allocation } from '@/hooks/use-q4-allocation';
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, RefreshCw, LogIn, LogOut, Notebook, LifeBuoy, LayoutDashboard } from "lucide-react";
import { useEffect, useMemo, useState, useCallback } from "react";
import type { Doctor, Plan, CoverageEntry } from "@/lib/types";
import { isToday, parseISO, isValid } from "date-fns";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { LoginPage } from "@/components/login-page";
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS, HELPDESK_EMAIL } from "@/lib/admins";
import Link from "next/link";
import { useTimeLogs } from "@/hooks/use-time-logs";
import { SidebarProvider, Sidebar, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarTrigger, SidebarContent, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const DynamicSkeleton = () => (
  <div className="space-y-4 w-full">
    <Skeleton className="w-1/3 h-8" />
    <Skeleton className="w-2/3 h-6" />
    <Skeleton className="w-full h-[600px]" />
  </div>
);

const CoverageForm = dynamic(() => import('@/components/coverage-form').then(mod => mod.CoverageForm), { loading: () => <DynamicSkeleton /> });
const OfflineList = dynamic(() => import('@/components/offline-list').then(mod => mod.OfflineList), { loading: () => <DynamicSkeleton /> });
const MasterList = dynamic(() => import('@/components/master-list').then(mod => mod.MasterList), { loading: () => <DynamicSkeleton /> });
const CallSummary = dynamic(() => import('@/components/call-summary').then(mod => mod.CallSummary), { loading: () => <DynamicSkeleton /> });
const PlanningCalendar = dynamic(() => import('@/components/planning-calendar').then(mod => mod.PlanningCalendar), { loading: () => <DynamicSkeleton /> });
const SubmittedList = dynamic(() => import('@/components/submitted-list').then(mod => mod.SubmittedList), { loading: () => <DynamicSkeleton /> });
const Q4AllocationView = dynamic(() => import('@/components/q4-allocation-view').then(mod => mod.Q4AllocationView), { loading: () => <DynamicSkeleton /> });
const TimeLogDialog = dynamic(() => import('@/components/time-log-dialog').then(mod => mod.TimeLogDialog), { ssr: false });
const HelpdeskDialog = dynamic(() => import('@/components/helpdesk-dialog').then(mod => mod.HelpdeskDialog), { ssr: false });

type View = 'planning' | 'coverage' | 'offline' | 'submitted' | 'summary' | 'master' | 'allocation';

export default function Home() {
  const { user, loading: authLoading, logout } = useAuth();
  const { toast } = useToast();
  
  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    const normalizedEmail = user.email?.toLowerCase() || '';
    return ADMIN_UIDS.includes(user.uid) || normalizedEmail === 'mbustamante@hovidinc.com' || ADMIN_EMAILS.some(e => e.toLowerCase() === normalizedEmail);
  }, [user]);

  const isUserManager = useMemo(() => user && Object.keys(MANAGER_TEAMS).includes(user.uid), [user]);
  const hasAdminAccess = isUserAdmin || isUserManager;

  const { offlineEntries, masterEntries, saveEntry, deleteMasterEntry, isSyncing, syncAllOfflineEntries, isOnline, updateMasterEntry, updateOfflineEntry, loading: entriesLoading } = useOfflineSync(user?.uid);
  const { doctors, addDoctor, addDoctorsBulk, updateDoctor, deleteDoctor, deleteDoctorsBulk, loading: doctorsLoading } = useDoctors();
  const { plans, planningRequests, addPlan, removePlan, requestPlanningPermission, loading: plansLoading, syncAllOfflinePlans, fetchData: refreshPlans } = usePlans();
  const { nonCallDays, addNonCallDay, loading: nonCallDaysLoading, fetchNonCallDays } = useNonCallDays();
  const { timeLogs, addTimeIn, addTimeOut, todaysTimeIn, loading: timeLogsLoading, fetchTimeLogs } = useTimeLogs();
  const { allocations, usedQuantities: globalUsedQuantities, loading: allocationLoading } = useQ4Allocation();
  
  const [activeView, setActiveView] = useState<View>('planning');
  const [doctorToLog, setDoctorToLog] = useState<Doctor | null>(null);
  const [entryToEdit, setEntryToEdit] = useState<CoverageEntry | null>(null);
  const [plannedDateToLog, setPlannedDateToLog] = useState<Date | null>(null);
  const [isTimeLogDialogOpen, setIsTimeLogDialogOpen] = useState(false);
  const [isHelpdeskOpen, setIsHelpdeskOpen] = useState(false);
  const [timeLogMode, setTimeLogMode] = useState<"time-in" | "time-out">("time-in");
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  useEffect(() => {
    if (isOnline && syncAllOfflinePlans) syncAllOfflinePlans();
  }, [isOnline, syncAllOfflinePlans]);

  const handleManualSync = useCallback(async () => {
      setIsManualSyncing(true);
      try {
          await Promise.all([
              syncAllOfflineEntries(),
              syncAllOfflinePlans ? syncAllOfflinePlans() : Promise.resolve(),
              refreshPlans(),
              fetchTimeLogs(),
              fetchNonCallDays()
          ]);
          toast({
              title: "Sync Finished",
              description: "All pending data uploaded and server records refreshed.",
          });
      } catch (e) {
          console.error("Manual sync failed", e);
          toast({
              variant: "destructive",
              title: "Sync Error",
              description: "There was a problem refreshing your data. Please check your connection.",
          });
      } finally {
          setIsManualSyncing(false);
      }
  }, [syncAllOfflineEntries, syncAllOfflinePlans, refreshPlans, fetchTimeLogs, fetchNonCallDays, toast]);

  const handleLogPlannedCall = useCallback((doctor: Doctor, plannedDate: Date) => {
    setDoctorToLog(doctor);
    setPlannedDateToLog(plannedDate);
    setEntryToEdit(null);
    setActiveView('coverage');
  }, []);

  const handleEditEntry = useCallback((entry: CoverageEntry, isOffline: boolean = false) => {
    setEntryToEdit({ ...entry, isOffline });
    setDoctorToLog(null);
    setPlannedDateToLog(null);
    setActiveView('coverage');
  }, []);

  const handleFormSubmit = useCallback(async (savedOnline: boolean) => {
    setDoctorToLog(null);
    setPlannedDateToLog(null);
    setEntryToEdit(null);
    setActiveView(savedOnline ? 'submitted' : 'offline');
  }, []);

  // Compute live used quantities including global server data and local offline reports
  const mergedUsedQuantities = useMemo(() => {
    const quantities = { ...globalUsedQuantities };
    
    offlineEntries.forEach(entry => {
        if (entry.primarySampleName && entry.primaryProductQty) {
            const qty = Math.round(Number(entry.primaryProductQty));
            quantities[entry.primarySampleName] = (quantities[entry.primarySampleName] || 0) + qty;
        }
        if (entry.secondarySampleName && entry.secondaryProductQty) {
            const qty = Math.round(Number(entry.secondaryProductQty));
            quantities[entry.secondarySampleName] = (quantities[entry.secondarySampleName] || 0) + qty;
        }
        entry.reminderProducts?.forEach(prod => {
            if (prod.sampleName && prod.quantity) {
                const qty = Math.round(Number(prod.quantity));
                quantities[prod.sampleName] = (quantities[prod.sampleName] || 0) + qty;
            }
        });
    });
    return quantities;
  }, [globalUsedQuantities, offlineEntries]);

  const todaysPlans = useMemo(() => {
    return plans.filter(p => {
        const plannedDate = typeof p.plannedDate === 'string' ? parseISO(p.plannedDate) : p.plannedDate;
        return isValid(plannedDate) && isToday(plannedDate);
    });
  },[plans]);
  
  if (authLoading) return <div className="flex items-center justify-center min-h-screen bg-background"><RefreshCw className="w-12 h-12 animate-spin text-primary" /></div>;
  if (!user) return <LoginPage />;

  const handleCrmClick = () => {
    const crmViews: View[] = ['planning', 'coverage', 'offline', 'submitted', 'summary', 'master', 'allocation'];
    if (!crmViews.includes(activeView)) setActiveView('planning');
  };
  
  const anyLoading = entriesLoading || doctorsLoading || plansLoading || nonCallDaysLoading || allocationLoading;

  const renderContent = () => {
    const isContentLoading = (anyLoading || (activeView === 'summary' && timeLogsLoading)) && activeView !== 'coverage' && activeView !== 'master' && activeView !== 'allocation';
    if (isContentLoading) return <DynamicSkeleton />;

    switch (activeView) {
      case 'planning': return <PlanningCalendar doctors={doctors} plans={plans} planningRequests={planningRequests} onRequestUnlock={requestPlanningPermission} entries={masterEntries} offlineEntries={offlineEntries} onAddPlan={addPlan} onRemovePlan={removePlan} onLogCall={handleLogPlannedCall} nonCallDays={nonCallDays} onAddNonCallDay={addNonCallDay} />;
      case 'coverage': return <CoverageForm onSave={saveEntry} onUpdate={entryToEdit?.isOffline ? updateOfflineEntry : updateMasterEntry} onAddPlan={addPlan} isOnline={isOnline} doctors={doctors} allocations={allocations} masterEntries={masterEntries} initialDoctor={doctorToLog} onFormSubmit={handleFormSubmit} todaysPlans={todaysPlans} offlineEntries={offlineEntries} entryToEdit={entryToEdit} initialDate={plannedDateToLog} usedQuantities={mergedUsedQuantities} />;
      case 'offline': return <OfflineList entries={offlineEntries} isSyncing={isSyncing} syncAll={syncAllOfflineEntries} isOnline={isOnline} onEdit={(entry) => handleEditEntry(entry, true)} />;
      case 'submitted': return <SubmittedList entries={masterEntries} doctors={doctors} onDelete={deleteMasterEntry} onEdit={(entry) => handleEditEntry(entry, false)} />;
      case 'summary': return <CallSummary entries={masterEntries} doctors={doctors} nonCallDays={nonCallDays} timeLogs={timeLogs} />;
      case 'master': return <MasterList doctors={doctors} entries={masterEntries} onAddDoctor={addDoctor} onAddDoctorsBulk={addDoctorsBulk} onUpdateDoctor={updateDoctor} onDeleteDoctor={deleteDoctor} onDeleteDoctorsBulk={deleteDoctorsBulk} readOnly={false} />;
      case 'allocation': return <Q4AllocationView readOnly={true} />;
      default: return null;
    }
  }

  return (
    <SidebarProvider>
      <div className="flex flex-col min-h-screen bg-background text-foreground w-full">
         <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 border-b md:px-6 bg-background/80 backdrop-blur-sm w-full">
            <div className="flex items-center gap-4">
              <SidebarTrigger/>
              <h1 className="text-xl font-bold md:text-2xl font-headline text-primary">SFE Offline</h1>
            </div>
            <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={handleManualSync} disabled={isManualSyncing || !isOnline} className="font-headline hidden sm:flex">
                    <RefreshCw className={cn("mr-2", isManualSyncing && "animate-spin")} />
                    {isManualSyncing ? 'Syncing...' : 'Sync All'}
                </Button>
                <Badge variant={isOnline ? "secondary" : "destructive"} className="flex items-center gap-2 px-3 py-1 font-headline">
                    {isSyncing ? <RefreshCw size={14} className="animate-spin" /> : (isOnline ? <Wifi size={14} /> : <WifiOff size={14} />)}
                    <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : (isOnline ? 'Online' : 'Offline')}</span>
                </Badge>
                {timeLogsLoading ? (
                    <Button size="sm" variant="outline" className="font-headline" disabled><RefreshCw className="mr-2 animate-spin"/> Loading...</Button>
                ) : !todaysTimeIn ? (
                  <Button size="sm" variant="outline" className="font-headline" onClick={() => { setTimeLogMode("time-in"); setIsTimeLogDialogOpen(true); }}><LogIn className="mr-2"/>Time In</Button>
                ) : (
                  <Button size="sm" variant="destructive" className="font-headline" onClick={() => { setTimeLogMode("time-out"); setIsTimeLogDialogOpen(true); }}><LogOut className="mr-2"/>Time Out</Button>
                )}
            </div>
        </header>

        <div className="flex flex-1 w-full">
          <Sidebar>
            <SidebarContent>
              <SidebarMenu>
                <SidebarMenuItem isActive={true}>
                  <SidebarMenuButton onClick={handleCrmClick} hasSubmenu><Notebook />CRM</SidebarMenuButton>
                  <SidebarMenuSub>
                      <SidebarMenuSubItem><SidebarMenuSubButton onClick={() => setActiveView('planning')} isActive={activeView === 'planning'}>Call Planning</SidebarMenuSubButton></SidebarMenuSubItem>
                      <SidebarMenuSubItem><SidebarMenuSubButton onClick={() => setActiveView('coverage')} isActive={activeView === 'coverage'}>Call Reporting</SidebarMenuSubButton></SidebarMenuSubItem>
                       <SidebarMenuSubItem>
                        <SidebarMenuSubButton onClick={() => setActiveView('offline')} isActive={activeView === 'offline'}>
                          Offline Calls
                          {offlineEntries.length > 0 && <Badge className="ml-auto" variant="destructive">{offlineEntries.length}</Badge>}
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                       <SidebarMenuSubItem><SidebarMenuSubButton onClick={() => setActiveView('submitted')} isActive={activeView === 'submitted'}>Submitted Coverage</SidebarMenuSubButton></SidebarMenuSubItem>
                      <SidebarMenuSubItem><SidebarMenuSubButton onClick={() => setActiveView('summary')} isActive={activeView === 'summary'}>Call Summary</SidebarMenuSubButton></SidebarMenuSubItem>
                      <SidebarMenuSubItem><SidebarMenuSubButton onClick={() => setActiveView('master')} isActive={activeView === 'master'}>Doctor Masterlist</SidebarMenuSubButton></SidebarMenuSubItem>
                  </SidebarMenuSub>
                </SidebarMenuItem>
                 <SidebarMenuItem><SidebarMenuButton onClick={() => setIsHelpdeskOpen(true)}><LifeBuoy />Helpdesk</SidebarMenuButton></SidebarMenuItem>
              </SidebarMenu>
            </SidebarContent>
            <SidebarFooter className="p-4 border-t bg-muted/20">
                 <div className="px-3 py-2 bg-background rounded-lg border shadow-sm mb-2">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-0.5 leading-none">Logged in as</p>
                    <p className="text-xs font-bold truncate text-primary leading-tight">{user?.email}</p>
                 </div>
                 {hasAdminAccess && (
                    <Link href="/admin" className="w-full mb-2 block">
                        <Button size="sm" variant="outline" className="w-full font-headline border-2 h-10">
                            <LayoutDashboard className="mr-2 h-4 w-4 text-primary" />
                            {isUserAdmin ? 'Admin Dashboard' : 'Manager Dashboard'}
                        </Button>
                    </Link>
                 )}
                 <Button 
                    variant="destructive" 
                    size="lg" 
                    onClick={logout} 
                    className="w-full font-headline shadow-lg hover:shadow-destructive/20 transition-all active:scale-95"
                 >
                    <LogOut className="mr-2 h-5 w-5" />
                    Log Out
                </Button>
            </SidebarFooter>
          </Sidebar>
          <main className="flex-1 w-full overflow-x-hidden">
            <div className="w-full h-full p-4 md:p-6 lg:p-8">{renderContent()}</div>
          </main>
        </div>
      </div>
      <TimeLogDialog isOpen={isTimeLogDialogOpen} onOpenChange={setIsTimeLogDialogOpen} mode={timeLogMode} onTimeIn={addTimeIn} onTimeOut={addTimeOut} />
      <HelpdeskDialog isOpen={isHelpdeskOpen} onOpenChange={setIsHelpdeskOpen} adminEmail={HELPDESK_EMAIL} userEmail={user?.email || ''} />
    </SidebarProvider>
  );
}
