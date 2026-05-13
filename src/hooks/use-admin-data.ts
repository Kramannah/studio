
"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc, addDoc, writeBatch, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest, MarketingSample, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { getQueryStartDateISO } from "@/lib/utils";

export interface TeamSummaryData {
    entries: CoverageEntry[];
    doctors: Doctor[];
    nonCallDays: NonCallDay[];
    timeLogs: TimeLog[];
    plans: Plan[];
    marketingSamples: MarketingSample[];
    usedQuantities: Record<string, number>;
}

const safeToDateISO = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val && typeof val.toDate === 'function') return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    return String(val);
};

// In-memory cache to prevent redundant reads within a single session
const userDataCache: Record<string, { timestamp: number, data: any }> = {};
const CACHE_TTL = 300000; // 5 minutes

export function useAdminData(managerId?: string, userProfiles: Record<string, UserProfile> = {}) {
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
  
  const [loading, setLoading] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingIndividual, setLoadingIndividual] = useState(false);

  const fetchInProgress = useRef<string | null>(null);

  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    const normalizedEmail = (user.email ?? "").toString().toLowerCase().trim();
    return ADMIN_UIDS.includes(user.uid) || 
           normalizedEmail === 'mbustamante@hovidinc.com' || 
           ADMIN_EMAILS.some(e => (e ?? "").toString().toLowerCase().trim() === normalizedEmail) ||
           profile?.role === 'Admin';
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
    if (!user || !db) return;

    let userFilter: string[] | null = null;
    if (managerId) {
      userFilter = getManagedUserIds(managerId);
      if (userFilter.length === 0) {
          setAllNonCallDays([]);
          setAllPlanningRequests([]);
          return;
      }
    } else if (!isUserAdmin) {
      return;
    }

    setLoading(true);
    try {
        const fetchCollection = async (collName: string, userIds: string[] | null): Promise<any[]> => {
            try {
                let q;
                const colRef = collection(db!, collName);
                if (userIds === null) {
                    q = query(colRef, limit(500));
                } else if (userIds.length > 0) {
                    const chunks: string[][] = [];
                    for (let i = 0; i < userIds.length; i += 10) {
                        chunks.push(userIds.slice(i, i + 10));
                    }
                    const snapshots = await Promise.all(chunks.map(chunk => 
                        getDocs(query(colRef, where("userId", "in", chunk), limit(200)))
                    ));
                    return snapshots.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));
                } else {
                    return [];
                }
                const snapshot = await getDocs(q);
                return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (err) {
                return [];
            }
        };
      
      const [ncdRes, prRes] = await Promise.all([
          fetchCollection("nonCallDays", userFilter),
          fetchCollection("planningRequests", userFilter)
      ]);
      
      setAllNonCallDays(ncdRes.sort((a, b) => safeToDateISO(b.date).localeCompare(safeToDateISO(a.date))));
      setAllPlanningRequests(prRes.sort((a, b) => safeToDateISO(b.requestedAt).localeCompare(safeToDateISO(a.requestedAt))));
    } catch (err: any) {
        console.error("Team approvals fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, [user, managerId, isUserAdmin, getManagedUserIds]);

  useEffect(() => {
    fetchTeamApprovals();
  }, [fetchTeamApprovals]);

  const fetchTeamSummary = useCallback(async () => {
      if (!managerId || !db) return;
      
      const userFilter = getManagedUserIds(managerId);
      if (userFilter.length === 0) {
          setTeamSummaryData({ entries: [], timeLogs: [], doctors: [], nonCallDays: [], plans: [], marketingSamples: [], usedQuantities: {} });
          return;
      }

      setLoadingSummary(true);
      try {
        const startDate = getQueryStartDateISO();
        const chunks: string[][] = [];
        for (let i = 0; i < userFilter.length; i += 10) {
            chunks.push(userFilter.slice(i, i + 10));
        }
        
        const fetchDataForChunk = async (chunk: string[]) => {
            if (chunk.length === 0) return { entries: [], timeLogs: [], doctors: [], nonCallDays: [], plans: [] };

            const fetchSingle = async (collName: string, restrictDate: boolean = true): Promise<any[]> => {
                try {
                    // Increased limit to 500 per chunk for better coverage oversight
                    const q = query(collection(db!, collName), where("userId", "in", chunk), limit(500));
                    const snap = await getDocs(q);
                    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    
                    if (!restrictDate || collName === 'doctors') return docs;
                    return docs.filter((d: any) => {
                        const dDate = safeToDateISO(d.submittedAt || d.coverageDate || d.timeIn || d.date || d.plannedDate || d.requestedAt);
                        return !dDate || dDate >= startDate;
                    });
                } catch (e) {
                    return [];
                }
            };

            const results = await Promise.all([
                fetchSingle("coverageEntries"),
                fetchSingle("timeLogs"),
                fetchSingle("doctors", false),
                fetchSingle("nonCallDays"),
                fetchSingle("plans"),
            ]);

            return {
                entries: results[0] as CoverageEntry[],
                timeLogs: results[1] as TimeLog[],
                doctors: results[2] as Doctor[],
                nonCallDays: results[3] as NonCallDay[],
                plans: results[4] as Plan[],
            };
        };

        const chunkResults = await Promise.all(chunks.map(fetchDataForChunk));
        
        const combined = chunkResults.reduce((acc, curr) => ({
            entries: [...acc.entries, ...curr.entries],
            timeLogs: [...acc.timeLogs, ...curr.timeLogs],
            doctors: [...acc.doctors, ...curr.doctors],
            nonCallDays: [...acc.nonCallDays, ...curr.nonCallDays],
            plans: [...acc.plans, ...curr.plans],
        }), { entries: [], timeLogs: [], doctors: [], nonCallDays: [], plans: [] } as any);

        const used: Record<string, number> = {};
        combined.entries.forEach((e: CoverageEntry) => {
            const process = (name?: any, qty?: any) => {
                const safeName = (name ?? "").toString().toLowerCase().trim();
                if (!safeName) return;
                const safeQty = Math.round(Number(qty || 0));
                if (!isNaN(safeQty)) used[safeName] = (used[safeName] || 0) + safeQty;
            };
            process(e.primarySampleName, e.primaryProductQty);
            process(e.secondarySampleName, e.secondaryProductQty);
            e.reminderProducts?.forEach(p => process(p.sampleName, p.quantity));
        });

        setTeamSummaryData({
            ...combined,
            marketingSamples: [],
            usedQuantities: used
        });
      } catch (err: any) {
         console.error("Team summary fetch failed", err);
      } finally {
        setLoadingSummary(false);
      }
  }, [managerId, getManagedUserIds]);
  
  const fetchUserData = useCallback(async (userId: string) => {
    if (!userId || !db) return;
    const sanitizedUserId = userId.trim();
    
    // Check Cache first
    const now = Date.now();
    if (userDataCache[sanitizedUserId] && (now - userDataCache[sanitizedUserId].timestamp < CACHE_TTL)) {
        const cached = userDataCache[sanitizedUserId].data;
        setAllEntries(cached.entries);
        setAllDoctors(cached.doctors);
        setAllPlans(cached.plans);
        setAllTimeLogs(cached.timeLogs);
        setAllNonCallDaysIndividual(cached.nonCallDays);
        setIndividualPlanningRequests(cached.requests);
        setIndividualUsedQuantities(cached.used);
        return;
    }

    if (fetchInProgress.current === sanitizedUserId) return;
    fetchInProgress.current = sanitizedUserId;

    setLoadingIndividual(true);
    
    // Clear previous results while loading to avoid stale UI
    setAllEntries([]);
    setAllDoctors([]);
    setAllPlans([]);
    setAllTimeLogs([]);
    setAllNonCallDaysIndividual([]);
    setIndividualPlanningRequests([]);
    setIndividualUsedQuantities({});

    try {
        const fetchS = async (collName: string): Promise<any[]> => {
            try {
                // Fetch ALL data for the user without date filtering to ensure exhaustive coverage visibility
                // Explicitly targeting sanitizedUserId which for Pangan is mdLCjhNVnYas96aW4IkrPWip7RS2
                const q = query(collection(db!, collName), where("userId", "==", sanitizedUserId));
                const snap = await getDocs(q);
                return snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (e) {
                return [];
            }
        };

        const results = await Promise.allSettled([
            fetchS("coverageEntries"),
            fetchS("doctors"),
            fetchS("plans"),
            fetchS("timeLogs"),
            fetchS("nonCallDays"),
            fetchS("planningRequests")
        ]);
        
        const entriesRaw = results[0].status === 'fulfilled' ? results[0].value : [];
        const doctors = results[1].status === 'fulfilled' ? results[1].value : [];
        const plans = results[2].status === 'fulfilled' ? results[2].value : [];
        const logs = results[3].status === 'fulfilled' ? results[3].value : [];
        const ncds = results[4].status === 'fulfilled' ? results[4].value : [];
        const requests = results[5].status === 'fulfilled' ? results[5].value : [];

        const entries = (entriesRaw as CoverageEntry[]).sort((a, b) => safeToDateISO(b.submittedAt || b.coverageDate).localeCompare(safeToDateISO(a.submittedAt || a.coverageDate)));

        const used: Record<string, number> = {};
        entries.forEach((e: any) => {
            const process = (name?: any, qty?: any) => {
                const safeName = (name ?? "").toString().toLowerCase().trim();
                if (!safeName) return;
                const safeQty = Math.round(Number(qty || 0));
                if (!isNaN(safeQty)) used[safeName] = (used[safeName] || 0) + safeQty;
            };
            process(e.primarySampleName, e.primaryProductQty);
            process(e.secondarySampleName, e.secondaryProductQty);
            if (Array.isArray(e.reminderProducts)) {
                e.reminderProducts.forEach((p: any) => process(p?.sampleName, p?.quantity));
            }
        });

        const dashboardData = { entries, doctors, plans, timeLogs: logs, nonCallDays: ncds, requests, used };
        userDataCache[sanitizedUserId] = { timestamp: now, data: dashboardData };

        setAllEntries(entries);
        setAllDoctors(doctors);
        setAllPlans(plans);
        setAllTimeLogs(logs);
        setAllNonCallDaysIndividual(ncds);
        setIndividualPlanningRequests(requests);
        setIndividualUsedQuantities(used);
    } catch (err: any) {
        console.error("Individual PMR data aggregate failed", err);
    } finally {
        setLoadingIndividual(false);
        fetchInProgress.current = null;
    }
  }, []);

  const updateNonCallDayStatus = async (id: string, status: 'approved' | 'rejected') => {
      const docRef = doc(db!, 'nonCallDays', id);
      updateDoc(docRef, { status })
        .then(() => {
            setAllNonCallDays(prev => prev.map(d => d.id === id ? {...d, status} : d));
            toast({ title: 'Success', description: `Request ${status}.`});
        })
        .catch(async (e) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update', requestResourceData: { status } }));
        });
  };
  
  const updatePlanningRequestStatus = async (id: string, status: 'approved' | 'rejected') => {
      const docRef = doc(db!, 'planningRequests', id);
      updateDoc(docRef, { status })
        .then(() => {
            setAllPlanningRequests(prev => prev.map(r => r.id === id ? {...r, status} : r));
            toast({ title: 'Success', description: `Request ${status}.` });
        })
        .catch(async (e) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update', requestResourceData: { status } }));
        });
  };

  const deleteEntry = async (id: string) => {
    const docRef = doc(db!, "coverageEntries", id);
    deleteDoc(docRef)
      .then(() => {
        setAllEntries(prev => prev.filter(e => e.id !== id));
        toast({ variant: 'destructive', title: "Entry Deleted" });
      })
      .catch(async () => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'delete' }));
      });
  };
  
  const addDoctor = async (data: Omit<Doctor, 'id'>) => {
    const colRef = collection(db!, "doctors");
    addDoc(colRef, data)
      .then((dr) => {
        const newDoc = { id: dr.id, ...data } as Doctor;
        setAllDoctors(prev => [...prev, newDoc]);
        toast({ title: "Doctor Added" });
      })
      .catch(async () => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: colRef.path, operation: 'create', requestResourceData: data }));
      });
  };

  const updateDoctor = async (data: Doctor) => {
    const { id, userId, ...update } = data;
    const docRef = doc(db!, "doctors", id);
    updateDoc(docRef, update)
      .then(() => {
        setAllDoctors(prev => prev.map(d => d.id === id ? data : d));
        toast({ title: "Doctor Updated" });
      })
      .catch(async (e) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update', requestResourceData: update }));
      });
  };
  
  const deleteDoctor = async (id: string) => {
    const docRef = doc(db!, "doctors", id);
    deleteDoc(docRef)
      .then(() => {
        setAllDoctors(prev => prev.filter(d => d.id !== id));
        toast({ variant: "destructive", title: "Doctor Deleted" });
      })
      .catch(async () => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'delete' }));
      });
  };

  return { 
    allEntries,
    allDoctors,
    allPlans,
    allTimeLogs,
    allNonCallDaysIndividual,
    individualPlanningRequests,
    individualUsedQuantities,
    allNonCallDays, 
    allPlanningRequests,
    teamSummaryData,
    loading,
    loadingSummary,
    loadingIndividual,
    fetchUserData,
    fetchTeamSummary,
    updateNonCallDayStatus, 
    updatePlanningRequestStatus, 
    deleteEntry,
    addDoctor,
    updateDoctor,
    deleteDoctor,
    deleteDoctorsBulk: async (ids: string[]) => {
        const batch = writeBatch(db!);
        ids.forEach(id => batch.delete(doc(db!, "doctors", id)));
        await batch.commit();
        setAllDoctors(prev => prev.filter(d => !ids.includes(d.id)));
    },
    addDoctorsBulk: async (data: Omit<Doctor, 'id'>[]) => {
        const batch = writeBatch(db!);
        data.forEach(d => batch.set(doc(collection(db!, "doctors")), d));
        await batch.commit();
    }
  };
}
