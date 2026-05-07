"use client"

import { useEffect, useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc, addDoc, writeBatch, orderBy, FirestoreError } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest, MarketingSample, UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

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

export function useAdminData(managerId?: string, userProfiles: Record<string, UserProfile> = {}) {
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
  
  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    const normalizedEmail = user.email?.toLowerCase() || '';
    return ADMIN_UIDS.includes(user.uid) || normalizedEmail === 'mbustamante@hovidinc.com' || ADMIN_EMAILS.some(e => e.toLowerCase() === normalizedEmail);
  }, [user]);

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
    } else if (!isUserAdmin) {
      return;
    }

    setLoading(true);
    try {
        const fetchCollection = async (collName: string, userIds: string[] | null) => {
            if (userIds !== null && userIds.length === 0) return [];
            
            let queryRef;
            if (userIds === null) { 
                queryRef = query(collection(db!, collName));
            } else { 
                const chunks: string[][] = [];
                for (let i = 0; i < userIds.length; i += 10) {
                    chunks.push(userIds.slice(i, i + 10));
                }
                const snapshots = await Promise.all(chunks.map(chunk => 
                    getDocs(query(collection(db!, collName), where("userId", "in", chunk)))
                ));
                return snapshots.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }
            const snapshot = await getDocs(queryRef);
            return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        };
      
      const [ncdRes, prRes] = await Promise.allSettled([
          fetchCollection("nonCallDays", userFilter),
          fetchCollection("planningRequests", userFilter)
      ]);
      
      if (ncdRes.status === 'fulfilled') {
        setAllNonCallDays((ncdRes.value as NonCallDay[]).sort((a, b) => safeToDateISO(b.date).localeCompare(safeToDateISO(a.date))));
      }
      if (prRes.status === 'fulfilled') {
        setAllPlanningRequests((prRes.value as PlanningPermissionRequest[]).sort((a, b) => safeToDateISO(b.requestedAt).localeCompare(safeToDateISO(a.requestedAt))));
      }
    } catch (err: any) {
        // Handled via listener if needed
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
        const chunks: string[][] = [];
        for (let i = 0; i < userFilter.length; i += 10) {
            chunks.push(userFilter.slice(i, i + 10));
        }
        
        const fetchDataForChunk = async (chunk: string[]) => {
            const fetchSingle = (collName: string) => 
                getDocs(query(collection(db!, collName), where("userId", "in", chunk)));

            const snaps = await Promise.allSettled([
                fetchSingle("coverageEntries"),
                fetchSingle("timeLogs"),
                fetchSingle("doctors"),
                fetchSingle("nonCallDays"),
                fetchSingle("plans"),
            ]);

            const getResults = (index: number) => {
                const res = snaps[index];
                return res.status === 'fulfilled' ? res.value.docs : [];
            };

            return {
                entries: getResults(0).map(d => ({ id: d.id, ...d.data() }) as CoverageEntry),
                timeLogs: getResults(1).map(d => ({ id: d.id, ...d.data() }) as TimeLog),
                doctors: getResults(2).map(d => ({ id: d.id, ...d.data() }) as Doctor),
                nonCallDays: getResults(3).map(d => ({ id: d.id, ...d.data() }) as NonCallDay),
                plans: getResults(4).map(d => ({ id: d.id, ...d.data() }) as Plan),
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
            if (e.primarySampleName && e.primaryProductQty) used[e.primarySampleName] = (used[e.primarySampleName] || 0) + Math.round(Number(e.primaryProductQty));
            if (e.secondarySampleName && e.secondaryProductQty) used[e.secondarySampleName] = (used[e.secondarySampleName] || 0) + Math.round(Number(e.secondaryProductQty));
            e.reminderProducts?.forEach(p => { if (p.sampleName && p.quantity) used[p.sampleName] = (used[p.sampleName] || 0) + Math.round(Number(p.quantity)); });
        });

        setTeamSummaryData({
            ...combined,
            marketingSamples: [],
            usedQuantities: used
        });

      } catch (err: any) {
         // Handled via listener
      } finally {
        setLoadingSummary(false);
      }
  }, [managerId, getManagedUserIds]);
  
  const fetchUserData = useCallback(async (userId: string) => {
    if (!userId || !db) return;
    const sanitizedUserId = userId.trim();
    
    setLoadingIndividual(true);
    
    try {
        const fetchS = (collName: string) => 
            getDocs(query(collection(db!, collName), where("userId", "==", sanitizedUserId)));

        const results = await Promise.allSettled([
            fetchS("coverageEntries"),
            fetchS("doctors"),
            fetchS("plans"),
            fetchS("timeLogs"),
            fetchS("nonCallDays"),
            fetchS("planningRequests")
        ]);
        
        const getVal = <T>(idx: number): T[] => {
            const res = results[idx];
            return res.status === 'fulfilled' ? res.value.docs.map(d => ({id: d.id, ...d.data()}) as T) : [];
        };

        const entries = getVal<CoverageEntry>(0);
        const doctors = getVal<Doctor>(1);
        const plans = getVal<Plan>(2);
        const logs = getVal<TimeLog>(3);
        const ncds = getVal<NonCallDay>(4);
        const requests = getVal<PlanningPermissionRequest>(5);

        const used: Record<string, number> = {};
        entries.forEach((e: CoverageEntry) => {
            if (e.primarySampleName && e.primaryProductQty) {
                used[e.primarySampleName] = (used[e.primarySampleName] || 0) + Math.round(Number(e.primaryProductQty));
            }
            if (e.secondarySampleName && e.secondaryProductQty) {
                used[e.secondarySampleName] = (used[e.secondarySampleName] || 0) + Math.round(Number(e.secondaryProductQty));
            }
            e.reminderProducts?.forEach(p => {
                if (p.sampleName && p.quantity) {
                    used[p.sampleName] = (used[p.sampleName] || 0) + Math.round(Number(p.quantity));
                }
            });
        });

        setAllEntries(entries);
        setAllDoctors(doctors);
        setAllPlans(plans);
        setAllTimeLogs(logs);
        setAllNonCallDaysIndividual(ncds);
        setIndividualPlanningRequests(requests);
        setIndividualUsedQuantities(used);
    } catch (err: any) {
        // Handled via listener
    } finally {
        setLoadingIndividual(false);
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
