
"use client"

import { useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, updateDoc, doc as firestoreDoc, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { getMonthRangeISO, parseAnyDate } from "@/lib/utils";
import { isValid, isWithinInterval, parseISO, startOfMonth, endOfMonth, subMonths, addMonths, isSameMonth } from "date-fns";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

// ADMIN SESSION CACHE: Prevents costly re-fetching when switching between admin tabs or PMR profiles
const ADMIN_SESSION_CACHE: Record<string, any> = {};

/**
 * LOW-COST V9.5: Inclusive Data Retrieval Engine.
 * Optimized for reliability. Uses broader queries to ensure "mis-dated" reports (like Anne Alberto's July 20-31 reports) reflect correctly.
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
    } catch (e) {
        console.error("Approval fetch error", e);
    } finally { setLoadingApprovals(false); }
  }, [active, isAuthorized]);

  const fetchUserData = useCallback(async (uid: string, selectedMonth: string, force = false) => {
    if (!uid || !db || !active || !isAuthorized) return;
    
    const refDate = parseISO(selectedMonth + "-01");
    // DEEP SCAN: Go back 4 months to catch any late-synced or incorrectly dated reports
    const scanStart = startOfOfMonth(subMonths(refDate, 3)).toISOString();
    const { end: monthEnd } = getMonthRangeISO(selectedMonth);
    
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
        // BROAD QUERY: Fetch by userId primarily to prevent range-query skipping of metadata-poor documents
        const [entriesSnap, plansSnap, logsSnap, ncdsSnap, doctorsSnap, requestsSnap] = await Promise.all([
            getDocs(query(collection(db!, "coverageEntries"), where("userId", "==", uid), where("coverageDate", ">=", scanStart), limit(3000))),
            getDocs(query(collection(db!, "plans"), where("userId", "==", uid), limit(2000))),
            getDocs(query(collection(db!, "timeLogs"), where("userId", "==", uid), limit(1000))),
            getDocs(query(collection(db!, "nonCallDays"), where("userId", "==", uid), limit(1000))),
            getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(5000))),
            getDocs(query(collection(db!, "planningRequests"), where("userId", "==", uid), limit(500)))
        ]);

        const selectedInterval = { start: startOfMonth(refDate), end: endOfMonth(refDate) };
        const trendInterval = { start: startOfMonth(subMonths(refDate, 2)), end: endOfMonth(refDate) };

        const entries = entriesSnap.docs.map(d => ({id: d.id, ...d.data()} as CoverageEntry))
            .filter(e => {
                const d = parseAnyDate(e.coverageDate) || parseAnyDate(e.submittedAt);
                return d && isValid(d) && isWithinInterval(d, trendInterval);
            }).sort((a,b) => (b.coverageDate || b.submittedAt || "").localeCompare(a.coverageDate || a.submittedAt || ""));

        const data = {
            entries,
            plans: plansSnap.docs.map(d => ({id: d.id, ...d.data()} as Plan))
                .filter(p => {
                    const d = parseAnyDate(p.plannedDate);
                    // Show plans within 1 month buffer
                    return d && isValid(d) && isWithinInterval(d, { start: subMonths(refDate, 1), end: addMonths(refDate, 1) });
                }),
            logs: logsSnap.docs.map(d => ({id: d.id, ...d.data()} as any))
                .filter(l => {
                    const d = parseAnyDate(l.timeIn);
                    return d && isValid(d) && isWithinInterval(d, selectedInterval);
                }),
            ncds: ncdsSnap.docs.map(d => ({id: d.id, ...d.data()} as NonCallDay))
                .filter(n => {
                    const d = parseAnyDate(n.date);
                    return d && isValid(d) && isWithinInterval(d, selectedInterval);
                }),
            doctors: doctorsSnap.docs.map(d => ({id: d.id, ...d.data()} as Doctor)),
            requests: requestsSnap.docs.map(d => ({id: d.id, ...d.data()} as PlanningPermissionRequest)),
            timestamp: Date.now()
        };

        setIndividualEntries(data.entries);
        setIndividualPlans(data.plans);
        setIndividualTimeLogs(data.logs);
        setIndividualNonCallDays(data.ncds);
        setIndividualDoctors(data.doctors);
        setIndividualPlanningRequests(data.requests);
        
        ADMIN_SESSION_CACHE[cacheKey] = data;
    } catch (e) {
        console.error("User deep scan failed", e);
    } finally { 
        setLoadingIndividual(false); 
    }
  }, [active, isAuthorized]);

  const updateNonCallDayStatus = async (id: string, status: 'approved' | 'rejected') => {
    if (!db) return;
    const docRef = firestoreDoc(db!, 'nonCallDays', id);
    const updateData = { status };
    
    updateDoc(docRef, updateData)
      .then(() => {
        setAllNonCallDays(prev => prev.map(d => d.id === id ? {...d, status} : d));
        toast({ title: `Request ${status}` });
      })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'update',
          requestResourceData: updateData,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const updatePlanningRequestStatus = async (id: string, status: 'approved' | 'rejected') => {
    if (!db) return;
    const docRef = firestoreDoc(db!, 'planningRequests', id);
    const updateData = { status };
    
    updateDoc(docRef, updateData)
      .then(() => {
        setAllPlanningRequests(prev => prev.map(r => r.id === id ? {...r, status} : r));
        toast({ title: `Request ${status}` });
      })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'update',
          requestResourceData: updateData,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
  };

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
    updateNonCallDayStatus,
    updatePlanningRequestStatus
  };
}

function startOfOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}
