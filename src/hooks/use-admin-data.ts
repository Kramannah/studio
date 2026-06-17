
"use client"

import { useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, updateDoc, doc as firestoreDoc, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { MANAGER_TEAMS, ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { getMonthRangeISO } from "@/lib/utils";

/**
 * useAdminData - A robust hook for administrative data fetching.
 * Optimized for "Low Cost" by targeting specific months and using UIDs.
 */
export function useAdminData(managerId?: string, userProfiles: Record<string, UserProfile> = {}, active: boolean = true) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  
  const [individualEntries, setIndividualEntries] = useState<CoverageEntry[]>([]);
  const [individualDoctors, setIndividualDoctors] = useState<Doctor[]>([]);
  const [individualPlans, setIndividualPlans] = useState<Plan[]>([]);
  const [individualTimeLogs, setIndividualTimeLogs] = useState<any[]>([]);
  const [individualNonCallDays, setIndividualNonCallDays] = useState<NonCallDay[]>([]);
  const [individualPlanningRequests, setIndividualPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  
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
           ['Admin', 'Manager', 'Marketing', 'HR'].includes(profile?.role || '');
  }, [user, profile]);

  const getManagedUserIds = useCallback((mgrId?: string) => {
    if (!mgrId) return [];
    const hardcoded = MANAGER_TEAMS[mgrId] || [];
    const dynamic = Object.entries(userProfiles)
        .filter(([_, p]) => p.managerId === mgrId)
        .map(([uid, _]) => uid);
    return Array.from(new Set([...hardcoded, ...dynamic]));
  }, [userProfiles]);

  const individualUsedQuantities = useMemo(() => {
    const quantities: Record<string, number> = {};
    individualEntries.forEach(entry => {
        const process = (name?: string, qty?: number) => {
            const safeName = (name ?? "").toLowerCase().trim();
            if (!safeName) return;
            const safeQty = Math.round(Number(qty || 0));
            if (!isNaN(safeQty) && safeQty !== 0) quantities[safeName] = (quantities[safeName] || 0) + safeQty;
        };
        process(entry.primarySampleName, entry.primaryProductQty);
        process(entry.secondarySampleName, entry.secondaryProductQty);
        if (entry.reminderProducts) {
            entry.reminderProducts.forEach(rp => process(rp.sampleName, rp.quantity));
        }
    });
    return quantities;
  }, [individualEntries]);

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
                const snap = await getDocs(query(colRef, limit(1000)));
                return snap.docs.map(d => ({id: d.id, ...d.data()}));
            }
            const chunks = [];
            for (let i = 0; i < filter.length; i += 30) {
                chunks.push(filter.slice(i, i + 30));
            }
            
            const results: any[] = [];
            for (const chunk of chunks) {
                const snap = await getDocs(query(colRef, where("userId", "in", chunk), limit(1000)));
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
   * fetchUserData - Fetches all module data for a specific PMR using their UID.
   * Leverages an index-resilient approach for veteran accounts.
   */
  const fetchUserData = useCallback(async (uid: string, selectedMonth?: string) => {
    if (!uid || !db || !active || !isAuthorized) return;
    setLoadingIndividual(true);
    
    try {
        const { start, end } = getMonthRangeISO(selectedMonth);

        const fetchModule = async (colName: string, dateField: string) => {
            const colRef = collection(db!, colName);
            try {
                // Targeted query for UID + Date Range
                const q = query(
                    colRef, 
                    where("userId", "==", uid), 
                    where(dateField, ">=", start), 
                    where(dateField, "<=", end), 
                    limit(1000)
                );
                const snap = await getDocs(q);
                return snap.docs.map(d => ({id: d.id, ...d.data()}));
            } catch (e: any) {
                // Fallback for missing indexes or veteran accounts with legacy fields
                console.warn(`Query optimization fallback for ${colName}: ${e.message}`);
                const q = query(colRef, where("userId", "==", uid), limit(1500));
                const snap = await getDocs(q);
                return snap.docs
                    .map(d => ({id: d.id, ...d.data()}))
                    .filter((d: any) => {
                        const val = d[dateField] || d.submittedAt || d.date;
                        return val && val >= start && val <= end;
                    });
            }
        };

        // Execute all module fetches in parallel
        const [entries, plans, logs, ncds, doctors, requests] = await Promise.all([
            fetchModule("coverageEntries", "coverageDate"),
            fetchModule("plans", "plannedDate"),
            fetchModule("timeLogs", "timeIn"),
            fetchModule("nonCallDays", "date"),
            getDocs(query(collection(db!, "doctors"), where("userId", "==", uid), limit(3000))).then(s => s.docs.map(d => ({id: d.id, ...d.data()}))),
            getDocs(query(collection(db!, "planningRequests"), where("userId", "==", uid), limit(100))).then(s => s.docs.map(d => ({id: d.id, ...d.data()})))
        ]);

        setIndividualEntries(entries as CoverageEntry[]);
        setIndividualPlans(plans as Plan[]);
        setIndividualTimeLogs(logs as any[]);
        setIndividualNonCallDays(ncds as NonCallDay[]);
        setIndividualDoctors(doctors as Doctor[]);
        setIndividualPlanningRequests(requests as PlanningPermissionRequest[]);
        
        if (selectedMonth) {
            toast({ title: "Data Synchronized", description: `Loaded records for ${selectedMonth}.` });
        }
    } catch (e) {
        console.error("Critical User Data Fetch Error:", e);
        toast({ variant: "destructive", title: "Sync Failed", description: "Database communication failed for this representative." });
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
