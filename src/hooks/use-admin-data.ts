"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { collection, getDocs, query, where, doc, updateDoc, doc as firestoreDoc, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { MANAGER_TEAMS, ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { format, parseISO, isValid, isWithinInterval } from "date-fns";
import { getMonthRangeISO } from "@/lib/utils";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

/**
 * [LOW_COST_UPDATE] 
 * Modified to support targeted monthly fetching in Admin view to reduce read costs.
 * [INDEX_FIX] Removed server-side date filtering to avoid composite index requirements.
 */
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
  const [individualAvailableMonths, setIndividualAvailableMonths] = useState<string[]>([]);

  const [allNonCallDays, setAllNonCallDays] = useState<NonCallDay[]>([]);
  const [allPlanningRequests, setAllPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [loadingIndividual, setLoadingIndividual] = useState(false);

  const lastFetchedKeyRef = useRef<string | null>(null);

  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    const email = (user.email ?? "").toLowerCase();
    return ADMIN_UIDS.includes(user.uid) || 
           email === 'mbustamante@hovidinc.com' || 
           ADMIN_EMAILS.some(e => (e ?? "").toLowerCase() === email) ||
           profile?.role === 'Admin';
  }, [user, profile]);

  const isAuthorized = isUserAdmin || profile?.role === 'Manager' || Object.keys(MANAGER_TEAMS).includes(user?.uid || '') || profile?.role === 'Marketing' || profile?.role === 'HR';

  const getManagedUserIds = useCallback((mgrId?: string) => {
    if (!mgrId) return [];
    const hardcoded = MANAGER_TEAMS[mgrId] || [];
    const dynamic = Object.entries(userProfiles)
        .filter(([_, p]) => p.managerId === mgrId)
        .map(([uid, _]) => uid);
    return Array.from(new Set([...hardcoded, ...dynamic]));
  }, [userProfiles]);

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
            if (!filter) return (await getDocs(query(colRef, limit(500)))).docs.map(d => ({id: d.id, ...d.data()}));
            const chunks = [];
            for (let i = 0; i < filter.length; i += 10) chunks.push(filter.slice(i, i+10));
            const results = await Promise.all(chunks.map(c => getDocs(query(colRef, where("userId", "in", c), limit(500)))));
            return results.flatMap(s => s.docs.map(d => ({id: d.id, ...d.data()})));
        };
        const [ncd, pr] = await Promise.all([fetchCol("nonCallDays", userFilter), fetchCol("planningRequests", userFilter)]);
        setAllNonCallDays(ncd as any);
        setAllPlanningRequests(pr as any);
    } catch (e) {} finally { setLoadingApprovals(false); }
  }, [user, managerId, getManagedUserIds, active, isAuthorized]);

  /**
   * [LOW_COST_UPDATE] 
   * surgical fetching for Admin: Reads only the target month for the selected PMR.
   * [INDEX_FIX] Fetches recent records by userId and filters by date in memory to avoid index requirements.
   * [FETCH_CONTROL] Added force parameter to allow manual refreshes.
   */
  const fetchUserData = useCallback(async (uid: string, monthStr?: string, force = false) => {
    if (!uid || !db || !active || !isAuthorized) return;

    const fetchKey = `${uid}_${monthStr || 'current'}`;
    if (!force && lastFetchedKeyRef.current === fetchKey && allEntries.length > 0) return;

    setLoadingIndividual(true);
    try {
        const { start, end } = getMonthRangeISO(monthStr);
        const interval = { start: parseISO(start), end: parseISO(end) };
        const mapDocs = (s: any) => s.docs.map((doc: any) => ({id: doc.id, ...doc.data()}));
        
        // [INDEX_FIX] Fetch by userId only (single index) to avoid composite index error
        const [eSnap, pSnap, lSnap, ncdSnap] = await Promise.all([
            getDocs(query(collection(db!, "coverageEntries"), where("userId", "==", uid), limit(2000))),
            getDocs(query(collection(db!, "plans"), where("userId", "==", uid), limit(2000))),
            getDocs(query(collection(db!, "timeLogs"), where("userId", "==", uid), limit(1000))),
            getDocs(query(collection(db!, "nonCallDays"), where("userId", "==", uid), limit(1000)))
        ]);
        
        // Masterlist is fetched once and cached in session
        let dData = allDoctors;
        if (allDoctors.length === 0 || lastFetchedKeyRef.current?.split('_')[0] !== uid) {
            const dSnap = await getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(1000)));
            dData = mapDocs(dSnap) as any;
        }

        // [CLIENT_SIDE_FILTER] Apply date windowing in JS
        const entries = (mapDocs(eSnap) as CoverageEntry[]).filter(e => {
            const d = parseISO(e.coverageDate || e.submittedAt);
            return isValid(d) && isWithinInterval(d, interval);
        });

        const plans = (mapDocs(pSnap) as Plan[]).filter(p => {
            const d = parseISO(p.plannedDate);
            return isValid(d) && isWithinInterval(d, interval);
        });

        const logs = (mapDocs(lSnap) as TimeLog[]).filter(l => {
            const d = parseISO(l.timeIn);
            return isValid(d) && isWithinInterval(d, interval);
        });

        const ncds = (mapDocs(ncdSnap) as NonCallDay[]).filter(n => {
            const d = parseISO(n.date);
            return isValid(d) && isWithinInterval(d, interval);
        });

        const used: Record<string, number> = {};
        entries.forEach((item) => {
            const process = (n?: string, q?: number) => {
                const key = String(n ?? "").toLowerCase().trim();
                if (key) used[key] = (used[key] || 0) + (Number(q || 0));
            };
            process(item.primarySampleName, item.primaryProductQty);
            process(item.secondarySampleName, item.secondaryProductQty);
            if (item.reminderProducts) item.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
        });

        const months = new Set(individualAvailableMonths);
        months.add(monthStr || format(new Date(), 'yyyy-MM'));

        setAllEntries(entries); 
        setAllDoctors(dData); 
        setAllPlans(plans);
        setAllTimeLogs(logs); 
        setAllNonCallDaysIndividual(ncds);
        setIndividualUsedQuantities(used);
        setIndividualAvailableMonths(Array.from(months).sort((a, b) => b.localeCompare(a)));
        
        lastFetchedKeyRef.current = fetchKey;
    } catch (e: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'user-data-targeted',
            operation: 'list',
        } satisfies SecurityRuleContext));
    } finally {
        setLoadingIndividual(false);
    }
  }, [active, isAuthorized, allDoctors, individualAvailableMonths, allEntries.length]);

  return { 
    allEntries, allDoctors, allPlans, allTimeLogs, allNonCallDaysIndividual, 
    individualPlanningRequests, individualUsedQuantities, individualAvailableMonths, allNonCallDays, allPlanningRequests, 
    loadingIndividual, loadingApprovals,
    fetchUserData, fetchTeamApprovals,
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
