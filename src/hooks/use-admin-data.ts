
"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { collection, getDocs, query, where, doc, updateDoc, doc as firestoreDoc, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { MANAGER_TEAMS, ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { format, parseISO, isValid, isWithinInterval } from "date-fns";
import { getMonthRangeISO } from "@/lib/utils";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export function useAdminData(managerId?: string, userProfiles: Record<string, UserProfile> = {}, active: boolean = true) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  
  // Storage for all fetched data for the selected user (the "Fetch Once" bucket)
  const [rawData, setRawData] = useState<{
      entries: CoverageEntry[];
      doctors: Doctor[];
      plans: Plan[];
      logs: TimeLog[];
      ncds: NonCallDay[];
  }>({ entries: [], doctors: [], plans: [], logs: [], ncds: [] });

  const [allNonCallDays, setAllNonCallDays] = useState<NonCallDay[]>([]);
  const [allPlanningRequests, setAllPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [loadingIndividual, setLoadingIndividual] = useState(false);

  const lastFetchedUserRef = useRef<string | null>(null);
  const [currentSelectedMonth, setCurrentSelectedMonth] = useState<string>('');

  // Derived filtered data based on current month (the "Filter Locally" logic)
  const monthlyData = useMemo(() => {
    if (!currentSelectedMonth) return rawData;
    const { start, end } = getMonthRangeISO(currentSelectedMonth);
    const interval = { start: parseISO(start), end: parseISO(end) };

    const filterByDate = (list: any[], dateKey: string) => list.filter(item => {
        const dStr = item[dateKey] || item.submittedAt || item.timeIn || item.date;
        if (!dStr) return false;
        const d = parseISO(dStr);
        return isValid(d) && isWithinInterval(d, interval);
    });

    return {
        entries: filterByDate(rawData.entries, 'coverageDate'),
        doctors: rawData.doctors,
        plans: filterByDate(rawData.plans, 'plannedDate'),
        logs: filterByDate(rawData.logs, 'timeIn'),
        ncds: filterByDate(rawData.ncds, 'date')
    };
  }, [rawData, currentSelectedMonth]);

  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    const email = (user.email ?? "").toLowerCase();
    return ADMIN_UIDS.includes(user.uid) || 
           email === 'mbustamante@hovidinc.com' || 
           ADMIN_EMAILS.some(e => (e ?? "").toLowerCase() === email) ||
           profile?.role === 'Admin';
  }, [user, profile]);

  const isAuthorized = isUserAdmin || profile?.role === 'Manager' || Object.keys(MANAGER_TEAMS).includes(user?.uid || '') || profile?.role === 'Marketing' || profile?.role === 'HR';

  const getManagedUserIds = useCallback((mgrId?: string) => {
    if (!mgrId) return [];
    const hardcoded = MANAGER_TEAMS[mgrId] || [];
    const dynamic = Object.entries(userProfiles)
        .filter(([_, p]) => p.managerId === mgrId)
        .map(([uid, _]) => uid);
    return Array.from(new Set([...hardcoded, ...dynamic]));
  }, [userProfiles]);

  const fetchTeamApprovals = useCallback(async () => {
    if (!user || !db || !active || !isAuthorized) return;
    setLoadingApprovals(true);
    try {
        let userFilter: string[] | null = null;
        if (managerId) {
            userFilter = getManagedUserIds(managerId);
            if (userFilter.length === 0) {
                setLoadingApprovals(false);
                return;
            }
        }
        const fetchCol = async (name: string, filter: string[] | null) => {
            const colRef = collection(db!, name);
            if (!filter) return (await getDocs(query(colRef, limit(500)))).docs.map(d => ({id: d.id, ...d.data()}));
            const chunks = [];
            for (let i = 0; i < filter.length; i += 10) chunks.push(filter.slice(i, i+10));
            const results = await Promise.all(chunks.map(c => getDocs(query(colRef, where("userId", "in", c), limit(500)))));
            return results.flatMap(s => s.docs.map(d => ({id: d.id, ...d.data()})));
        };
        const [ncd, pr] = await Promise.all([fetchCol("nonCallDays", userFilter), fetchCol("planningRequests", userFilter)]);
        setAllNonCallDays(ncd as any);
        setAllPlanningRequests(pr as any);
    } catch (e) {} finally { setLoadingApprovals(false); }
  }, [user, managerId, getManagedUserIds, active, isAuthorized]);

  const fetchUserData = useCallback(async (uid: string, monthStr?: string, force = false) => {
    if (!uid || !db || !active || !isAuthorized) {
        setLoadingIndividual(false);
        return;
    }

    setCurrentSelectedMonth(monthStr || format(new Date(), 'yyyy-MM'));

    // If we already have the user's base data and aren't forcing, just switch the month filter
    if (!force && lastFetchedUserRef.current === uid && rawData.entries.length > 0) {
        setLoadingIndividual(false);
        return;
    }

    setLoadingIndividual(true);
    try {
        const mapDocs = (s: any) => s.docs.map((doc: any) => ({id: doc.id, ...doc.data()}));
        
        const [eSnap, pSnap, lSnap, ncdSnap, dSnap] = await Promise.all([
            getDocs(query(collection(db!, "coverageEntries"), where("userId", "==", uid), limit(2000))),
            getDocs(query(collection(db!, "plans"), where("userId", "==", uid), limit(2000))),
            getDocs(query(collection(db!, "timeLogs"), where("userId", "==", uid), limit(1000))),
            getDocs(query(collection(db!, "nonCallDays"), where("userId", "==", uid), limit(1000))),
            getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(1000)))
        ]);
        
        const entries = mapDocs(eSnap) as CoverageEntry[];
        const plans = mapDocs(pSnap) as Plan[];
        const logs = mapDocs(lSnap) as TimeLog[];
        const ncds = mapDocs(ncdSnap) as NonCallDay[];
        const doctors = mapDocs(dSnap) as Doctor[];

        setRawData({ entries, plans, logs, ncds, doctors });
        lastFetchedUserRef.current = uid;
    } catch (e: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'user-data-batch',
            operation: 'list',
        } satisfies SecurityRuleContext));
    } finally {
        setLoadingIndividual(false);
    }
  }, [active, isAuthorized, rawData.entries.length]);

  const usedQuantities = useMemo(() => {
    const used: Record<string, number> = {};
    monthlyData.entries.forEach((item) => {
        const process = (n?: string, q?: number) => {
            const key = String(n ?? "").toLowerCase().trim();
            if (key) used[key] = (used[key] || 0) + (Number(q || 0));
        };
        process(item.primarySampleName, item.primaryProductQty);
        process(item.secondarySampleName, item.secondaryProductQty);
        if (item.reminderProducts) item.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
    });
    return used;
  }, [monthlyData.entries]);

  return { 
    allEntries: monthlyData.entries, 
    allDoctors: monthlyData.doctors, 
    allPlans: monthlyData.plans, 
    allTimeLogs: monthlyData.logs, 
    allNonCallDaysIndividual: monthlyData.ncds, 
    individualPlanningRequests: [],
    individualUsedQuantities: usedQuantities, 
    individualAvailableMonths: [],
    allNonCallDays, 
    allPlanningRequests, 
    loadingIndividual, 
    loadingApprovals,
    fetchUserData, 
    fetchTeamApprovals,
    updateNonCallDayStatus: async (id: string, status: 'approved' | 'rejected') => {
        await updateDoc(firestoreDoc(db!, 'nonCallDays', id), { status });
        setAllNonCallDays(prev => prev.map(d => d.id === id ? {...d, status} : d));
        toast({ title: `Request ${status}` });
    },
    updatePlanningRequestStatus: async (id: string, status: 'approved' | 'rejected') => {
        await updateDoc(firestoreDoc(db!, 'planningRequests', id), { status });
        setAllPlanningRequests(prev => prev.map(r => r.id === id ? {...r, status} : r));
        toast({ title: `Request ${status}` });
    }
  };
}
