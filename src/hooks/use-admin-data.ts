
"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { collection, getDocs, query, where, doc, updateDoc, doc as firestoreDoc, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { MANAGER_TEAMS, ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { format, parseISO, isValid, isWithinInterval } from "date-fns";
import { getMonthRangeISO } from "@/lib/utils";

export function useAdminData(managerId?: string, userProfiles: Record<string, UserProfile> = {}, active: boolean = true) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  
  const [individualEntries, setIndividualEntries] = useState<CoverageEntry[]>([]);
  const [individualDoctors, setIndividualDoctors] = useState<Doctor[]>([]);
  const [individualPlans, setIndividualPlans] = useState<Plan[]>([]);
  const [individualTimeLogs, setIndividualTimeLogs] = useState<TimeLog[]>([]);
  const [individualNonCallDays, setIndividualNonCallDays] = useState<NonCallDay[]>([]);
  
  const [allNonCallDays, setAllNonCallDays] = useState<NonCallDay[]>([]);
  const [allPlanningRequests, setAllPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [loadingIndividual, setLoadingIndividual] = useState(false);

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
            if (!filter) return (await getDocs(query(colRef, limit(1000)))).docs.map(d => ({id: d.id, ...d.data()}));
            const chunks = [];
            for (let i = 0; i < filter.length; i += 10) chunks.push(filter.slice(i, i+10));
            const results = await Promise.all(chunks.map(c => getDocs(query(colRef, where("userId", "in", c), limit(1000)))));
            return results.flatMap(s => s.docs.map(d => ({id: d.id, ...d.data()})));
        };
        const [ncd, pr] = await Promise.all([fetchCol("nonCallDays", userFilter), fetchCol("planningRequests", userFilter)]);
        setAllNonCallDays(ncd as any);
        setAllPlanningRequests(pr as any);
    } catch (e) {} finally { setLoadingApprovals(false); }
  }, [user, managerId, getManagedUserIds, active, isAuthorized]);

  const fetchUserData = useCallback(async (uid: string, monthStr?: string, force = false) => {
    if (!uid || !db || !active || !isAuthorized) return;
    setLoadingIndividual(true);
    try {
        const { start, end } = getMonthRangeISO(monthStr);
        const interval = { start: parseISO(start), end: parseISO(end) };
        const mapDocs = (s: any) => s.docs.map((doc: any) => ({id: doc.id, ...doc.data()}));
        
        const [eSnap, pSnap, lSnap, ncdSnap, dSnap] = await Promise.all([
            getDocs(query(collection(db!, "coverageEntries"), where("userId", "==", uid), limit(1000))),
            getDocs(query(collection(db!, "plans"), where("userId", "==", uid), limit(1000))),
            getDocs(query(collection(db!, "timeLogs"), where("userId", "==", uid), limit(1000))),
            getDocs(query(collection(db!, "nonCallDays"), where("userId", "==", uid), limit(500))),
            getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(1000)))
        ]);
        
        const filterByDate = (docs: any[], field: string) => docs.filter(d => {
            const date = parseISO(d[field]);
            return isValid(date) && isWithinInterval(date, interval);
        });

        setIndividualEntries(filterByDate(mapDocs(eSnap), "coverageDate") as any);
        setIndividualPlans(filterByDate(mapDocs(pSnap), "plannedDate") as any);
        setIndividualTimeLogs(filterByDate(mapDocs(lSnap), "timeIn") as any);
        setIndividualNonCallDays(filterByDate(mapDocs(ncdSnap), "date") as any);
        setIndividualDoctors(mapDocs(dSnap) as any);
    } catch (e: any) {
        console.warn("Individual user fetch limited (Handled):", e.message);
    } finally {
        setLoadingIndividual(false);
    }
  }, [active, isAuthorized]);

  const usedQuantities = useMemo(() => {
    const used: Record<string, number> = {};
    individualEntries.forEach((item) => {
        const process = (n?: string, q?: number) => {
            const key = String(n ?? "").toLowerCase().trim();
            if (key) used[key] = (used[key] || 0) + (Number(q || 0));
        };
        process(item.primarySampleName, item.primaryProductQty);
        process(item.secondarySampleName, item.secondaryProductQty);
        if (item.reminderProducts) item.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
    });
    return used;
  }, [individualEntries]);

  return { 
    allEntries: individualEntries, 
    allDoctors: individualDoctors, 
    allPlans: individualPlans, 
    allTimeLogs: individualTimeLogs, 
    allNonCallDaysIndividual: individualNonCallDays, 
    individualPlanningRequests: [],
    individualUsedQuantities: usedQuantities, 
    individualAvailableMonths: [],
    allNonCallDays, 
    allPlanningRequests, 
    loadingIndividual, 
    loadingApprovals,
    fetchUserData, 
    fetchTeamApprovals,
    updateNonCallDayStatus: async (id: string, status: 'approved' | 'rejected') => {
        try {
            await updateDoc(firestoreDoc(db!, 'nonCallDays', id), { status });
            setAllNonCallDays(prev => prev.map(d => d.id === id ? {...d, status} : d));
            toast({ title: `Request ${status}` });
        } catch (e) {}
    },
    updatePlanningRequestStatus: async (id: string, status: 'approved' | 'rejected') => {
        try {
            await updateDoc(firestoreDoc(db!, 'planningRequests', id), { status });
            setAllPlanningRequests(prev => prev.map(r => r.id === id ? {...r, status} : r));
            toast({ title: `Request ${status}` });
        } catch (e) {}
    }
  };
}
