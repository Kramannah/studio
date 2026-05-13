
"use client"

import { useEffect, useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc, addDoc, writeBatch, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { MANAGER_TEAMS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { getStartOfYearISO } from "@/lib/utils";

export interface TeamSummaryData {
    entries: CoverageEntry[];
    doctors: Doctor[];
    nonCallDays: NonCallDay[];
    timeLogs: TimeLog[];
    plans: Plan[];
    usedQuantities: Record<string, number>;
}

// PERSISTENCE CACHE: Shared across Admin Dashboard tabs to prevent redundant reads
const teamSummaryCache: Record<string, { data: TeamSummaryData, timestamp: number }> = {};
const CACHE_LIMIT = 5 * 60 * 1000; // 5 Minutes

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
  
  const [loadingApprovals, setLoadingApprovals] = useState(false);
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

    setLoadingApprovals(true);
    try {
        const fetchCol = async (name: string, filter: string[] | null) => {
            const colRef = collection(db!, name);
            if (!filter) return (await getDocs(query(colRef, limit(200)))).docs.map(d => ({id: d.id, ...d.data()}));
            
            const chunks = [];
            for (let i = 0; i < filter.length; i += 10) chunks.push(filter.slice(i, i+10));
            const results = await Promise.all(chunks.map(c => getDocs(query(colRef, where("userId", "in", c), limit(100)))));
            return results.flatMap(s => s.docs.map(d => ({id: d.id, ...d.data()})));
        };

        const [ncd, pr] = await Promise.all([fetchCol("nonCallDays", userFilter), fetchCol("planningRequests", userFilter)]);
        
        setAllNonCallDays((ncd as any).sort((a: any, b: any) => safeToDateISO(b.date).localeCompare(safeToDateISO(a.date))));
        setAllPlanningRequests((pr as any).sort((a: any, b: any) => safeToDateISO(b.requestedAt).localeCompare(safeToDateISO(a.requestedAt))));
    } catch (e) {
        console.warn("Approvals load failed", e);
    } finally {
        setLoadingApprovals(false);
    }
  }, [user, managerId, getManagedUserIds, active]);

  const fetchTeamSummary = useCallback(async (forceRefresh = false) => {
    if (!managerId || !db || !active) return;

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
                // Increased limit to 3000 per 10 users to ensure completeness for the year 2026
                const baseQuery = (n: string) => query(collection(db!, n), where("userId", "in", c), limit(3000));
                
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
            usedQuantities: used
        } as TeamSummaryData;

        teamSummaryCache[managerId] = { data: finalData, timestamp: Date.now() };
        setTeamSummaryData(finalData);
    } catch (e) {
        console.warn("District summary load failed", e);
    } finally {
        setLoadingSummary(false);
    }
  }, [managerId, getManagedUserIds, active]);

  const fetchUserData = useCallback(async (uid: string) => {
    if (!uid || !db || !active) return;
    
    setLoadingIndividual(true);
    try {
        const currentYearStart = getStartOfYearISO();
        // Increased limit to 2500 per individual PMR to ensure 2026 completeness
        const f = async (n: string) => (await getDocs(query(collection(db!, n), where("userId", "==", uid), limit(2500)))).docs.map(d => ({id: d.id, ...d.data()}));
        
        const [e, d, p, l, ncd, r] = await Promise.all([
            f("coverageEntries"), 
            f("doctors"), 
            f("plans"), 
            f("timeLogs"), 
            f("nonCallDays"), 
            f("planningRequests")
        ]);
        
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
        console.warn("Individual drill-down failed", e);
    } finally {
        setLoadingIndividual(false);
    }
  }, [active]);

  return { 
    allEntries, allDoctors, allPlans, allTimeLogs, allNonCallDaysIndividual, 
    individualPlanningRequests, individualUsedQuantities, allNonCallDays, allPlanningRequests, 
    teamSummaryData, loadingSummary, loadingIndividual, loadingApprovals,
    fetchUserData, fetchTeamSummary, fetchTeamApprovals,
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
    }
  };
}
