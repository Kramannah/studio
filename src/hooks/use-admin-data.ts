
"use client"

import { useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, updateDoc, doc as firestoreDoc, limit, orderBy } from "firebase/firestore";
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
           profile?.role === 'Admin' || profile?.role === 'Manager';
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
            // Firestore 'in' filter limited to 30 items
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
   * Helper to fetch a collection with index-error fallback.
   * If a complex query fails (missing index), it falls back to a simpler userId query.
   */
  const fetchCollectionResilient = async (colName: string, uid: string, dateField: string, start: string, end: string) => {
      const colRef = collection(db!, colName);
      const interval = { start: parseISO(start), end: parseISO(end) };

      try {
          // Attempt 1: Optimized Monthly Query (Requires Composite Index)
          // We check both 'userId' (standard) and 'uid' (legacy)
          const snap = await getDocs(query(
              colRef, 
              where("userId", "==", uid),
              where(dateField, ">=", start),
              where(dateField, "<=", end),
              limit(1000)
          ));
          
          if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));

          // Fallback legacy field check (uid)
          const legacySnap = await getDocs(query(
              colRef, 
              where("uid", "==", uid),
              where(dateField, ">=", start),
              where(dateField, "<=", end),
              limit(1000)
          ));
          return legacySnap.docs.map(d => ({ id: d.id, ...d.data() }));

      } catch (error: any) {
          // If Attempt 1 fails (likely index error), perform Attempt 2: JS Filtering
          console.warn(`Optimized fetch failed for ${colName}, falling back to JS filter. Error:`, error.code);
          
          // Simplified query (Only requires single-field index, which is automatic)
          const basicSnap = await getDocs(query(
              colRef, 
              where("userId", "==", uid),
              limit(1000)
          ));

          const results = basicSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          
          // Filter by date range in JS
          return results.filter(item => {
              const d = parseAnyDate((item as any)[dateField] || (item as any).submittedAt);
              return d && isValid(interval.start) && isValid(interval.end) && isWithinInterval(d, interval);
          });
      }
  };

  const fetchUserData = useCallback(async (uid: string, month: string) => {
    if (!uid || !db || !active || !isAuthorized) return;
    setLoadingIndividual(true);
    
    // Clear previous view state to prevent flickering
    setIndividualEntries([]);
    setIndividualPlans([]);
    setIndividualTimeLogs([]);
    setIndividualNonCallDays([]);
    setIndividualDoctors([]);

    const { start, end } = getMonthRangeISO(month);

    try {
        // Fetch all relevant data for the PMR
        const [entries, plans, logs, ncds, doctors] = await Promise.all([
            fetchCollectionResilient("coverageEntries", uid, "coverageDate", start, end),
            fetchCollectionResilient("plans", uid, "plannedDate", start, end),
            fetchCollectionResilient("timeLogs", uid, "timeIn", start, end),
            fetchCollectionResilient("nonCallDays", uid, "date", start, end),
            getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(1000)))
        ]);

        setIndividualEntries(entries as any);
        setIndividualPlans(plans as any);
        setIndividualTimeLogs(logs as any);
        setIndividualNonCallDays(ncds as any);
        setIndividualDoctors(doctors.docs.map(d => ({ id: d.id, ...d.data() })) as any);

        if (entries.length > 0) {
            toast({ title: "Data Loaded", description: `Found ${entries.length} reports for ${month}.` });
        }

    } catch (e: any) {
        console.error("Critical User Data Fetch Error:", e);
        toast({ 
            variant: "destructive", 
            title: "Fetch Error", 
            description: "The database could not be reached. Check your connection." 
        });
    } finally { 
        setLoadingIndividual(false); 
    }
  }, [active, isAuthorized, toast]);

  return { 
    allEntries: individualEntries, allDoctors: individualDoctors, allPlans: individualPlans, allTimeLogs: individualTimeLogs, allNonCallDaysIndividual: individualNonCallDays,
    allNonCallDays, allPlanningRequests, loadingIndividual, loadingApprovals, fetchUserData, fetchTeamApprovals,
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
