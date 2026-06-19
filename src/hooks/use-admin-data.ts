"use client"

import { useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, updateDoc, doc as firestoreDoc, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { getMonthRangeISO, parseAnyDate } from "@/lib/utils";
import { isValid, isWithinInterval, parseISO } from "date-fns";

const ADMIN_SESSION_CACHE: Record<string, any> = {};

/**
 * LOW-COST V7.1: Admin-Resilient Targeted Retrieval.
 * Specifically optimized to prevent payload crashes and ensure specific UIDs are reachable.
 */
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
           ['Admin', 'Manager', 'Marketing', 'HR'].includes(profile?.role || '');
  }, [user, profile]);

  const individualUsedQuantities = useMemo(() => {
    const quantities: Record<string, number> = {};
    (individualEntries || []).forEach(entry => {
        const process = (name?: string, qty?: number) => {
            const safeName = (name ?? "").toLowerCase().trim();
            if (!safeName) return;
            const safeQty = Math.round(Number(qty || 0));
            if (!isNaN(safeQty) && safeQty !== 0) quantities[safeName] = (quantities[safeName] || 0) + safeQty;
        };
        process(entry.primarySampleName, entry.primaryProductQty);
        process(entry.secondarySampleName, entry.secondaryProductQty);
        if (entry.reminderProducts) {
            entry.reminderProducts.forEach(rp => rp?.sampleName && process(rp?.sampleName, rp?.quantity));
        }
    });
    return quantities;
  }, [individualEntries]);

  const fetchTeamApprovals = useCallback(async () => {
    if (!db || !active || !isAuthorized) return;
    
    const cacheKey = 'approvals_list';
    const cached = ADMIN_SESSION_CACHE[cacheKey];
    if (cached && (Date.now() - cached.timestamp < 300000)) {
        setAllNonCallDays(cached.ncds);
        setAllPlanningRequests(cached.reqs);
        return;
    }

    setLoadingApprovals(true);
    try {
        const [ncdSnap, prSnap] = await Promise.all([
            getDocs(query(collection(db!, "nonCallDays"), where("status", "==", "pending"), limit(1000))),
            getDocs(query(collection(db!, "planningRequests"), where("status", "==", "pending"), limit(1000)))
        ]);
        
        const ncds = ncdSnap.docs.map(d => ({id: d.id, ...d.data()})) as NonCallDay[];
        const reqs = prSnap.docs.map(d => ({id: d.id, ...d.data()})) as PlanningPermissionRequest[];

        setAllNonCallDays(ncds);
        setAllPlanningRequests(reqs);
        
        ADMIN_SESSION_CACHE[cacheKey] = { ncds, reqs, timestamp: Date.now() };
    } catch (e) {
        console.warn("Approval fetch failure", e);
    } finally { setLoadingApprovals(false); }
  }, [active, isAuthorized]);

  const fetchUserData = useCallback(async (uid: string, selectedMonth: string, force = false) => {
    if (!uid || !db || !active || !isAuthorized) return;
    
    const { start, end } = getMonthRangeISO(selectedMonth);
    const interval = { start: parseISO(start), end: parseISO(end) };
    const cacheKey = `user_${uid}_${selectedMonth}`;
    const cached = ADMIN_SESSION_CACHE[cacheKey];

    if (!force && cached && (Date.now() - cached.timestamp < 600000)) {
        setIndividualEntries(cached.entries);
        setIndividualPlans(cached.plans);
        setIndividualTimeLogs(cached.logs);
        setIndividualNonCallDays(cached.ncds);
        setIndividualDoctors(cached.doctors);
        setIndividualPlanningRequests(cached.requests);
        return;
    }

    setLoadingIndividual(true);
    try {
        const fetchEntriesResilient = async () => {
            const colRef = collection(db!, "coverageEntries");
            
            // Stage 1: Targeted Monthly Query (Coverage Date)
            try {
                const q1 = query(colRef, where("userId", "==", uid), where("coverageDate", ">=", start), where("coverageDate", "<=", end), limit(2000));
                const snap1 = await getDocs(q1);
                if (snap1.docs.length > 0) return snap1.docs.map(d => ({id: d.id, ...d.data()} as CoverageEntry));
            } catch (e) { console.warn("Admin Stage 1 fail", e); }

            // Stage 2: Legacy Monthly Fallback (Submitted At)
            try {
                const q2 = query(colRef, where("userId", "==", uid), where("submittedAt", ">=", start), where("submittedAt", "<=", end), limit(2000));
                const snap2 = await getDocs(q2);
                if (snap2.docs.length > 0) return snap2.docs.map(d => ({id: d.id, ...d.data()} as CoverageEntry));
            } catch (e) { console.warn("Admin Stage 2 fail", e); }

            // Stage 3: BROAD SCAN (Required for cases like Ian Natinga where reports might be unindexed or date-shifted)
            try {
                const q3 = query(colRef, where("userId", "==", uid), orderBy("submittedAt", "desc"), limit(4000));
                const snap3 = await getDocs(q3);
                return snap3.docs.map(d => ({id: d.id, ...d.data()} as CoverageEntry)).filter(e => {
                    const d = parseAnyDate(e.coverageDate || e.submittedAt);
                    // If filtering by month fails to show data, return the most recent regardless of month filter for diagnostics
                    if (force) return true; 
                    return d && isValid(d) && isWithinInterval(d, interval);
                });
            } catch (e) {
                const q4 = query(colRef, where("userId", "==", uid), limit(5000));
                const snap4 = await getDocs(q4);
                return snap4.docs.map(d => ({id: d.id, ...d.data()} as CoverageEntry));
            }
        };

        const fetchPlansResilient = async () => {
            const colRef = collection(db!, "plans");
            try {
                const q = query(colRef, where("userId", "==", uid), where("plannedDate", ">=", start), where("plannedDate", "<=", end), limit(1000));
                const snap = await getDocs(q);
                return snap.docs.map(d => ({id: d.id, ...d.data()} as Plan));
            } catch (e) {
                const qFallback = query(colRef, where("userId", "==", uid), limit(3000));
                const snap = await getDocs(qFallback);
                return snap.docs.map(d => ({id: d.id, ...d.data()} as Plan));
            }
        };

        const [entries, plans, logs, ncds, doctors, requests] = await Promise.all([
            fetchEntriesResilient(),
            fetchPlansResilient(),
            getDocs(query(collection(db!, "timeLogs"), where("userId", "==", uid), limit(500))).then(s => s.docs.map(d => ({id: d.id, ...d.data()}))),
            getDocs(query(collection(db!, "nonCallDays"), where("userId", "==", uid), limit(500))).then(s => s.docs.map(d => ({id: d.id, ...d.data()}))),
            getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(4000))).then(s => s.docs.map(d => ({id: d.id, ...d.data()}))),
            getDocs(query(collection(db!, "planningRequests"), where("userId", "==", uid), limit(500))).then(s => s.docs.map(d => ({id: d.id, ...d.data()})))
        ]);

        const data = {
            entries: (entries as CoverageEntry[]).sort((a,b) => (b.coverageDate || b.submittedAt || "").localeCompare(a.coverageDate || a.submittedAt || "")),
            plans: (plans as Plan[]).sort((a,b) => (b.plannedDate || "").localeCompare(a.plannedDate || "")),
            logs: logs as any[],
            ncds: ncds as NonCallDay[],
            doctors: doctors as Doctor[],
            requests: requests as PlanningPermissionRequest[],
            timestamp: Date.now()
        };

        setIndividualEntries(data.entries);
        setIndividualPlans(data.plans);
        setIndividualTimeLogs(data.logs);
        setIndividualNonCallDays(data.ncds);
        setIndividualDoctors(data.doctors);
        setIndividualPlanningRequests(data.requests);
        
        ADMIN_SESSION_CACHE[cacheKey] = data;

        if (force) {
            toast({ title: "Deep Sync Complete", description: `Found ${entries.length} reports for UID ${uid.substring(0, 6)}...` });
        }
    } catch (e: any) {
        console.error("Fetch Failure:", e);
        toast({ variant: "destructive", title: "Sync Failed", description: e.message || "Could not retrieve records." });
    } finally { 
        setLoadingIndividual(false); 
    }
  }, [active, isAuthorized, toast]);

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
        delete ADMIN_SESSION_CACHE['approvals_list'];
        toast({ title: `Request ${status}` });
    },
    updatePlanningRequestStatus: async (id: string, status: 'approved' | 'rejected') => {
        await updateDoc(firestoreDoc(db!, 'planningRequests', id), { status });
        setAllPlanningRequests(prev => prev.map(r => r.id === id ? {...r, status} : r));
        delete ADMIN_SESSION_CACHE['approvals_list'];
        toast({ title: `Request ${status}` });
    }
  };
}