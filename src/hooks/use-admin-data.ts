
"use client"

import { useEffect, useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc, addDoc, writeBatch, limit, orderBy, startAfter } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { MANAGER_TEAMS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest, MarketingSample, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { getStartOfYearISO } from "@/lib/utils";

export interface TeamSummaryData {
    entries: CoverageEntry[];
    doctors: Doctor[];
    nonCallDays: NonCallDay[];
    timeLogs: TimeLog[];
    plans: Plan[];
    marketingSamples: MarketingSample[];
    usedQuantities: Record<string, number>;
}

// PERSISTENCE CACHE: Lives outside the hook to save Firestore reads
const teamSummaryCache: Record<string, { data: TeamSummaryData, timestamp: number }> = {};
const CACHE_LIMIT = 15 * 60 * 1000; // 15 Minutes

const safeToDateISO = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val && typeof val.toDate === 'function') return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    return String(val);
};

export function useAdminData(managerId?: string, userProfiles: Record<string, UserProfile> = {}, active: boolean = true) {
  const { user } = useAuth();
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
  
  const [loading, setLoading] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingIndividual, setLoadingIndividual] = useState(false);

  const getManagedUserIds = useCallback((mgrId?: string) => {
    if (!mgrId) return [];
    const hardcoded = MANAGER_TEAMS[mgrId] || [];
    const dynamic = Object.entries(userProfiles)
        .filter(([_, p]) => p.managerId === mgrId)
        .map(([uid, _]) => uid);
    return Array.from(new Set([...hardcoded, ...dynamic]));
  }, [userProfiles]);

  const fetchTeamApprovals = useCallback(async () => {
    if (!user || !db || !active) return;
    
    let userFilter: string[] | null = null;
    if (managerId) {
      userFilter = getManagedUserIds(managerId);
      if (userFilter.length === 0) return;
    }

    setLoading(true);
    try {
        const fetchCol = async (name: string, filter: string[] | null) => {
            const colRef = collection(db!, name);
            if (!filter) return (await getDocs(query(colRef, limit(200)))).docs.map(d => ({id: d.id, ...d.data()}));
            
            const chunks = [];
            for (let i = 0; i < filter.length; i += 10) chunks.push(filter.slice(i, i+10));
            const results = await Promise.all(chunks.map(c => getDocs(query(colRef, where("userId", "in", c)))));
            return results.flatMap(s => s.docs.map(d => ({id: d.id, ...d.data()})));
        };

        const [ncd, pr] = await Promise.all([fetchCol("nonCallDays", userFilter), fetchCol("planningRequests", userFilter)]);
        
        setAllNonCallDays((ncd as any).sort((a: any, b: any) => safeToDateISO(b.date).localeCompare(safeToDateISO(a.date))));
        setAllPlanningRequests((pr as any).sort((a: any, b: any) => safeToDateISO(b.requestedAt).localeCompare(safeToDateISO(a.requestedAt))));
    } catch (e) {
        console.warn("Approvals fetch error:", e);
    } finally {
        setLoading(false);
    }
  }, [user, managerId, getManagedUserIds, active]);

  useEffect(() => {
    if (active) {
        fetchTeamApprovals();
    }
  }, [fetchTeamApprovals, active]);

  const fetchTeamSummary = useCallback(async (forceRefresh = false) => {
    if (!managerId || !db) return;

    if (!forceRefresh && teamSummaryCache[managerId] && (Date.now() - teamSummaryCache[managerId].timestamp < CACHE_LIMIT)) {
        setTeamSummaryData(teamSummaryCache[managerId].data);
        return;
    }

    setLoadingSummary(true);
    try {
        const userFilter = getManagedUserIds(managerId);
        if (userFilter.length === 0) {
            setTeamSummaryData(null);
            return;
        }

        const currentYearStart = getStartOfYearISO();

        const fetchAllForUsers = async (ids: string[]) => {
            const chunks = [];
            for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i+10));
            
            const results = await Promise.all(chunks.map(async (c) => {
                const baseQuery = (n: string) => query(collection(db!, n), where("userId", "in", c));
                
                const [e, l, d, ncd, p] = await Promise.all([
                    getDocs(baseQuery("coverageEntries")),
                    getDocs(baseQuery("timeLogs")),
                    getDocs(baseQuery("doctors")),
                    getDocs(baseQuery("nonCallDays")),
                    getDocs(baseQuery("plans"))
                ]);

                const mapDocs = (s: any, dateField?: string) => s.docs.map((d: any) => ({id: d.id, ...d.data()}))
                    .filter((item: any) => {
                        if (!dateField) return true;
                        const val = item[dateField];
                        return val && val >= currentYearStart;
                    });

                return { 
                    entries: mapDocs(e, 'submittedAt'), 
                    logs: mapDocs(l, 'timeIn'), 
                    doctors: mapDocs(d), 
                    ncds: mapDocs(ncd, 'date'), 
                    plans: mapDocs(p, 'plannedDate') 
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
                if (key) used[key] = (used[key] || 0) + Math.round(Number(q || 0));
            };
            process(e.primarySampleName, e.primaryProductQty);
            process(e.secondarySampleName, e.secondaryProductQty);
        });

        const finalData = { 
            entries: combined.entries, 
            timeLogs: combined.logs, 
            doctors: combined.doctors, 
            nonCallDays: combined.ncds, 
            plans: combined.plans, 
            usedQuantities: used, 
            marketingSamples: [] 
        } as any;

        teamSummaryCache[managerId] = { data: finalData, timestamp: Date.now() };
        setTeamSummaryData(finalData);
    } catch (e) {
        console.warn("District aggregation error:", e);
    } finally {
        setLoadingSummary(false);
    }
  }, [managerId, getManagedUserIds]);

  const fetchUserData = useCallback(async (uid: string) => {
    if (!uid || !db) return;
    
    setLoadingIndividual(true);
    try {
        const currentYearStart = getStartOfYearISO();
        const f = async (n: string) => (await getDocs(query(collection(db!, n), where("userId", "==", uid)))).docs.map(d => ({id: d.id, ...d.data()}));
        
        const [e, d, p, l, ncd, r] = await Promise.all([
            f("coverageEntries"), 
            f("doctors"), 
            f("plans"), 
            f("timeLogs"), 
            f("nonCallDays"), 
            f("planningRequests")
        ]);
        
        // Memory filter for current year to avoid index requirements
        const filterYear = (list: any[], field: string) => list.filter(item => (item[field] || "") >= currentYearStart);

        const filteredEntries = filterYear(e, 'submittedAt');
        
        const used: Record<string, number> = {};
        filteredEntries.forEach((item: CoverageEntry) => {
            const process = (n?: string, q?: number) => {
                const key = String(n ?? "").toLowerCase().trim();
                if (key) used[key] = (used[key] || 0) + Math.round(Number(q || 0));
            };
            process(item.primarySampleName, item.primaryProductQty);
            process(item.secondarySampleName, item.secondaryProductQty);
        });

        setAllEntries(filteredEntries); 
        setAllDoctors(d as any); 
        setAllPlans(filterYear(p, 'plannedDate'));
        setAllTimeLogs(filterYear(l, 'timeIn')); 
        setAllNonCallDaysIndividual(filterYear(ncd, 'date'));
        setIndividualPlanningRequests(r as any); 
        setIndividualUsedQuantities(used);
    } catch (e) {
        console.warn("Individual PMR drill-down error:", e);
    } finally {
        setLoadingIndividual(false);
    }
  }, []);

  return { 
    allEntries, allDoctors, allPlans, allTimeLogs, allNonCallDaysIndividual, 
    individualPlanningRequests, individualUsedQuantities, allNonCallDays, allPlanningRequests, 
    teamSummaryData, loading, loadingSummary, loadingIndividual, 
    fetchUserData, fetchTeamSummary: (force = false) => fetchTeamSummary(force),
    updateNonCallDayStatus: async (id: string, status: 'approved' | 'rejected') => {
        const ref = doc(db!, 'nonCallDays', id);
        await updateDoc(ref, { status });
        setAllNonCallDays(prev => prev.map(d => d.id === id ? {...d, status} : d));
        toast({ title: `Request ${status}` });
    },
    updatePlanningRequestStatus: async (id: string, status: 'approved' | 'rejected') => {
        const ref = doc(db!, 'planningRequests', id);
        await updateDoc(ref, { status });
        setAllPlanningRequests(prev => prev.map(r => r.id === id ? {...r, status} : r));
        toast({ title: `Request ${status}` });
    },
    deleteEntry: async (id: string) => {
        await deleteDoc(doc(db!, "coverageEntries", id));
        setAllEntries(prev => prev.filter(e => e.id !== id));
        toast({ variant: 'destructive', title: "Deleted" });
    },
    addDoctor: async (data: any) => {
        const dr = await addDoc(collection(db!, "doctors"), data);
        setAllDoctors(prev => [...prev, { id: dr.id, ...data }]);
    },
    updateDoctor: async (data: any) => {
        const { id, userId, ...upd } = data;
        await updateDoc(doc(db!, "doctors", id), upd);
        setAllDoctors(prev => prev.map(d => d.id === id ? data : d));
    },
    deleteDoctor: async (id: string) => {
        await deleteDoc(doc(db!, "doctors", id));
        setAllDoctors(prev => prev.filter(d => d.id !== id));
    },
    deleteDoctorsBulk: async (ids: string[]) => {
        const batch = writeBatch(db!);
        ids.forEach(id => batch.delete(doc(db!, "doctors", id)));
        await batch.commit();
        setAllDoctors(prev => prev.filter(d => !ids.includes(d.id)));
    },
    addDoctorsBulk: async (data: any[]) => {
        const batch = writeBatch(db!);
        data.forEach(d => batch.set(doc(collection(db!, "doctors")), d));
        await batch.commit();
    }
  };
}
