
"use client"

import { useEffect, useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, doc, updateDoc, doc as firestoreDoc, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { MANAGER_TEAMS, ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { format, parseISO, eachMonthOfInterval, startOfMonth } from "date-fns";

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

  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    const email = (user.email ?? "").toLowerCase();
    return ADMIN_UIDS.includes(user.uid) || 
           email === 'mbustamante@hovidinc.com' || 
           email === 'admin@hovidinc.com' ||
           ADMIN_EMAILS.some(e => (e ?? "").toLowerCase() === email) ||
           profile?.role === 'Admin';
  }, [user, profile]);

  const hasFullAdminAccess = useMemo(() => {
    return isUserAdmin || profile?.role === 'Manager' || Object.keys(MANAGER_TEAMS).includes(user?.uid || '');
  }, [isUserAdmin, profile, user]);

  const hasLimitedAdminAccess = useMemo(() => {
    return profile?.role === 'Marketing' || profile?.role === 'HR';
  }, [profile]);

  const isAuthorized = hasFullAdminAccess || hasLimitedAdminAccess;

  const getManagedUserIds = useCallback((mgrId?: string) => {
    if (!mgrId) return [];
    const hardcoded = MANAGER_TEAMS[mgrId] || [];
    const dynamic = Object.entries(userProfiles)
        .filter(([_, p]) => p.managerId === mgrId)
        .map(([uid, _]) => uid);
    return Array.from(new Set([...hardcoded, ...dynamic]));
  }, [userProfiles]);

  const fetchTeamApprovals = useCallback(async () => {
    if (!user || !db || !active || !hasFullAdminAccess) return;
    
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
                return (await getDocs(query(colRef, limit(1000)))).docs.map(d => ({id: d.id, ...d.data()}));
            }
            
            const chunks = [];
            for (let i = 0; i < filter.length; i += 10) chunks.push(filter.slice(i, i+10));
            const results = await Promise.all(chunks.map(c => getDocs(query(colRef, where("userId", "in", c), limit(1000)))));
            return results.flatMap(s => s.docs.map(d => ({id: d.id, ...d.data()})));
        };

        const [ncd, pr] = await Promise.all([fetchCol("nonCallDays", userFilter), fetchCol("planningRequests", userFilter)]);
        
        setAllNonCallDays(ncd as any);
        setAllPlanningRequests(pr as any);
    } catch (e) {
        console.error("Approvals fetch error:", e);
    } finally {
        setLoadingApprovals(false);
    }
  }, [user, managerId, getManagedUserIds, active, hasFullAdminAccess]);

  const fetchUserData = useCallback(async (uid: string) => {
    if (!uid || !db || !active || !isAuthorized) return;

    setLoadingIndividual(true);
    try {
        const mapDocs = (s: any) => s.docs.map((doc: any) => ({id: doc.id, ...doc.data()}));
        
        // [RECENT_WINDOW_SAFE_STRATEGY] - Reverted to fixed 600-record fetch sorted by date
        const entriesQuery = query(
            collection(db!, "coverageEntries"), 
            where("userId", "==", uid),
            orderBy("coverageDate", "desc"),
            limit(600)
        );

        // [RANGE_DISCOVERY_LOGIC] - Still fetch oldest record to calculate full history range for selector
        const rangeQuery = query(
            collection(db!, "coverageEntries"),
            where("userId", "==", uid),
            orderBy("coverageDate", "asc"),
            limit(1)
        );

        const [eSnap, rangeSnap] = await Promise.all([
            getDocs(entriesQuery),
            getDocs(rangeQuery)
        ]);

        const entries = mapDocs(eSnap) as CoverageEntry[];
        
        // Calculate all available months from oldest record to today for the dropdown
        if (rangeSnap.docs.length > 0) {
            const oldestDate = parseISO(rangeSnap.docs[0].data().coverageDate || rangeSnap.docs[0].data().submittedAt);
            const months = eachMonthOfInterval({
                start: startOfMonth(oldestDate),
                end: startOfMonth(new Date())
            }).map(m => format(m, 'yyyy-MM')).reverse();
            setIndividualAvailableMonths(months);
        } else {
            setIndividualAvailableMonths([format(new Date(), 'yyyy-MM')]);
        }

        const dSnap = await getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(1000)));
        const pSnap = await getDocs(query(collection(db!, "plans"), where("userId", "==", uid), limit(1000)));
        const lSnap = await getDocs(query(collection(db!, "timeLogs"), where("userId", "==", uid), limit(1000)));
        const ncdSnap = await getDocs(query(collection(db!, "nonCallDays"), where("userId", "==", uid), limit(1000)));
        const rSnap = await getDocs(query(collection(db!, "planningRequests"), where("userId", "==", uid), limit(1000)));

        const used: Record<string, number> = {};
        entries.forEach((item) => {
            const process = (n?: string, q?: number) => {
                const key = String(n ?? "").toLowerCase().trim();
                if (key) used[key] = (used[key] || 0) + (Number(q || 0));
            };
            process(item.primarySampleName, item.primaryProductQty);
            process(item.secondarySampleName, item.secondaryProductQty);
            if (item.reminderProducts) {
                item.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
            }
        });

        entries.sort((a, b) => (b.coverageDate || b.submittedAt || '').localeCompare(a.coverageDate || a.submittedAt || ''));

        setAllEntries(entries); 
        setAllDoctors(mapDocs(dSnap) as any); 
        setAllPlans(mapDocs(pSnap) as any);
        setAllTimeLogs(mapDocs(lSnap) as any); 
        setAllNonCallDaysIndividual(mapDocs(ncdSnap) as any);
        setIndividualPlanningRequests(mapDocs(rSnap) as any); 
        setIndividualUsedQuantities(used);
    } catch (e) {
        console.error("Individual data fetch failed:", e);
    } finally {
        setLoadingIndividual(false);
    }
  }, [active, isAuthorized]);

  return { 
    allEntries, allDoctors, allPlans, allTimeLogs, allNonCallDaysIndividual, 
    individualPlanningRequests, individualUsedQuantities, individualAvailableMonths, allNonCallDays, allPlanningRequests, 
    loadingIndividual, loadingApprovals,
    fetchUserData, fetchTeamApprovals,
    updateNonCallDayStatus: async (id: string, status: 'approved' | 'rejected') => {
        const ref = firestoreDoc(db!, 'nonCallDays', id);
        await updateDoc(ref, { status });
        setAllNonCallDays(prev => prev.map(d => d.id === id ? {...d, status} : d));
        toast({ title: `Request ${status}` });
    },
    updatePlanningRequestStatus: async (id: string, status: 'approved' | 'rejected') => {
        const ref = firestoreDoc(db!, 'planningRequests', id);
        await updateDoc(ref, { status });
        setAllPlanningRequests(prev => prev.map(r => r.id === id ? {...r, status} : r));
        toast({ title: `Request ${status}` });
    }
  };
}
