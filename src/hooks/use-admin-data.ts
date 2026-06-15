"use client"

import { useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, updateDoc, doc as firestoreDoc, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { MANAGER_TEAMS, ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { isValid, format } from "date-fns";
import { parseAnyDate } from "@/lib/utils";

export function useAdminData(managerId?: string, userProfiles: Record<string, UserProfile> = {}, active: boolean = true) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  
  const [individualEntries, setIndividualEntries] = useState<CoverageEntry[]>([]);
  const [individualDoctors, setIndividualDoctors] = useState<Doctor[]>([]);
  const [individualPlans, setIndividualPlans] = useState<Plan[]>([]);
  const [individualTimeLogs, setIndividualTimeLogs] = useState<any[]>([]);
  const [individualNonCallDays, setIndividualNonCallDays] = useState<NonCallDay[]>([]);
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
        console.warn("Approval fetch error", e);
    } finally { setLoadingApprovals(false); }
  }, [user, managerId, getManagedUserIds, active, isAuthorized]);

  const fetchUserData = useCallback(async (uid: string, monthStr?: string, force: boolean = false) => {
    if (!uid || !db || !active || !isAuthorized) return;
    
    if (!force && individualEntries.length > 0 && individualEntries[0].userId === uid) {
        return;
    }

    setLoadingIndividual(true);
    
    try {
        const mapDocs = (s: any) => s.docs.map((doc: any) => ({id: doc.id, ...doc.data()}));

        // Fetch using the specific PMR UID with fallback for legacy identifier fields
        const fetchWithFallback = async (collectionName: string) => {
            const colRef = collection(db!, collectionName);
            // Try standard 'userId'
            let snap = await getDocs(query(colRef, where("userId", "==", uid), limit(5000)));
            // If nothing found, try legacy 'uid' field
            if (snap.empty) {
                snap = await getDocs(query(colRef, where("uid", "==", uid), limit(5000)));
            }
            return snap;
        };

        const [eSnap, pSnap, lSnap, nSnap, dSnap] = await Promise.all([
            fetchWithFallback("coverageEntries"),
            fetchWithFallback("plans"),
            fetchWithFallback("timeLogs"),
            fetchWithFallback("nonCallDays"),
            fetchWithFallback("doctors")
        ]);

        const allEntries = mapDocs(eSnap);
        setIndividualEntries(allEntries as any);
        
        // Build dynamic month list from all historical records found for this UID
        const months = new Set<string>();
        allEntries.forEach((d: any) => {
            const date = parseAnyDate(d); // Uses the hunt logic in utils
            if (date && isValid(date)) {
                months.add(format(date, 'yyyy-MM'));
            }
        });
        months.add(format(new Date(), 'yyyy-MM'));
        setIndividualAvailableMonths(Array.from(months).sort((a,b) => b.localeCompare(a)));

        setIndividualPlans(mapDocs(pSnap) as any);
        setIndividualTimeLogs(mapDocs(lSnap) as any);
        setIndividualNonCallDays(mapDocs(nSnap) as any);
        setIndividualDoctors(mapDocs(dSnap) as any);
        
    } catch (e: any) {
        console.warn("Individual user fetch error handled:", e);
    } finally {
        setLoadingIndividual(false);
    }
  }, [active, isAuthorized, individualEntries]);

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
    individualAvailableMonths,
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
