
"use client"

import { useEffect, useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc, addDoc, writeBatch, orderBy, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest, MarketingSample } from "@/lib/types";
import { useToast } from "./use-toast";
import { getQueryStartDateISO } from "@/lib/utils";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { parseISO, isValid } from "date-fns";

export interface TeamSummaryData {
    entries: CoverageEntry[];
    doctors: Doctor[];
    nonCallDays: NonCallDay[];
    timeLogs: TimeLog[];
    plans: Plan[];
    marketingSamples: MarketingSample[];
    usedQuantities: Record<string, number>;
}

/**
 * Utility to safely convert any date field (Timestamp or string) to an ISO string
 * for reliable lexicographical comparison.
 */
const safeToDateISO = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val instanceof Timestamp) return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    if (typeof val.toDate === 'function') return val.toDate().toISOString();
    return String(val);
};

export function useAdminData(managerId?: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Individual User State (for drill-down)
  const [allEntries, setAllEntries] = useState<CoverageEntry[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [allTimeLogs, setAllTimeLogs] = useState<TimeLog[]>([]);
  const [allNonCallDaysIndividual, setAllNonCallDaysIndividual] = useState<NonCallDay[]>([]);
  const [individualPlanningRequests, setIndividualPlanningRequests] = useState<PlanningPermissionRequest[]>([]);

  // Team-Wide Approvals State
  const [allNonCallDays, setAllNonCallDays] = useState<NonCallDay[]>([]);
  const [allPlanningRequests, setAllPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  
  // Team Summary State
  const [teamSummaryData, setTeamSummaryData] = useState<TeamSummaryData | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  
  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    const normalizedEmail = user.email?.toLowerCase() || '';
    return ADMIN_UIDS.includes(user.uid) || normalizedEmail === 'mbustamante@hovidinc.com' || ADMIN_EMAILS.some(e => e.toLowerCase() === normalizedEmail);
  }, [user]);

  const fetchTeamApprovals = useCallback(async () => {
    if (!user || !db) {
        setAllNonCallDays([]);
        setAllPlanningRequests([]);
        return;
    }

    let userFilter: string[] | null = null;
    if (managerId) {
      userFilter = MANAGER_TEAMS[managerId] || [];
    } else if (!isUserAdmin) {
      setAllNonCallDays([]);
      setAllPlanningRequests([]);
      return;
    }

    setLoading(true);
    try {
        const fetchCollection = async (collName: string, userIds: string[] | null) => {
            if (userIds !== null && userIds.length === 0) return [];
            
            let queryRef;
            if (userIds === null) { 
                queryRef = query(collection(db, collName), orderBy(collName === 'nonCallDays' ? "date" : "requestedAt", "desc"));
            } else { 
                // Note: Firestore 'in' queries are limited to 30 items
                const chunks: string[][] = [];
                for (let i = 0; i < userIds.length; i += 30) {
                    chunks.push(userIds.slice(i, i + 30));
                }
                const snapshots = await Promise.all(chunks.map(chunk => 
                    getDocs(query(collection(db, collName), where("userId", "in", chunk)))
                ));
                return snapshots.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }
            const snapshot = await getDocs(queryRef);
            return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        };
      
      const [ncdRes, prRes] = await Promise.all([
          fetchCollection("nonCallDays", userFilter),
          fetchCollection("planningRequests", userFilter)
      ]);
      
      setAllNonCallDays((ncdRes as NonCallDay[]).sort((a, b) => safeToDateISO(b.date).localeCompare(safeToDateISO(a.date))));
      setAllPlanningRequests((prRes as PlanningPermissionRequest[]).sort((a, b) => safeToDateISO(b.requestedAt).localeCompare(safeToDateISO(a.requestedAt))));

    } catch (serverError: any) {
        console.error("Fetch Approvals Error:", serverError);
    } finally {
      setLoading(false);
    }
  }, [user, managerId, isUserAdmin]);

  useEffect(() => {
    fetchTeamApprovals();
  }, [fetchTeamApprovals]);

  const fetchTeamSummary = useCallback(async (forceAllWeek = false) => {
      if (!managerId || !db) return;
      
      const userFilter = MANAGER_TEAMS[managerId] || [];
      if (userFilter.length === 0) {
          setTeamSummaryData({ entries: [], timeLogs: [], doctors: [], nonCallDays: [], plans: [], marketingSamples: [], usedQuantities: {} });
          return;
      }

      setLoadingSummary(true);
      try {
        const startDate = getQueryStartDateISO(forceAllWeek);
        const chunks: string[][] = [];
        for (let i = 0; i < userFilter.length; i += 30) {
            chunks.push(userFilter.slice(i, i + 30));
        }
        
        const fetchDataForChunk = async (chunk: string[]) => {
            const snaps = await Promise.all([
                getDocs(query(collection(db, "coverageEntries"), where("userId", "in", chunk))),
                getDocs(query(collection(db, "timeLogs"), where("userId", "in", chunk))),
                getDocs(query(collection(db, "doctors"), where("userId", "in", chunk))),
                getDocs(query(collection(db, "nonCallDays"), where("userId", "in", chunk))),
                getDocs(query(collection(db, "plans"), where("userId", "in", chunk))),
            ]);

            return {
                entries: snaps[0].docs.map(d => ({ id: d.id, ...d.data() }) as CoverageEntry).filter(e => safeToDateISO(e.submittedAt) >= startDate),
                timeLogs: snaps[1].docs.map(d => ({ id: d.id, ...d.data() }) as TimeLog).filter(t => safeToDateISO(t.timeIn) >= startDate),
                doctors: snaps[2].docs.map(d => ({ id: d.id, ...d.data() }) as Doctor),
                nonCallDays: snaps[3].docs.map(d => ({ id: d.id, ...d.data() }) as NonCallDay).filter(n => safeToDateISO(n.date) >= startDate),
                plans: snaps[4].docs.map(d => ({ id: d.id, ...d.data() }) as Plan).filter(p => safeToDateISO(p.plannedDate) >= startDate),
            };
        };

        const [chunkResults, marketingSamplesSnap] = await Promise.all([
            Promise.all(chunks.map(fetchDataForChunk)),
            getDocs(query(collection(db, "marketingSamples")))
        ]);
        
        const combined = chunkResults.reduce((acc, curr) => ({
            entries: [...acc.entries, ...curr.entries],
            timeLogs: [...acc.timeLogs, ...curr.timeLogs],
            doctors: [...acc.doctors, ...curr.doctors],
            nonCallDays: [...acc.nonCallDays, ...curr.nonCallDays],
            plans: [...acc.plans, ...curr.plans],
        }), { entries: [], timeLogs: [], doctors: [], nonCallDays: [], plans: [] } as any);

        const used: Record<string, number> = {};
        combined.entries.forEach((e: CoverageEntry) => {
            if (e.primarySampleName && e.primaryProductQty) used[e.primarySampleName] = (used[e.primarySampleName] || 0) + Number(e.primaryProductQty);
            if (e.secondarySampleName && e.secondaryProductQty) used[e.secondarySampleName] = (used[e.secondarySampleName] || 0) + Number(e.secondaryProductQty);
            e.reminderProducts?.forEach(p => { if (p.sampleName && p.quantity) used[p.sampleName] = (used[p.sampleName] || 0) + Number(p.quantity); });
        });

        setTeamSummaryData({
            ...combined,
            marketingSamples: marketingSamplesSnap.docs.map(d => ({id: d.id, ...d.data()}) as MarketingSample),
            usedQuantities: used
        });

      } catch (err) {
          console.error("Team Summary Error:", err);
      } finally {
        setLoadingSummary(false);
      }
  }, [managerId]);
  
  const fetchUserData = useCallback(async (userId: string, forceAllWeek = false) => {
    if (!userId || !db) return;
    setLoading(true);
    try {
        const startDate = getQueryStartDateISO(forceAllWeek);
        const q = (coll: string) => query(collection(db, coll), where("userId", "==", userId));
        
        const snaps = await Promise.all([
            getDocs(q("coverageEntries")),
            getDocs(q("doctors")),
            getDocs(q("plans")),
            getDocs(q("timeLogs")),
            getDocs(q("nonCallDays")),
            getDocs(q("planningRequests")),
        ]);
        
        setAllEntries(snaps[0].docs.map(d => ({id: d.id, ...d.data()}) as CoverageEntry).filter(e => safeToDateISO(e.submittedAt) >= startDate));
        setAllDoctors(snaps[1].docs.map(d => ({id: d.id, ...d.data()}) as Doctor));
        setAllPlans(snaps[2].docs.map(d => ({id: d.id, ...d.data()}) as Plan).filter(p => safeToDateISO(p.plannedDate) >= startDate));
        setAllTimeLogs(snaps[3].docs.map(d => ({id: d.id, ...d.data()}) as TimeLog).filter(t => safeToDateISO(t.timeIn) >= startDate));
        setAllNonCallDaysIndividual(snaps[4].docs.map(d => ({id: d.id, ...d.data()}) as NonCallDay).filter(n => safeToDateISO(n.date) >= startDate));
        setIndividualPlanningRequests(snaps[5].docs.map(d => ({id: d.id, ...d.data()}) as PlanningPermissionRequest));

    } catch (err) {
        console.error("User Drill-down Error:", err);
    } finally {
        setLoading(false);
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
        if (teamSummaryData) setTeamSummaryData(prev => prev ? { ...prev, entries: prev.entries.filter(e => e.id !== id) } : null);
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
      .catch(async () => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update', requestResourceData: update }));
      });
  };
  
  const deleteDoctor = async (id: string) => {
    const docRef = doc(db!, "doctors", id);
    deleteDoc(docRef)
      .then(() => {
        setAllDoctors(prev => prev.filter(d => d.id !== id));
        toast({ variant: 'destructive', title: "Doctor Deleted" });
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
    allNonCallDays, 
    allPlanningRequests,
    teamSummaryData,
    loading,
    loadingSummary,
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
        await fetchTeamSummary();
    },
  };
}
