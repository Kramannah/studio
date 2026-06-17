
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
 * LOW-COST V4.8: Admin Oversight for Veteran Accounts.
 * Balanced Fetch: Standardized at 3,000 records for metadata, 1,000 for heavy reports.
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
        const fetchModule = async (colName: string, dateField: string, lmt = 3000) => {
            const colRef = collection(db!, colName);
            // Optimized sort for heavy collections
            const q = query(
                colRef, 
                where("userId", "==", uid), 
                orderBy(dateField, "desc"),
                limit(lmt)
            );
            try {
                const snap = await getDocs(q);
                return snap.docs.map(d => ({id: d.id, ...d.data()}));
            } catch (error: any) {
                const fallbackQ = query(colRef, where("userId", "==", uid), limit(lmt));
                const snap = await getDocs(fallbackQ);
                return snap.docs.map(d => ({id: d.id, ...d.data()}));
            }
        };

        const [entries, plans, logs] = await Promise.all([
            fetchModule("coverageEntries", "submittedAt", 1000), // Heavy collection limit
            fetchModule("plans", "plannedDate", 3000),
            fetchModule("timeLogs", "timeIn", 500)
        ]);

        const filteredEntries = (entries as CoverageEntry[]).filter(e => {
            const date = parseAnyDate(e.coverageDate || e.submittedAt);
            return date && isValid(date) && isWithinInterval(date, interval);
        });

        const [ncds, doctors, requests] = await Promise.all([
            fetchModule("nonCallDays", "date", 500),
            getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(3000))).then(s => s.docs.map(d => ({id: d.id, ...d.data()}))),
            getDocs(query(collection(db!, "planningRequests"), where("userId", "==", uid), limit(500))).then(s => s.docs.map(d => ({id: d.id, ...d.data()})))
        ]);

        const data = {
            entries: filteredEntries.sort((a,b) => (b.coverageDate || b.submittedAt || "").localeCompare(a.coverageDate || a.submittedAt || "")),
            plans: (plans as Plan[]).filter(p => {
                const d = parseAnyDate(p.plannedDate);
                return d && isValid(d) && isWithinInterval(d, interval);
            }).sort((a,b) => (b.plannedDate || "").localeCompare(a.plannedDate || "")),
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
            toast({ title: "Sync Complete", description: `Updated records for ${uid}.` });
        }
    } catch (e: any) {
        console.error("Individual User Fetch Failure:", e);
        toast({ variant: "destructive", title: "Connection Error", description: "Database is slow. Please refresh." });
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
