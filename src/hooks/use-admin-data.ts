"use client"

import { useEffect, useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, doc, updateDoc, doc as firestoreDoc, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { MANAGER_TEAMS, ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { getMonthRangeISO } from "@/lib/utils";
import { format } from "date-fns";

export function useAdminData(managerId?: string, userProfiles: Record<string, UserProfile> = {}, active: boolean = true) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  
  const [allEntries, setAllEntries] = useState<CoverageEntry[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [allTimeLogs, setAllTimeLogs] = useState<TimeLog[]>([]);
  const [allNonCallDaysIndividual, setAllNonCallDaysIndividual] = useState<NonCallDay[]>([]);
  const [individualPlanningRequests, setIndividualPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  const [individualUsedQuantities, setIndividualUsedQuantities] = useState<Record<string, number>>({});

  const [allNonCallDays, setAllNonCallDays] = useState<NonCallDay[]>([]);
  const [allPlanningRequests, setAllPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [loadingIndividual, setLoadingIndividual] = useState(false);

  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    const email = (user.email ?? "").toLowerCase();
    return ADMIN_UIDS.includes(user.uid) || 
           email === 'mbustamante@hovidinc.com' || 
           email === 'admin@hovidinc.com' ||
           ADMIN_EMAILS.some(e => (e ?? "").toLowerCase() === email) ||
           profile?.role === 'Admin';
  }, [user, profile]);

  const hasFullAdminAccess = useMemo(() => {
    return isUserAdmin || profile?.role === 'Manager' || Object.keys(MANAGER_TEAMS).includes(user?.uid || '');
  }, [isUserAdmin, profile, user]);

  const hasLimitedAdminAccess = useMemo(() => {
    return profile?.role === 'Marketing' || profile?.role === 'HR';
  }, [profile]);

  const isAuthorized = hasFullAdminAccess || hasLimitedAdminAccess;

  const getManagedUserIds = useCallback((mgrId?: string) => {
    if (!mgrId) return [];
    const hardcoded = MANAGER_TEAMS[mgrId] || [];
    const dynamic = Object.entries(userProfiles)
        .filter(([_, p]) => p.managerId === mgrId)
        .map(([uid, _]) => uid);
    return Array.from(new Set([...hardcoded, ...dynamic]));
  }, [userProfiles]);

  const fetchTeamApprovals = useCallback(async () => {
    if (!user || !db || !active || !hasFullAdminAccess) return;
    
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
            if (!filter) {
                return (await getDocs(query(colRef, limit(10000)))).docs.map(d => ({id: d.id, ...d.data()}));
            }
            
            const chunks = [];
            for (let i = 0; i < filter.length; i += 10) chunks.push(filter.slice(i, i+10));
            const results = await Promise.all(chunks.map(c => getDocs(query(colRef, where("userId", "in", c), limit(10000)))));
            return results.flatMap(s => s.docs.map(d => ({id: d.id, ...d.data()})));
        };

        const [ncd, pr] = await Promise.all([fetchCol("nonCallDays", userFilter), fetchCol("planningRequests", userFilter)]);
        
        setAllNonCallDays(ncd as any);
        setAllPlanningRequests(pr as any);
    } catch (e) {
        console.error("Approvals fetch error:", e);
    } finally {
        setLoadingApprovals(false);
    }
  }, [user, managerId, getManagedUserIds, active, hasFullAdminAccess]);

  // [QUERY_ON_DEMAND_LOGIC] - Updated fetchUserData to support targeted monthly loading
  const fetchUserData = useCallback(async (uid: string, month?: string) => {
    if (!uid || !db || !active || !isAuthorized) return;

    setLoadingIndividual(true);
    try {
        const targetMonth = month || format(new Date(), 'yyyy-MM');
        const { start, end } = getMonthRangeISO(targetMonth);
        const mapDocs = (s: any) => s.docs.map((doc: any) => ({id: doc.id, ...doc.data()}));
        
        // Fetch only entries for the specific month to keep dashboard fast
        const eSnap = await getDocs(query(
            collection(db!, "coverageEntries"), 
            where("userId", "==", uid),
            where("coverageDate", ">=", start),
            where("coverageDate", "<=", end),
            limit(1000)
        ));

        // Other metadata remains broader for calendar overview
        const dSnap = await getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(10000)));
        const pSnap = await getDocs(query(collection(db!, "plans"), where("userId", "==", uid), limit(10000)));
        const lSnap = await getDocs(query(collection(db!, "timeLogs"), where("userId", "==", uid), limit(10000)));
        const ncdSnap = await getDocs(query(collection(db!, "nonCallDays"), where("userId", "==", uid), limit(10000)));
        const rSnap = await getDocs(query(collection(db!, "planningRequests"), where("userId", "==", uid), limit(10000)));

        const entries = mapDocs(eSnap) as CoverageEntry[];
        const used: Record<string, number> = {};
        entries.forEach((item) => {
            const process = (n?: string, q?: number) => {
                const key = String(n ?? "").toLowerCase().trim();
                if (key) used[key] = (used[key] || 0) + (Number(q || 0));
            };
            process(item.primarySampleName, item.primaryProductQty);
            process(item.secondarySampleName, item.secondaryProductQty);
            if (item.reminderProducts) {
                item.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
            }
        });

        entries.sort((a, b) => (b.coverageDate || b.submittedAt || '').localeCompare(a.coverageDate || a.submittedAt || ''));

        setAllEntries(entries); 
        setAllDoctors(mapDocs(dSnap) as any); 
        setAllPlans(mapDocs(pSnap) as any);
        setAllTimeLogs(mapDocs(lSnap) as any); 
        setAllNonCallDaysIndividual(mapDocs(ncdSnap) as any);
        setIndividualPlanningRequests(mapDocs(rSnap) as any); 
        setIndividualUsedQuantities(used);
    } catch (e) {
        console.error("Individual data fetch failed:", e);
    } finally {
        setLoadingIndividual(false);
    }
  }, [active, isAuthorized]);

  return { 
    allEntries, allDoctors, allPlans, allTimeLogs, allNonCallDaysIndividual, 
    individualPlanningRequests, individualUsedQuantities, allNonCallDays, allPlanningRequests, 
    loadingIndividual, loadingApprovals,
    fetchUserData, fetchTeamApprovals,
    updateNonCallDayStatus: async (id: string, status: 'approved' | 'rejected') => {
        const ref = firestoreDoc(db!, 'nonCallDays', id);
        await updateDoc(ref, { status });
        setAllNonCallDays(prev => prev.map(d => d.id === id ? {...d, status} : d));
        toast({ title: `Request ${status}` });
    },
    updatePlanningRequestStatus: async (id: string, status: 'approved' | 'rejected') => {
        const ref = firestoreDoc(db!, 'planningRequests', id);
        await updateDoc(ref, { status });
        setAllPlanningRequests(prev => prev.map(r => r.id === id ? {...r, status} : r));
        toast({ title: `Request ${status}` });
    }
  };
}