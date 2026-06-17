
"use client"

import { useState, useCallback, useMemo, useRef } from "react";
import { collection, getDocs, query, where, updateDoc, doc as firestoreDoc, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { MANAGER_TEAMS, ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { getMonthRangeISO } from "@/lib/utils";

export function useAdminData(managerId?: string, userProfiles: Record<string, UserProfile> = {}, active: boolean = true) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  
  const [individualEntries, setIndividualEntries] = useState<CoverageEntry[]>([]);
  const [individualDoctors, setIndividualDoctors] = useState<Doctor[]>([]);
  const [individualPlans, setIndividualPlans] = useState<Plan[]>([]);
  const [individualTimeLogs, setIndividualTimeLogs] = useState<any[]>([]);
  const [individualNonCallDays, setIndividualNonCallDays] = useState<NonCallDay[]>([]);
  const [individualPlanningRequests, setIndividualPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  
  const [allNonCallDays, setAllNonCallDays] = useState<NonCallDay[]>([]);
  const [allPlanningRequests, setAllPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [loadingIndividual, setLoadingIndividual] = useState(false);

  const isAuthorized = useMemo(() => {
    if (!user) return false;
    const email = (user.email ?? "").toLowerCase();
    return ADMIN_UIDS.includes(user.uid) || 
           email === 'mbustamante@hovidinc.com' || 
           ADMIN_EMAILS.some(e => (e ?? "").toLowerCase() === email) ||
           profile?.role === 'Admin' || profile?.role === 'Manager' || profile?.role === 'Marketing' || profile?.role === 'HR';
  }, [user, profile]);

  const getManagedUserIds = useCallback((mgrId?: string) => {
    if (!mgrId) return [];
    const hardcoded = MANAGER_TEAMS[mgrId] || [];
    const dynamic = Object.entries(userProfiles)
        .filter(([_, p]) => p.managerId === mgrId)
        .map(([uid, _]) => uid);
    return Array.from(new Set([...hardcoded, ...dynamic]));
  }, [userProfiles]);

  const individualUsedQuantities = useMemo(() => {
    const quantities: Record<string, number> = {};
    individualEntries.forEach(entry => {
        const process = (name?: string, qty?: number) => {
            const safeName = (name ?? "").toLowerCase().trim();
            if (!safeName) return;
            const safeQty = Math.round(Number(qty || 0));
            if (!isNaN(safeQty) && safeQty !== 0) quantities[safeName] = (quantities[safeName] || 0) + safeQty;
        };
        process(entry.primarySampleName, entry.primaryProductQty);
        process(entry.secondarySampleName, entry.secondaryProductQty);
        if (entry.reminderProducts) {
            entry.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
        }
    });
    return quantities;
  }, [individualEntries]);

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
            if (!filter) {
                const snap = await getDocs(query(colRef, limit(1000)));
                return snap.docs.map(d => ({id: d.id, ...d.data()}));
            }
            const chunks = [];
            for (let i = 0; i < filter.length; i += 30) {
                chunks.push(filter.slice(i, i + 30));
            }
            
            const results: any[] = [];
            for (const chunk of chunks) {
                const snap = await getDocs(query(colRef, where("userId", "in", chunk), limit(1000)));
                results.push(...snap.docs.map(d => ({id: d.id, ...d.data()})));
            }
            return results;
        };

        const [ncd, pr] = await Promise.all([
            fetchCol("nonCallDays", userFilter),
            fetchCol("planningRequests", userFilter)
        ]);
        setAllNonCallDays(ncd as any);
        setAllPlanningRequests(pr as any);
    } catch (e) {
        console.warn("Approval fetch error", e);
    } finally { setLoadingApprovals(false); }
  }, [user, managerId, getManagedUserIds, active, isAuthorized]);

  const fetchUserData = useCallback(async (uid: string, selectedMonth?: string) => {
    if (!uid || !db || !active || !isAuthorized) return;
    setLoadingIndividual(true);
    
    try {
        const { start, end } = getMonthRangeISO(selectedMonth);

        // Fetch doctors and plans (plotted calls) globally for the user first to ensure calendar is populated
        // Coverage and Logs are filtered by month for "Low Cost"
        const [entries, plans, logs, ncds, doctors, requests] = await Promise.all([
            getDocs(query(
                collection(db!, "coverageEntries"), 
                where("userId", "==", uid), 
                where("coverageDate", ">=", start),
                where("coverageDate", "<=", end),
                limit(1000)
            )).catch(() => getDocs(query(collection(db!, "coverageEntries"), where("userId", "==", uid), limit(1000)))), // Fallback for indices
            getDocs(query(
                collection(db!, "plans"), 
                where("userId", "==", uid),
                where("plannedDate", ">=", start),
                where("plannedDate", "<=", end),
                limit(1000)
            )).catch(() => getDocs(query(collection(db!, "plans"), where("userId", "==", uid), limit(1000)))),
            getDocs(query(collection(db!, "timeLogs"), where("userId", "==", uid), limit(500))),
            getDocs(query(collection(db!, "nonCallDays"), where("userId", "==", uid), limit(500))),
            getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(2000))),
            getDocs(query(collection(db!, "planningRequests"), where("userId", "==", uid), limit(100)))
        ]);

        setIndividualEntries(entries.docs.map(d => ({id: d.id, ...d.data()})) as CoverageEntry[]);
        setIndividualPlans(plans.docs.map(d => ({id: d.id, ...d.data()})) as Plan[]);
        setIndividualTimeLogs(logs.docs.map(d => ({id: d.id, ...d.data()})));
        setIndividualNonCallDays(ncds.docs.map(d => ({id: d.id, ...d.data()})) as NonCallDay[]);
        setIndividualDoctors(doctors.docs.map(d => ({id: d.id, ...d.data()})) as Doctor[]);
        setIndividualPlanningRequests(requests.docs.map(d => ({id: d.id, ...d.data()})) as PlanningPermissionRequest[]);
    } catch (e) {
        console.warn("User data fetch error", e);
    } finally { setLoadingIndividual(false); }
  }, [active, isAuthorized]);

  return { 
    allEntries: individualEntries, 
    allDoctors: individualDoctors, 
    allPlans: individualPlans, 
    allTimeLogs: individualTimeLogs, 
    allNonCallDaysIndividual: individualNonCallDays,
    individualPlanningRequests,
    individualUsedQuantities,
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
