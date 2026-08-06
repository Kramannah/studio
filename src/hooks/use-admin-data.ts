
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
            getDocs(query(collection(db!, "nonCallDays"), where("status", "==", "pending"), limit(500))),
            getDocs(query(collection(db!, "planningRequests"), where("status", "==", "pending"), limit(500)))
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
    
    const cacheKey = `user_${uid}_${selectedMonth}`;
    const cached = ADMIN_SESSION_CACHE[cacheKey];

    // Cache TTL check for speed
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
        const refDate = parseISO(selectedMonth + "-01");
        // STRICT 3-MONTH SCAN: Current + 2 Previous to support Activity Trend perfectly
        const start = startOfMonth(subMonths(refDate, 2)).toISOString();
        const end = endOfMonth(refDate).toISOString();

        // RESILIENT FETCH: Handles missing indexes by falling back to client-side filtering
        const resilientGetDocs = async (collName: string, dateField: string, filterStart: string, filterEnd: string, maxLimit: number) => {
            try {
                const q = query(
                    collection(db!, collName), 
                    where("userId", "==", uid), 
                    where(dateField, ">=", filterStart),
                    where(dateField, "<=", filterEnd),
                    limit(maxLimit)
                );
                return await getDocs(q);
            } catch (err: any) {
                // Check for index requirement error
                if (err.code === 'failed-precondition' || err.message?.toLowerCase().includes('index')) {
                    const fallbackQ = query(collection(db!, collName), where("userId", "==", uid), limit(maxLimit));
                    const snap = await getDocs(fallbackQ);
                    return {
                        docs: snap.docs.filter(doc => {
                            const val = String(doc.data()[dateField] || "");
                            return val >= filterStart && val <= filterEnd;
                        })
                    };
                }
                throw err;
            }
        };

        const [entriesSnap, plansSnap, logsSnap, ncdsSnap, doctorsSnap, requestsSnap] = await Promise.all([
            resilientGetDocs("coverageEntries", "coverageDate", start, end, 2000),
            resilientGetDocs("plans", "plannedDate", start, end, 1000),
            resilientGetDocs("timeLogs", "timeIn", start, end, 500),
            resilientGetDocs("nonCallDays", "date", start, end, 200),
            getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(2000))),
            getDocs(query(collection(db!, "planningRequests"), where("userId", "==", uid), limit(100)))
        ]);

        const entries = (entriesSnap.docs || []).map((d: any) => ({ id: d.id, ...d.data() } as CoverageEntry))
            .sort((a,b) => (b.coverageDate || b.submittedAt || "").localeCompare(a.coverageDate || a.submittedAt || ""));

        const data = {
            entries,
            plans: (plansSnap.docs || []).map((d: any) => ({id: d.id, ...d.data()} as Plan)),
            logs: (logsSnap.docs || []).map((d: any) => ({id: d.id, ...d.data()} as any)),
            ncds: (ncdsSnap.docs || []).map((d: any) => ({id: d.id, ...d.data()} as NonCallDay)),
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
        console.error("Strict Scan failed:", e);
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
