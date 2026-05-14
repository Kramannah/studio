
"use client"

import { useEffect, useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, doc, updateDoc, doc as firestoreDoc, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { MANAGER_TEAMS, ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
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

const adminDataCache: {
    summary: Record<string, { data: TeamSummaryData, timestamp: number }>,
    individual: Record<string, { data: any, timestamp: number }>,
    approvals: Record<string, { data: any, timestamp: number }>
} = {
    summary: {},
    individual: {},
    approvals: {}
};

const CACHE_TTL = 15 * 60 * 1000;
const FETCH_LOCKS: Record<string, boolean> = {};

const safeToDateISO = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val && typeof val.toDate === 'function') return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    return String(val);
};

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
    if (!user || !db || !active || !isUserManager || FETCH_LOCKS['approvals']) return;
    
    const cacheKey = managerId || 'global';
    if (adminDataCache.approvals[cacheKey] && (Date.now() - adminDataCache.approvals[cacheKey].timestamp < CACHE_TTL)) {
        const cached = adminDataCache.approvals[cacheKey].data;
        setAllNonCallDays(cached.ncd);
        setAllPlanningRequests(cached.pr);
        return;
    }

    FETCH_LOCKS['approvals'] = true;
    setLoadingApprovals(true);
    try {
        let userFilter: string[] | null = null;
        if (managerId) {
            userFilter = getManagedUserIds(managerId);
            if (userFilter.length === 0) {
                setLoadingApprovals(false);
                FETCH_LOCKS['approvals'] = false;
                return;
            }
        }

        const fetchCol = async (name: string, filter: string[] | null) => {
            const colRef = collection(db!, name);
            if (!filter) return (await getDocs(query(colRef, limit(100)))).docs.map(d => ({id: d.id, ...d.data()}));
            
            const chunks = [];
            for (let i = 0; i < filter.length; i += 10) chunks.push(filter.slice(i, i+10));
            const results = await Promise.all(chunks.map(c => getDocs(query(colRef, where("userId", "in", c), limit(50)))));
            return results.flatMap(s => s.docs.map(d => ({id: d.id, ...d.data()})));
        };

        const [ncd, pr] = await Promise.all([fetchCol("nonCallDays", userFilter), fetchCol("planningRequests", userFilter)]);
        
        const sortedNcd = (ncd as any).sort((a: any, b: any) => safeToDateISO(b.date).localeCompare(safeToDateISO(a.date)));
        const sortedPr = (pr as any).sort((a: any, b: any) => safeToDateISO(b.requestedAt).localeCompare(safeToDateISO(a.requestedAt)));
        
        setAllNonCallDays(sortedNcd);
        setAllPlanningRequests(sortedPr);
        adminDataCache.approvals[cacheKey] = { data: { ncd: sortedNcd, pr: sortedPr }, timestamp: Date.now() };
    } catch (e) {
        console.warn("Approvals load limited:", e);
    } finally {
        setLoadingApprovals(false);
        FETCH_LOCKS['approvals'] = false;
    }
  }, [user, managerId, getManagedUserIds, active, isUserManager]);

  const fetchTeamSummary = useCallback(async (forceRefresh = false) => {
    if (!managerId || !db || !active || !isUserManager || FETCH_LOCKS[`summary_${managerId}`]) return;

    if (!forceRefresh && adminDataCache.summary[managerId] && (Date.now() - adminDataCache.summary[managerId].timestamp < CACHE_TTL)) {
        setTeamSummaryData(adminDataCache.summary[managerId].data);
        return;
    }

    FETCH_LOCKS[`summary_${managerId}`] = true;
    setLoadingSummary(true);
    try {
        const userFilter = getManagedUserIds(managerId);
        if (userFilter.length === 0) {
            setTeamSummaryData(null);
            setLoadingSummary(false);
            FETCH_LOCKS[`summary_${managerId}`] = false;
            return;
        }

        const currentYearStart = getStartOfYearISO();

        const fetchAllForUsers = async (ids: string[]) => {
            const chunks = [];
            for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i+10));
            
            const results = await Promise.all(chunks.map(async (c) => {
                const baseQuery = (n: string) => query(collection(db!, n), where("userId", "in", c), limit(1000));
                
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
            if (e.reminderProducts) {
                e.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
            }
        });

        const finalData = { 
            entries: combined.entries, 
            timeLogs: combined.logs, 
            doctors: combined.doctors, 
            nonCallDays: combined.ncds, 
            plans: combined.plans, 
            usedQuantities: used
        } as TeamSummaryData;

        adminDataCache.summary[managerId] = { data: finalData, timestamp: Date.now() };
        setTeamSummaryData(finalData);
    } catch (e: any) {
        if (e.code === 'resource-exhausted') {
            toast({ variant: "destructive", title: "Quota Limit Reached", description: "Database access paused. Please try again later." });
        }
    } finally {
        setLoadingSummary(false);
        FETCH_LOCKS[`summary_${managerId}`] = false;
    }
  }, [managerId, getManagedUserIds, active, isUserManager, toast]);

  const fetchUserData = useCallback(async (uid: string) => {
    if (!uid || !db || !active || !isUserManager || FETCH_LOCKS[`individual_${uid}`]) return;
    
    if (adminDataCache.individual[uid] && (Date.now() - adminDataCache.individual[uid].timestamp < CACHE_TTL)) {
        const cached = adminDataCache.individual[uid].data;
        setAllEntries(cached.entries);
        setAllDoctors(cached.doctors);
        setAllPlans(cached.plans);
        setAllTimeLogs(cached.logs);
        setAllNonCallDaysIndividual(cached.ncds);
        setIndividualPlanningRequests(cached.requests);
        setIndividualUsedQuantities(cached.used);
        return;
    }

    FETCH_LOCKS[`individual_${uid}`] = true;
    setLoadingIndividual(true);
    try {
        const currentYearStart = getStartOfYearISO();
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
            if (item.reminderProducts) {
                item.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
            }
        });

        const packet = {
            entries: filteredEntries,
            doctors: d as any,
            plans: filterYear(p, 'plannedDate'),
            logs: filterYear(l, 'timeIn'),
            ncds: filterYear(ncd, 'date'),
            requests: r as any,
            used
        };

        setAllEntries(packet.entries); 
        setAllDoctors(packet.doctors); 
        setAllPlans(packet.plans);
        setAllTimeLogs(packet.logs); 
        setAllNonCallDaysIndividual(packet.ncds);
        setIndividualPlanningRequests(packet.requests); 
        setIndividualUsedQuantities(packet.used);

        adminDataCache.individual[uid] = { data: packet, timestamp: Date.now() };
    } catch (e) {
        console.warn("Individual data fetch failed:", e);
    } finally {
        setLoadingIndividual(false);
        FETCH_LOCKS[`individual_${uid}`] = false;
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
