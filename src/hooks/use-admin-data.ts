
"use client"

import { useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, updateDoc, doc as firestoreDoc, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { MANAGER_TEAMS, ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { getMonthRangeISO, parseAnyDate } from "@/lib/utils";
import { isWithinInterval, parseISO, isValid } from "date-fns";

export function useAdminData(managerId?: string, userProfiles: Record<string, UserProfile> = {}, active: boolean = true) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  
  const [individualEntries, setIndividualEntries] = useState<CoverageEntry[]>([]);
  const [individualDoctors, setIndividualDoctors] = useState<Doctor[]>([]);
  const [individualPlans, setIndividualPlans] = useState<Plan[]>([]);
  const [individualTimeLogs, setIndividualTimeLogs] = useState<any[]>([]);
  const [individualNonCallDays, setIndividualNonCallDays] = useState<NonCallDay[]>([]);
  const [individualPlanningRequests, setIndividualPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  const [individualUsedQuantities, setIndividualUsedQuantities] = useState<Record<string, number>>({});
  
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
                const snap = await getDocs(query(colRef, limit(500)));
                return snap.docs.map(d => ({id: d.id, ...d.data()}));
            }
            const chunks = [];
            for (let i = 0; i < filter.length; i += 30) {
                chunks.push(filter.slice(i, i + 30));
            }
            
            const results: any[] = [];
            for (const chunk of chunks) {
                const snap = await getDocs(query(colRef, where("userId", "in", chunk), limit(500)));
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

  /**
   * Resilient fetcher that bypasses index requirements if necessary.
   */
  const fetchCollectionResilient = async (colName: string, uid: string, dateField: string, start: string, end: string) => {
      const colRef = collection(db!, colName);
      const interval = { start: parseISO(start), end: parseISO(end) };

      try {
          // Attempt 1: Optimized Monthly Query (Requires Composite Index)
          const snap = await getDocs(query(
              colRef, 
              where("userId", "==", uid),
              where(dateField, ">=", start),
              where(dateField, "<=", end),
              limit(1000)
          ));
          return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (error: any) {
          // Attempt 2: Stable Fallback (Fetch user data and filter in JS)
          console.warn(`Falling back to JS filter for ${colName} for user ${uid}`);
          const basicSnap = await getDocs(query(
              colRef, 
              where("userId", "==", uid),
              limit(1000)
          ));

          const results = basicSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          return results.filter(item => {
              const dateVal = (item as any)[dateField] || (item as any).submittedAt;
              const d = parseAnyDate(dateVal);
              return d && isValid(interval.start) && isValid(interval.end) && isWithinInterval(d, interval);
          });
      }
  };

  const fetchUserData = useCallback(async (uid: string, month: string) => {
    if (!uid || !db || !active || !isAuthorized) return;
    setLoadingIndividual(true);
    
    const { start, end } = getMonthRangeISO(month);

    try {
        const [entries, plans, logs, ncds, reqs, doctors] = await Promise.all([
            fetchCollectionResilient("coverageEntries", uid, "coverageDate", start, end),
            fetchCollectionResilient("plans", uid, "plannedDate", start, end),
            fetchCollectionResilient("timeLogs", uid, "timeIn", start, end),
            fetchCollectionResilient("nonCallDays", uid, "date", start, end),
            fetchCollectionResilient("planningRequests", uid, "requestedAt", start, end),
            getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(1000)))
        ]);

        const typedEntries = entries as CoverageEntry[];
        setIndividualEntries(typedEntries);
        setIndividualPlans(plans as Plan[]);
        setIndividualTimeLogs(logs);
        setIndividualNonCallDays(ncds as NonCallDay[]);
        setIndividualPlanningRequests(reqs as PlanningPermissionRequest[]);
        setIndividualDoctors(doctors.docs.map(d => ({ id: d.id, ...d.data() })) as Doctor[]);

        // Calculate used quantities locally for the selected PMR view
        const used: Record<string, number> = {};
        typedEntries.forEach(data => {
            const process = (name?: string, qty?: number) => {
                const key = String(name ?? "").toLowerCase().trim();
                if (!key) return;
                const q = Math.round(Number(qty || 0));
                if (!isNaN(q) && q !== 0) used[key] = (used[key] || 0) + q;
            };
            process(data.primarySampleName, data.primaryProductQty);
            process(data.secondarySampleName, data.secondaryProductQty);
            if (data.reminderProducts) data.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
        });
        setIndividualUsedQuantities(used);

        if (entries.length > 0) {
            toast({ title: "Data Synced", description: `${entries.length} reports loaded for ${month}.` });
        }
    } catch (e: any) {
        console.error("Critical Fetch Error:", e);
        toast({ variant: "destructive", title: "Database Error", description: "Communication failed. Please try again." });
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
