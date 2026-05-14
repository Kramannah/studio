
"use client"

import { useEffect, useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, doc, updateDoc, doc as firestoreDoc, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { MANAGER_TEAMS, ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";

export interface TeamSummaryData {
    entries: CoverageEntry[];
    doctors: Doctor[];
    nonCallDays: NonCallDay[];
    timeLogs: TimeLog[];
    plans: Plan[];
    usedQuantities: Record<string, number>;
}

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

  const [allNonCallDays, setAllNonCallDays] = useState<NonCallDay[]>([]);
  const [allPlanningRequests, setAllPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  
  const [teamSummaryData, setTeamSummaryData] = useState<TeamSummaryData | null>(null);
  
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
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

  const isUserManager = useMemo(() => {
    if (!user) return false;
    return Object.keys(MANAGER_TEAMS).includes(user.uid) || profile?.role === 'Manager' || isUserAdmin;
  }, [user, profile, isUserAdmin]);

  const getManagedUserIds = useCallback((mgrId?: string) => {
    if (!mgrId) return [];
    const hardcoded = MANAGER_TEAMS[mgrId] || [];
    const dynamic = Object.entries(userProfiles)
        .filter(([_, p]) => p.managerId === mgrId)
        .map(([uid, _]) => uid);
    return Array.from(new Set([...hardcoded, ...dynamic]));
  }, [userProfiles]);

  const fetchTeamApprovals = useCallback(async () => {
    if (!user || !db || !active || !isUserManager) return;
    
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
                return (await getDocs(query(colRef, limit(10000)))).docs.map(d => ({id: d.id, ...d.data()}));
            }
            
            const chunks = [];
            for (let i = 0; i < filter.length; i += 10) chunks.push(filter.slice(i, i+10));
            const results = await Promise.all(chunks.map(c => getDocs(query(colRef, where("userId", "in", c), limit(5000)))));
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
  }, [user, managerId, getManagedUserIds, active, isUserManager]);

  const fetchTeamSummary = useCallback(async () => {
    if (!managerId || !db || !active || !isUserManager) return;

    setLoadingSummary(true);
    try {
        const userFilter = getManagedUserIds(managerId);
        if (userFilter.length === 0) {
            setTeamSummaryData(null);
            setLoadingSummary(false);
            return;
        }

        const fetchAllForUsers = async (ids: string[]) => {
            const chunks = [];
            for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i+10));
            
            const results = await Promise.all(chunks.map(async (c) => {
                const mapDocs = (s: any) => s.docs.map((d: any) => ({id: d.id, ...d.data()}));

                const [e, l, d, ncd, p] = await Promise.all([
                    getDocs(query(collection(db!, "coverageEntries"), where("userId", "in", c), limit(20000))),
                    getDocs(query(collection(db!, "timeLogs"), where("userId", "in", c), limit(10000))),
                    getDocs(query(collection(db!, "doctors"), where("userId", "in", c), limit(10000))),
                    getDocs(query(collection(db!, "nonCallDays"), where("userId", "in", c), limit(5000))),
                    getDocs(query(collection(db!, "plans"), where("userId", "in", c), limit(10000)))
                ]);

                return { 
                    entries: mapDocs(e), 
                    logs: mapDocs(l), 
                    doctors: mapDocs(d), 
                    ncds: mapDocs(ncd), 
                    plans: mapDocs(p) 
                };
            }));

            return results.reduce((acc, curr) => ({
                entries: [...acc.entries, ...curr.entries],
                logs: [...acc.logs, ...curr.logs],
                doctors: [...acc.doctors, ...curr.doctors],
                ncds: [...acc.ncds, ...curr.ncds],
                plans: [...acc.plans, ...curr.plans],
            }), { entries: [], logs: [], doctors: [], ncds: [], plans: [] } as any);
        };

        const combined = await fetchAllForUsers(userFilter);
        
        const used: Record<string, number> = {};
        combined.entries.forEach((e: CoverageEntry) => {
            const process = (n?: string, q?: number) => {
                const key = String(n ?? "").toLowerCase().trim();
                if (key) used[key] = (used[key] || 0) + (Number(q || 0));
            };
            process(e.primarySampleName, e.primaryProductQty);
            process(e.secondarySampleName, e.secondaryProductQty);
            if (e.reminderProducts) {
                e.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
            }
        });

        setTeamSummaryData({ 
            entries: combined.entries, 
            timeLogs: combined.logs, 
            doctors: combined.doctors, 
            nonCallDays: combined.ncds, 
            plans: combined.plans, 
            usedQuantities: used
        } as TeamSummaryData);
    } catch (e) {
        console.error("Team summary fetch error:", e);
    } finally {
        setLoadingSummary(false);
    }
  }, [managerId, getManagedUserIds, active, isUserManager]);

  const fetchUserData = useCallback(async (uid: string) => {
    if (!uid || !db || !active || !isUserManager) return;

    setLoadingIndividual(true);
    try {
        const [e, d, p, l, ncd, r] = await Promise.all([
            getDocs(query(collection(db!, "coverageEntries"), where("userId", "==", uid), limit(10000))),
            getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(10000))),
            getDocs(query(collection(db!, "plans"), where("userId", "==", uid), limit(10000))),
            getDocs(query(collection(db!, "timeLogs"), where("userId", "==", uid), limit(5000))),
            getDocs(query(collection(db!, "nonCallDays"), where("userId", "==", uid), limit(2000))),
            getDocs(query(collection(db!, "planningRequests"), where("userId", "==", uid), limit(2000)))
        ]);

        const mapDocs = (s: any) => s.docs.map((doc: any) => ({id: doc.id, ...doc.data()}));
        
        const entries = mapDocs(e) as CoverageEntry[];
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

        setAllEntries(entries); 
        setAllDoctors(mapDocs(d) as any); 
        setAllPlans(mapDocs(p) as any);
        setAllTimeLogs(mapDocs(l) as any); 
        setAllNonCallDaysIndividual(mapDocs(ncd) as any);
        setIndividualPlanningRequests(mapDocs(r) as any); 
        setIndividualUsedQuantities(used);
    } catch (e) {
        console.error("Individual data fetch failed:", e);
    } finally {
        setLoadingIndividual(false);
    }
  }, [active, isUserManager]);

  return { 
    allEntries, allDoctors, allPlans, allTimeLogs, allNonCallDaysIndividual, 
    individualPlanningRequests, individualUsedQuantities, allNonCallDays, allPlanningRequests, 
    teamSummaryData, loadingSummary, loadingIndividual, loadingApprovals,
    fetchUserData, fetchTeamSummary, fetchTeamApprovals,
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
