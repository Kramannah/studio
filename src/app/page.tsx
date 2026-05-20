
'use client';

import { useOfflineSync } from '@/hooks/use-offline-sync';
import { useDoctors } from '@/hooks/use-doctors';
import { usePlans } from '@/hooks/use-plans';
import { useNonCallDays } from '@/hooks/use-non-call-days';
import { useQ4Allocation } from '@/hooks/use-q4-allocation';
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, RefreshCw, LogIn, LogOut, Notebook, LifeBuoy, LayoutDashboard, PackageCheck } from "lucide-react";
import { useEffect, useMemo, useState, useCallback } from "react";
import type { Doctor, Plan, CoverageEntry } from "@/lib/types";
import { isToday, parseISO, isValid, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { LoginPage } from "@/components/login-page";
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS, HELPDESK_EMAIL } from "@/lib/admins";
import Link from "next/link";
import { useTimeLogs } from "@/hooks/use-time-logs";
import { SidebarProvider, Sidebar, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarTrigger, SidebarContent, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PlanningCalendar } from '@/components/planning-calendar';

// Static imports for offline availability
import { CoverageForm } from '@/components/coverage-form';
import { OfflineList } from '@/components/offline-list';
import { MasterList } from '@/components/master-list';
import { CallSummary } from '@/components/call-summary';
import { SubmittedList } from '@/components/submitted-list';
import { Q4AllocationView } from '@/components/q4-allocation-view';
import { TimeLogDialog } from '@/components/time-log-dialog';
import { HelpdeskDialog } from '@/components/helpdesk-dialog';

type View = 'planning' | 'coverage' | 'offline' | 'submitted' | 'summary' | 'master' | 'allocation';

const DynamicSkeleton = () => (
  <div className="space-y-4 w-full">
    <Skeleton className="w-1/3 h-8" />
    <Skeleton className="w-2/3 h-6" />
    <Skeleton className="w-full h-[600px]" />
  </div>
);

