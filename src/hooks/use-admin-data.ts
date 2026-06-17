
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

// LOW-COST V2: Singleton cache to prevent redundant reads for the same user+month
const ADMIN_SESSION_CACHE: Record<string, any> = {};

/**
 * useAdminData - Optimized for UID-based individual oversight.
 * LOW-COST V2: Performs server-side date range queries to minimize billed reads.
 * V2.1: Increased fallback limits to 5,000 to handle high-volume veteran accounts.
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
            entry.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
        }
    });
    return quantities;
  }, [individualEntries]);

  const fetchTeamApprovals = useCallback(async () => {
    if (!db || !active || !isAuthorized) return;
    
    // Low-cost: Cache approvals for 5 minutes
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
            getDocs(query(collection(db!, "nonCallDays"), where("status", "==", "pending"), limit(500))),
            getDocs(query(collection(db!, "planningRequests"), where("status", "==", "pending"), limit(500)))
        ]);
        
        const ncds = ncdSnap.docs.map(d => ({id: d.id, ...d.data()})) as NonCallDay[];
        const reqs = prSnap.docs.map(d => ({id: d.id, ...d.data()})) as PlanningPermissionRequest[];

        setAllNonCallDays(ncds);
        setAllPlanningRequests(reqs);
        
        ADMIN_SESSION_CACHE[cacheKey] = { ncds, reqs, timestamp: Date.now() };
    } catch (e) {
        console.warn("Approval fetch failed", e);
    } finally { setLoadingApprovals(false); }
  }, [active, isAuthorized]);

  /**
   * fetchUserData - The core "Low Cost" engine.
   * LOW-COST V2.1: Uses server-side filters with a high-volume (5000 doc) fallback for missing indexes.
   */
  const fetchUserData = useCallback(async (uid: string, selectedMonth?: string, force = false) => {
    if (!uid || !db || !active || !isAuthorized) return;
    
    const { start, end } = getMonthRangeISO(selectedMonth);
    const cacheKey = `user_${uid}_${selectedMonth || 'current'}`;
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
        const fetchModule = async (colName: string, dateField: string, lmt = 2000) => {
            const colRef = collection(db!, colName);
            // TARGETED QUERY: Minimum Reads (requires index)
            const q = query(
                colRef, 
                where("userId", "==", uid), 
                where(dateField, ">=", start),
                where(dateField, "<=", end),
                limit(lmt)
            );
            try {
                const snap = await getDocs(q);
                return snap.docs.map(d => ({id: d.id, ...d.data()}));
            } catch (indexError) {
                // HIGH-VOLUME FALLBACK: If index is missing, fetch 5,000 records to ensure data isn't missing for veteran accounts
                console.warn(`Query ${colName} requires index. Fallback fetch triggered.`);
                const fallbackQ = query(colRef, where("userId", "==", uid), limit(5000));
                const snap = await getDocs(fallbackQ);
                const interval = { start: parseISO(start), end: parseISO(end) };
                return snap.docs.map(d => ({id: d.id, ...d.data()})).filter((d: any) => {
                    const dateVal = d[dateField] || d.coverageDate || d.plannedDate || d.date;
                    const date = parseAnyDate(dateVal);
                    return date && isValid(date) && isWithinInterval(date, interval);
                });
            }
        };

        const [entries, plans, logs, ncds, doctors, requests] = await Promise.all([
            fetchModule("coverageEntries", "coverageDate", 2000),
            fetchModule("plans", "plannedDate", 2000),
            fetchModule("timeLogs", "timeIn", 500),
            fetchModule("nonCallDays", "date", 200),
            getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(3000))).then(s => s.docs.map(d => ({id: d.id, ...d.data()}))),
            getDocs(query(collection(db!, "planningRequests"), where("userId", "==", uid), limit(100))).then(s => s.docs.map(d => ({id: d.id, ...d.data()})))
        ]);

        const data = {
            entries: entries as CoverageEntry[],
            plans: plans as Plan[],
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

        if (selectedMonth && force) {
            toast({ title: "Sync Complete", description: `Updated dataset for ${selectedMonth}.` });
        }
    } catch (e) {
        console.error("Critical User Data Fetch Error:", e);
        toast({ variant: "destructive", title: "Sync Failed", description: "Database communication failed for this representative." });
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
