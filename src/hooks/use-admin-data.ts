
"use client"

import { useEffect, useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, updateDoc, doc as firestoreDoc, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { MANAGER_TEAMS, ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { parseISO, isValid, isWithinInterval } from "date-fns";
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
        
        const fetchColSafe = async (name: string, filter: string[] | null) => {
            try {
                const colRef = collection(db!, name);
                if (!filter) {
                    const snap = await getDocs(query(colRef, limit(1000)));
                    return snap.docs.map(d => ({id: d.id, ...d.data()}));
                }
                const chunks = [];
                for (let i = 0; i < filter.length; i += 10) chunks.push(filter.slice(i, i+10));
                const results = await Promise.all(chunks.map(c => getDocs(query(colRef, where("userId", "in", c), limit(1000)))));
                return results.flatMap(s => s.docs.map(d => ({id: d.id, ...d.data()})));
            } catch (err) {
                console.warn(`Approvals fetch timed out or failed for ${name}:`, err);
                return [];
            }
        };

        const [ncd, pr] = await Promise.all([
            fetchColSafe("nonCallDays", userFilter), 
            fetchColSafe("planningRequests", userFilter)
        ]);
        
        setAllNonCallDays(ncd as any);
        setAllPlanningRequests(pr as any);
    } catch (e) {
        console.warn("Team approvals process error:", e);
    } finally { setLoadingApprovals(false); }
  }, [user, managerId, getManagedUserIds, active, isAuthorized]);

  const fetchUserData = useCallback(async (uid: string, monthStr?: string, force = false) => {
    if (!uid || !db || !active || !isAuthorized) return;
    setLoadingIndividual(true);
    try {
        const { start, end } = getMonthRangeISO(monthStr);
        const interval = { start: parseISO(start), end: parseISO(end) };
        const mapDocs = (s: any) => s.docs.map((doc: any) => ({id: doc.id, ...doc.data()}));
        
        const filterByDate = (docs: any[], field: string) => docs.filter(d => {
            const dateStr = d[field];
            if (!dateStr) return false;
            const date = parseISO(dateStr);
            return isValid(date) && isWithinInterval(date, interval);
        });

        // Wrapper to handle individual query timeouts/errors without failing the whole load
        const getSafeDocs = async (name: string, qLimit: number = 1000) => {
            try {
                const q = query(collection(db!, name), where("userId", "==", uid), limit(qLimit));
                const snap = await getDocs(q);
                return mapDocs(snap);
            } catch (err) {
                console.warn(`Individual fetch timed out or failed for ${name}:`, err);
                return [];
            }
        };
        
        const [eDocs, pDocs, lDocs, ncdDocs, dDocs] = await Promise.all([
            getSafeDocs("coverageEntries", 1000),
            getSafeDocs("plans", 1000),
            getSafeDocs("timeLogs", 1000),
            getSafeDocs("nonCallDays", 500),
            getSafeDocs("doctors", 1000)
        ]);
        
        setIndividualEntries(filterByDate(eDocs, "coverageDate") as any);
        setIndividualPlans(filterByDate(pDocs, "plannedDate") as any);
        setIndividualTimeLogs(filterByDate(lDocs, "timeIn") as any);
        setIndividualNonCallDays(filterByDate(ncdDocs, "date") as any);
        setIndividualDoctors(dDocs as any);
    } catch (e: any) {
        console.warn("Individual user fetch failure:", e);
    } finally {
        setLoadingIndividual(false);
    }
  }, [active, isAuthorized]);

  const usedQuantities = useMemo(() => {
    const used: Record<string, number> = {};
    individualEntries.forEach((item) => {
        if (!item) return;
        const process = (n?: string, q?: number) => {
            const key = String(n ?? "").toLowerCase().trim();
            if (key) used[key] = (used[key] || 0) + (Number(q || 0));
        };
        process(item.primarySampleName, item.primaryProductQty);
        process(item.secondarySampleName, item.secondaryProductQty);
        if (Array.isArray(item.reminderProducts)) {
            item.reminderProducts.forEach(rp => {
                if (rp && rp.sampleName) process(rp.sampleName, rp.quantity);
            });
        }
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
