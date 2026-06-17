
"use client"

import { useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, updateDoc, doc as firestoreDoc, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { getMonthRangeISO, parseAnyDate } from "@/lib/utils";
import { isValid, isWithinInterval, parseISO } from "date-fns";

/**
 * useAdminData - Optimized for UID-based individual oversight.
 * Strictly queries 'plans' and 'coverageEntries' for the selected UID and month.
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
    setLoadingApprovals(true);
    try {
        const [ncdSnap, prSnap] = await Promise.all([
            getDocs(query(collection(db!, "nonCallDays"), limit(1000))),
            getDocs(query(collection(db!, "planningRequests"), limit(1000)))
        ]);
        
        const ncds = ncdSnap.docs.map(d => ({id: d.id, ...d.data()})) as NonCallDay[];
        const reqs = prSnap.docs.map(d => ({id: d.id, ...d.data()})) as PlanningPermissionRequest[];

        // Sort in memory to avoid composite index requirements
        setAllNonCallDays(ncds.sort((a, b) => (b.date || "").localeCompare(a.date || "")));
        setAllPlanningRequests(reqs.sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || "")));
    } catch (e) {
        console.warn("Approval fetch failed", e);
    } finally { setLoadingApprovals(false); }
  }, [active, isAuthorized]);

  /**
   * fetchUserData - The core "Low Cost" engine.
   * Strictly uses UID to fetch representative records.
   */
  const fetchUserData = useCallback(async (uid: string, selectedMonth?: string) => {
    if (!uid || !db || !active || !isAuthorized) return;
    setLoadingIndividual(true);
    
    try {
        const { start, end } = getMonthRangeISO(selectedMonth);
        const interval = { start: parseISO(start), end: parseISO(end) };

        const fetchModule = async (colName: string, dateField: string) => {
            const colRef = collection(db!, colName);
            // Fetch broadly for the user and filter in memory to avoid composite index requirement errors
            const q = query(colRef, where("userId", "==", uid), limit(10000));
            const snap = await getDocs(q);
            const docs = snap.docs.map(d => ({id: d.id, ...d.data()}));
            
            return docs.filter((d: any) => {
                const dateVal = d[dateField] || d.coverageDate || d.plannedDate || d.submittedAt || d.date;
                const date = parseAnyDate(dateVal);
                return date && isValid(date) && isWithinInterval(date, interval);
            }).sort((a: any, b: any) => {
                const dateA = a[dateField] || a.coverageDate || a.plannedDate || a.submittedAt || a.date || "";
                const dateB = b[dateField] || b.coverageDate || b.plannedDate || b.submittedAt || b.date || "";
                return dateB.localeCompare(dateA);
            });
        };

        const [entries, plans, logs, ncds, doctors, requests] = await Promise.all([
            fetchModule("coverageEntries", "coverageDate"),
            fetchModule("plans", "plannedDate"),
            fetchModule("timeLogs", "timeIn"),
            fetchModule("nonCallDays", "date"),
            getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(5000))).then(s => s.docs.map(d => ({id: d.id, ...d.data()}))),
            getDocs(query(collection(db!, "planningRequests"), where("userId", "==", uid), limit(500))).then(s => s.docs.map(d => ({id: d.id, ...d.data()})))
        ]);

        setIndividualEntries((entries as CoverageEntry[]) || []);
        setIndividualPlans((plans as Plan[]) || []);
        setIndividualTimeLogs((logs as any[]) || []);
        setIndividualNonCallDays((ncds as NonCallDay[]) || []);
        setIndividualDoctors((doctors as Doctor[]) || []);
        setIndividualPlanningRequests((requests as PlanningPermissionRequest[]) || []);
        
        if (selectedMonth) {
            toast({ title: "Module Synchronized", description: `Loaded individual activity for ${selectedMonth}.` });
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
        toast({ title: `Request ${status}` });
    },
    updatePlanningRequestStatus: async (id: string, status: 'approved' | 'rejected') => {
        await updateDoc(firestoreDoc(db!, 'planningRequests', id), { status });
        setAllPlanningRequests(prev => prev.map(r => r.id === id ? {...r, status} : r));
        toast({ title: `Request ${status}` });
    }
  };
}