export default function Home() {
  const { user, profile, loading: authLoading, logout } = useAuth();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [activeView, setActiveView] = useState<View>('planning');
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    const email = (user.email ?? "").toLowerCase();
    return ADMIN_UIDS.includes(user.uid) || 
           email === 'mbustamante@hovidinc.com' || 
           ADMIN_EMAILS.some(e => (e ?? "").toLowerCase() === email) ||
           profile?.role === 'Admin';
  }, [user, profile]);

  const isUserManager = useMemo(() => {
    if (!user) return false;
    return Object.keys(MANAGER_TEAMS).includes(user.uid) || profile?.role === 'Manager';
  }, [user, profile]);

  const isMarketingOrHR = useMemo(() => {
    return profile?.role === 'Marketing' || profile?.role === 'HR';
  }, [profile]);

  const hasAdminAccess = isUserAdmin || isUserManager || isMarketingOrHR;

  // Date-based fetching for performance
  const { offlineEntries, masterEntries, saveEntry, deleteMasterEntry, isSyncing, syncAllOfflineEntries, isOnline, updateMasterEntry, updateOfflineEntry, loading: entriesLoading, refetch: refetchEntries } = useOfflineSync(user?.uid, activeView === 'offline' || activeView === 'submitted' || activeView === 'summary' || activeView === 'planning' || activeView === 'coverage', selectedMonth);
  
  const { doctors, addDoctor, addDoctorsBulk, updateDoctor, deleteDoctor, deleteDoctorsBulk, loading: doctorsLoading } = useDoctors(activeView === 'planning' || activeView === 'coverage' || activeView === 'master' || activeView === 'submitted' || activeView === 'summary');
  const { plans, planningRequests, addPlan, addPlansBulk, removePlan, requestPlanningPermission, loading: plansLoading, syncAllOfflinePlans, fetchData: refreshPlans } = usePlans(activeView === 'planning' || activeView === 'coverage');
  const { nonCallDays, addNonCallDay, loading: nonCallDaysLoading, fetchNonCallDays } = useNonCallDays(activeView === 'planning' || activeView === 'summary' || activeView === 'submitted');
  const { timeLogs, addTimeIn, addTimeOut, todaysTimeIn, loading: timeLogsLoading, fetchTimeLogs } = useTimeLogs(activeView === 'summary' || activeView === 'planning' || activeView === 'coverage');
  const { allocations, usedQuantities: globalUsedQuantities, loading: allocationLoading } = useQ4Allocation(activeView === 'coverage' || activeView === 'allocation', true);
  
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
              fetchNonCallDays(),
              refetchEntries()
          ]);
          toast({ title: "Sync Finished", description: "All records updated." });
      } catch (e) {
          toast({ variant: "destructive", title: "Sync Error", description: "Connection issue detected." });
      } finally {
          setIsManualSyncing(false);
      }
  }, [syncAllOfflineEntries, syncAllOfflinePlans, refreshPlans, fetchTimeLogs, fetchNonCallDays, refetchEntries, toast]);

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

  const mergedUsedQuantities = useMemo(() => {
    const quantities = { ...globalUsedQuantities };
    offlineEntries.forEach(entry => {
        const process = (name?: string, qty?: number) => {
            const safeName = (name ?? "").toLowerCase().trim();
            if (!safeName) return;
            const safeQty = Math.round(Number(qty || 0));
            if (!isNaN(safeQty) && safeQty !== 0) {
                quantities[safeName] = (quantities[safeName] || 0) + safeQty;
            }
        };
        process(entry.primarySampleName, entry.primaryProductQty);
        process(entry.secondarySampleName, entry.secondaryProductQty);
    });
    return quantities;
  }, [globalUsedQuantities, offlineEntries]);

  const todaysPlans = useMemo(() => {
    if (!mounted) return [];
    return plans.filter(p => {
        const plannedDate = typeof p.plannedDate === 'string' ? parseISO(p.plannedDate) : p.plannedDate;
        return isValid(plannedDate) && isToday(plannedDate);
    });
  },[plans, mounted]);
  
  if (!mounted || authLoading) return (
    <div className="flex items-center justify-center min-h-screen bg-background">
        <RefreshCw className="w-12 h-12 animate-spin text-primary" />
    </div>
  );
  
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
      case 'planning': return (
        <PlanningCalendar 
          doctors={doctors} 
          plans={plans} 
          planningRequests={planningRequests} 
          onRequestUnlock={requestPlanningPermission} 
          entries={masterEntries} 
          offlineEntries={offlineEntries} 
          onAddPlan={addPlan} 
          onAddPlansBulk={addPlansBulk}
          onRemovePlan={removePlan} 
          onLogCall={handleLogPlannedCall} 
          nonCallDays={nonCallDays} 
          onAddNonCallDay={addNonCallDay} 
        />
      );
      case 'coverage': return <CoverageForm onSave={saveEntry} onUpdate={entryToEdit?.isOffline ? updateOfflineEntry : updateMasterEntry} isOnline={isOnline} doctors={doctors} allocations={allocations} masterEntries={masterEntries} initialDoctor={doctorToLog} onFormSubmit={handleFormSubmit} todaysPlans={todaysPlans} offlineEntries={offlineEntries} entryToEdit={entryToEdit} initialDate={plannedDateToLog} usedQuantities={mergedUsedQuantities} />;
      case 'offline': return <OfflineList entries={offlineEntries} isSyncing={isSyncing} syncAll={syncAllOfflineEntries} isOnline={isOnline} onEdit={(entry) => handleEditEntry(entry, true)} />;
      case 'submitted': return <SubmittedList entries={masterEntries} doctors={doctors} nonCallDays={nonCallDays} onDelete={deleteMasterEntry} onEdit={(entry) => handleEditEntry(entry, false)} externalSelectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />;
      case 'summary': return <CallSummary entries={masterEntries} doctors={doctors} nonCallDays={nonCallDays} timeLogs={timeLogs} externalSelectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />;
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
                      <SidebarMenuSubItem><SidebarMenuSubButton onClick={() => setActiveView('allocation')} isActive={activeView === 'allocation'}>Marketing Samples</SidebarMenuSubButton></SidebarMenuSubItem>
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
                    <div className="space-y-2 mb-2">
                        <Link href="/admin" className="w-full block">
                            <Button size="sm" variant="outline" className="w-full font-headline border-2 h-10">
                                <LayoutDashboard className="mr-2 h-4 w-4 text-primary" />
                                {isUserAdmin ? 'Admin Dashboard' : isMarketingOrHR ? `${profile?.role} Dashboard` : 'Manager Dashboard'}
                            </Button>
                        </Link>
                        <Link href="/admin/inventory" className="w-full block">
                            <Button size="sm" variant="outline" className="w-full font-headline border-2 h-10 border-primary/30 text-primary">
                                <PackageCheck className="mr-2 h-4 w-4" />
                                Marketing Samples List
                            </Button>
                        </Link>
                    </div>
                 )}
                 <Button variant="destructive" size="lg" onClick={logout} className="w-full font-headline">
                    <LogOut className="mr-2 h-5 w-5" /> Log Out
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
