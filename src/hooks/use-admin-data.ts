
"use client"

import { useState, useCallback, useMemo, useRef } from "react";
import { collection, getDocs, query, where, updateDoc, doc as firestoreDoc, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { parseAnyDate } from "@/lib/utils";
import { isValid, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

// SHARED CACHE: Persists data for the duration of the session to prevent re-downloads
const ADMIN_SESSION_CACHE: Record<string, any> = {};
const DOCTOR_MASTER_CACHE: Record<string, { data: Doctor[], timestamp: number }> = {};
const CACHE_TTL = 15 * 60 * 1000; // Restored to 15 Minutes

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
  
  const activeFetchIdRef = useRef<string | null>(null);

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
    
    const fetchId = `${uid}_${selectedMonth}`;
    activeFetchIdRef.current = fetchId;

    const cacheKey = `user_${uid}_${selectedMonth}`;
    const cached = ADMIN_SESSION_CACHE[cacheKey];

    if (!force && cached && (Date.now() - cached.timestamp < CACHE_TTL)) { 
        setIndividualEntries(cached.entries);
        setIndividualPlans(cached.plans);
        setIndividualTimeLogs(cached.logs);
        setIndividualNonCallDays(cached.ncds);
        setIndividualPlanningRequests(cached.requests);
        
        const cachedDocs = DOCTOR_MASTER_CACHE[uid];
        if (cachedDocs) setIndividualDoctors(cachedDocs.data);
        return;
    }

    setLoadingIndividual(true);
    const refDate = parseISO(selectedMonth + "-01");
    // WIDE SCAN: Restore 4-month rolling window for accuracy
    const start = startOfMonth(subMonths(refDate, 3)).toISOString();
    const end = endOfMonth(refDate).toISOString();

    const resilientGetDocs = async (collName: string, dateField: string, filterStart: string, filterEnd: string) => {
        try {
            const q = query(
                collection(db!, collName), 
                where("userId", "==", uid), 
                where(dateField, ">=", filterStart),
                where(dateField, "<=", filterEnd),
                limit(3000)
            );
            return await getDocs(q);
        } catch (err: any) {
            // Revert to full per-user scan on index error (Deep discovery)
            const fallbackQ = query(collection(db!, collName), where("userId", "==", uid), orderBy(dateField, "desc"), limit(2000));
            try {
                const snap = await getDocs(fallbackQ);
                return {
                    docs: snap.docs.filter(doc => {
                        const val = String(doc.data()[dateField] || "");
                        return val >= filterStart && val <= filterEnd;
                    })
                };
            } catch (e) {
                const desperateQ = query(collection(db!, collName), where("userId", "==", uid), limit(2000));
                const snap = await getDocs(desperateQ);
                return {
                    docs: snap.docs.filter(doc => {
                        const val = String(doc.data()[dateField] || "");
                        return val >= filterStart && val <= filterEnd;
                    })
                };
            }
        }
    };

    try {
        const fetchCollection = async (name: string, field: string, setter: (val: any[]) => void) => {
            const snap = await resilientGetDocs(name, field, start, end);
            if (activeFetchIdRef.current === fetchId) {
                const data = (snap.docs || []).map((d: any) => ({ id: d.id, ...d.data() }));
                if (name === 'coverageEntries') {
                    data.sort((a: any, b: any) => (b.coverageDate || b.submittedAt || "").localeCompare(a.coverageDate || a.submittedAt || ""));
                }
                setter(data);
                return data;
            }
            return [];
        };

        const pEntries = fetchCollection("coverageEntries", "coverageDate", setIndividualEntries);
        const pPlans = fetchCollection("plans", "plannedDate", setIndividualPlans);
        const pLogs = fetchCollection("timeLogs", "timeIn", setIndividualTimeLogs);
        const pNcds = fetchCollection("nonCallDays", "date", setIndividualNonCallDays);
        
        let doctorsData: Doctor[] = [];
        if (!force && DOCTOR_MASTER_CACHE[uid] && (Date.now() - DOCTOR_MASTER_CACHE[uid].timestamp < CACHE_TTL)) {
            doctorsData = DOCTOR_MASTER_CACHE[uid].data;
            setIndividualDoctors(doctorsData);
        } else {
            const doctorsSnap = await getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(2000)));
            doctorsData = doctorsSnap.docs.map(d => ({id: d.id, ...d.data()} as Doctor));
            if (activeFetchIdRef.current === fetchId) {
                setIndividualDoctors(doctorsData);
                DOCTOR_MASTER_CACHE[uid] = { data: doctorsData, timestamp: Date.now() };
            }
        }

        const requestsSnap = await getDocs(query(collection(db!, "planningRequests"), where("userId", "==", uid), limit(500)));
        const requestsData = requestsSnap.docs.map(d => ({id: d.id, ...d.data()} as PlanningPermissionRequest));
        if (activeFetchIdRef.current === fetchId) setIndividualPlanningRequests(requestsData);

        const [entries, plans, logs, ncds] = await Promise.all([pEntries, pPlans, pLogs, pNcds]);
        
        if (activeFetchIdRef.current === fetchId) {
            ADMIN_SESSION_CACHE[cacheKey] = {
                entries, plans, logs, ncds, requests: requestsData, timestamp: Date.now()
            };
        }

    } catch (e) {
        console.error("Fetch cycle failed:", e);
    } finally { 
        if (activeFetchIdRef.current === fetchId) setLoadingIndividual(false); 
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
