
"use client"

import { useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, updateDoc, doc as firestoreDoc, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { getMonthRangeISO, parseAnyDate } from "@/lib/utils";
import { isValid, isWithinInterval, parseISO, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const ADMIN_SESSION_CACHE: Record<string, any> = {};

/**
 * LOW-COST V8.0: Robust Data Retrieval Engine.
 * Implements strict date-range filtering to prevent "missing data" caused by limit crowding.
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
    } catch (e: any) {
        if (e.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'nonCallDays/planningRequests',
                operation: 'list',
            }));
        }
    } finally { setLoadingApprovals(false); }
  }, [active, isAuthorized]);

  const fetchUserData = useCallback(async (uid: string, selectedMonth: string, force = false) => {
    if (!uid || !db || !active || !isAuthorized) return;
    
    const { start, end } = getMonthRangeISO(selectedMonth);
    const refDate = parseISO(selectedMonth + "-01");
    // For planning, we fetch a wider range (last month to next month) to ensure visibility
    const planStart = startOfMonth(subMonths(refDate, 1)).toISOString();
    const planEnd = endOfMonth(addMonths(refDate, 1)).toISOString();

    const cacheKey = `user_${uid}_${selectedMonth}`;
    const cached = ADMIN_SESSION_CACHE[cacheKey];

    if (!force && cached && (Date.now() - cached.timestamp < 300000)) { // 5 min cache
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
        // PERFORMANCE FIX: Use date-range queries in Firestore to avoid "limit crowding" by old records
        const [entriesSnap, plansSnap, logsSnap, ncdsSnap, doctorsSnap, requestsSnap] = await Promise.all([
            getDocs(query(
                collection(db!, "coverageEntries"), 
                where("userId", "==", uid), 
                where("coverageDate", ">=", start),
                where("coverageDate", "<=", end),
                limit(2000)
            )).catch(async () => {
                // Fallback for unindexed range
                return getDocs(query(collection(db!, "coverageEntries"), where("userId", "==", uid), limit(3000)));
            }),
            getDocs(query(
                collection(db!, "plans"), 
                where("userId", "==", uid),
                where("plannedDate", ">=", planStart),
                where("plannedDate", "<=", planEnd),
                limit(2000)
            )).catch(async () => {
                return getDocs(query(collection(db!, "plans"), where("userId", "==", uid), limit(3000)));
            }),
            getDocs(query(collection(db!, "timeLogs"), where("userId", "==", uid), limit(500))),
            getDocs(query(collection(db!, "nonCallDays"), where("userId", "==", uid), limit(500))),
            getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(4000))),
            getDocs(query(collection(db!, "planningRequests"), where("userId", "==", uid), limit(500)))
        ]);

        const entries = entriesSnap.docs.map(d => ({id: d.id, ...d.data()} as CoverageEntry));
        const plans = plansSnap.docs.map(d => ({id: d.id, ...d.data()} as Plan));
        const logs = logsSnap.docs.map(d => ({id: d.id, ...d.data()} as any));
        const ncds = ncdsSnap.docs.map(d => ({id: d.id, ...d.data()} as NonCallDay));
        const doctors = doctorsSnap.docs.map(d => ({id: d.id, ...d.data()} as Doctor));
        const requests = requestsSnap.docs.map(d => ({id: d.id, ...d.data()} as PlanningPermissionRequest));

        const interval = { start: parseISO(start), end: parseISO(end) };
        const planInterval = { start: parseISO(planStart), end: parseISO(planEnd) };

        const data = {
            entries: entries.filter(e => {
                const d = parseAnyDate(e.coverageDate || e.submittedAt);
                return d && isValid(d) && isWithinInterval(d, interval);
            }).sort((a,b) => (b.coverageDate || b.submittedAt || "").localeCompare(a.coverageDate || a.submittedAt || "")),
            plans: plans.filter(p => {
                const d = parseAnyDate(p.plannedDate);
                return d && isValid(d) && isWithinInterval(d, planInterval);
            }),
            logs: logs.filter(l => {
                const d = parseAnyDate(l.timeIn);
                return d && isValid(d) && isWithinInterval(d, interval);
            }),
            ncds: ncds.filter(n => {
                const d = parseAnyDate(n.date);
                return d && isValid(d) && isWithinInterval(d, interval);
            }),
            doctors,
            requests,
            timestamp: Date.now()
        };

        setIndividualEntries(data.entries);
        setIndividualPlans(data.plans);
        setIndividualTimeLogs(data.logs);
        setIndividualNonCallDays(data.ncds);
        setIndividualDoctors(data.doctors);
        setIndividualPlanningRequests(data.requests);
        
        ADMIN_SESSION_CACHE[cacheKey] = data;
    } catch (e: any) {
        console.error("Admin fetch failure:", e);
        if (e.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'managedPersonnelData',
                operation: 'list',
            }));
        }
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
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: docRef.path,
          operation: 'update',
          requestResourceData: updateData,
        }));
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
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: docRef.path,
          operation: 'update',
          requestResourceData: updateData,
        }));
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
