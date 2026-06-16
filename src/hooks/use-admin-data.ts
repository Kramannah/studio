"use client"

import { useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, updateDoc, doc as firestoreDoc, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { MANAGER_TEAMS, ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, PlanningPermissionRequest, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";

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
           ADMIN_EMAILS.some(e => e.toLowerCase() === email) ||
           profile?.role === 'Admin' || profile?.role === 'Manager' || profile?.role === 'Marketing' || profile?.role === 'HR';
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
            try {
                if (!filter) {
                    const snap = await getDocs(query(colRef, limit(500)));
                    return snap.docs.map(d => ({id: d.id, ...d.data()}));
                }
                const chunks = [];
                for (let i = 0; i < filter.length; i += 10) chunks.push(filter.slice(i, i+10));
                const results = await Promise.all(chunks.map(c => getDocs(query(colRef, where("userId", "in", c), limit(500)))));
                return results.flatMap(s => s.docs.map(d => ({id: d.id, ...d.data()})));
            } catch (e) {
                console.warn(`Fetch ${name} failed:`, e);
                return [];
            }
        };

        const [ncd, pr] = await Promise.all([fetchCol("nonCallDays", userFilter), fetchCol("planningRequests", userFilter)]);
        setAllNonCallDays(ncd as any);
        setAllPlanningRequests(pr as any);
    } catch (e) {
        console.warn("Approval fetch error", e);
    } finally { setLoadingApprovals(false); }
  }, [user, managerId, getManagedUserIds, active, isAuthorized]);

  const fetchUserData = useCallback(async (uid: string) => {
    if (!uid || !db || !active || !isAuthorized) return;
    setLoadingIndividual(true);
    
    const mapDocs = (s: any) => s.docs.map((doc: any) => ({id: doc.id, ...doc.data()}));
    const fetchSafe = async (name: string) => {
        try {
            const snap = await getDocs(query(collection(db!, name), where("userId", "==", uid), limit(1000)));
            return mapDocs(snap);
        } catch (e) {
            console.warn(`Safe fetch for ${name} failed:`, e);
            return [];
        }
    };

    try {
        // Fetch each independently to prevent total timeout crash
        const entries = await fetchSafe("coverageEntries");
        setIndividualEntries(entries as any);
        
        const plans = await fetchSafe("plans");
        setIndividualPlans(plans as any);
        
        const logs = await fetchSafe("timeLogs");
        setIndividualTimeLogs(logs as any);
        
        const ncds = await fetchSafe("nonCallDays");
        setIndividualNonCallDays(ncds as any);
        
        const docs = await fetchSafe("doctors");
        setIndividualDoctors(docs as any);
        
    } catch (e: any) {
        console.warn("Individual user fetch aggregated error:", e);
    } finally {
        setLoadingIndividual(false);
    }
  }, [active, isAuthorized]);

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
