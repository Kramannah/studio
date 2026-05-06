
"use client"

import { useEffect, useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc, addDoc, writeBatch, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest, MarketingSample } from "@/lib/types";
import { useToast } from "./use-toast";
import { getQueryStartDateISO } from "@/lib/utils";
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

export function useAdminData(managerId?: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [allEntries, setAllEntries] = useState<CoverageEntry[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [allTimeLogs, setAllTimeLogs] = useState<TimeLog[]>([]);
  const [allNonCallDays, setAllNonCallDays] = useState<NonCallDay[]>([]);
  const [allPlanningRequests, setAllPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
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
            if (userIds !== null && userIds.length === 0) {
                return [];
            }
            
            let allDocsData: any[] = [];

            if (userIds === null) { 
                const q = query(collection(db, collName), orderBy(collName === 'nonCallDays' ? "date" : "requestedAt", "desc"));
                const snapshot = await getDocs(q);
                allDocsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            } else { 
                const chunks: string[][] = [];
                for (let i = 0; i < userIds.length; i += 30) {
                    chunks.push(userIds.slice(i, i + 30));
                }

                const promises = chunks.map(chunk => {
                    const q = query(collection(db, collName), where("userId", "in", chunk));
                    return getDocs(q);
                });

                const snapshots = await Promise.all(promises);
                allDocsData = snapshots.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }
            return allDocsData;
        }
      
      const [nonCallDaysRes, planningRequestsRes] = await Promise.all([
          fetchCollection("nonCallDays", userFilter),
          fetchCollection("planningRequests", userFilter)
      ]);
      
      const sortedNonCallDays = (nonCallDaysRes as NonCallDay[]).sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA;
      });

      const sortedPlanningRequests = (planningRequestsRes as PlanningPermissionRequest[]).sort((a, b) => {
          const dateA = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
          const dateB = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
          return dateB - dateA;
      });
      
      setAllNonCallDays(sortedNonCallDays);
      setAllPlanningRequests(sortedPlanningRequests);

    } catch (serverError: any) {
        const permissionError = new FirestorePermissionError({
          path: 'approvals',
          operation: 'list',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    } finally {
      setLoading(false);
    }
  }, [user, managerId, isUserAdmin]);

  useEffect(() => {
    fetchTeamApprovals();
  }, [fetchTeamApprovals]);

  const fetchTeamSummary = useCallback(async (forceAllWeek = false) => {
      if (!managerId || !db) {
          setTeamSummaryData(null);
          return;
      }
      
      const userFilter = MANAGER_TEAMS[managerId] || [];
      if (userFilter.length === 0) {
          setTeamSummaryData({ entries: [], timeLogs: [], doctors: [], nonCallDays: [], plans: [], marketingSamples: [], usedQuantities: {} });
          setLoadingSummary(false);
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
            try {
                const entriesPromise = getDocs(query(collection(db, "coverageEntries"), where("userId", "in", chunk)));
                const timeLogsPromise = getDocs(query(collection(db, "timeLogs"), where("userId", "in", chunk)));
                const doctorsPromise = getDocs(query(collection(db, "doctors"), where("userId", "in", chunk)));
                const nonCallDaysPromise = getDocs(query(collection(db, "nonCallDays"), where("userId", "in", chunk)));
                const plansPromise = getDocs(query(collection(db, "plans"), where("userId", "in", chunk)));

                const [entriesSnap, timeLogsSnap, doctorsSnap, nonCallDaysSnap, plansSnap] = await Promise.all([
                    entriesPromise,
                    timeLogsPromise,
                    doctorsPromise,
                    nonCallDaysPromise,
                    plansPromise,
                ]);

                return {
                    entries: entriesSnap.docs.map(d => ({ id: d.id, ...d.data() }) as CoverageEntry).filter(e => (e.submittedAt || '') >= startDate),
                    timeLogs: timeLogsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as TimeLog).filter(t => (t.timeIn || t.timeIn) >= startDate),
                    doctors: doctorsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Doctor),
                    nonCallDays: nonCallDaysSnap.docs.map(d => ({ id: d.id, ...d.data() }) as NonCallDay).filter(n => (n.date || '') >= startDate),
                    plans: plansSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Plan).filter(p => (p.plannedDate || '') >= startDate),
                };
            } catch (err) {
                console.error("Chunk fetch error", err);
                return { entries: [], timeLogs: [], doctors: [], nonCallDays: [], plans: [] };
            }
        };

        const marketingSamplesPromise = getDocs(query(collection(db, "marketingSamples")));

        const [chunkResults, marketingSamplesSnap] = await Promise.all([
            Promise.all(chunks.map(fetchDataForChunk)),
            marketingSamplesPromise,
        ]);
        
        const combinedData: Omit<TeamSummaryData, 'marketingSamples' | 'usedQuantities'> = chunkResults.reduce((acc, current) => {
            acc.entries.push(...current.entries);
            acc.timeLogs.push(...current.timeLogs);
            acc.doctors.push(...current.doctors);
            acc.nonCallDays.push(...current.nonCallDays);
            acc.plans.push(...current.plans);
            return acc;
        }, { entries: [] as CoverageEntry[], timeLogs: [] as TimeLog[], doctors: [] as Doctor[], nonCallDays: [] as NonCallDay[], plans: [] as Plan[] });

        const marketingSamples = marketingSamplesSnap.docs.map(d => ({id: d.id, ...d.data()}) as MarketingSample);
        
        const usedQuantities: Record<string, number> = {};
        combinedData.entries.forEach(entry => {
            if (entry.primarySampleName && entry.primaryProductQty) {
                const qty = Math.round(Number(entry.primaryProductQty));
                usedQuantities[entry.primarySampleName] = (usedQuantities[entry.primarySampleName] || 0) + qty;
            }
            if (entry.secondarySampleName && entry.secondaryProductQty) {
                const qty = Math.round(Number(entry.secondaryProductQty));
                usedQuantities[entry.secondarySampleName] = (usedQuantities[entry.secondarySampleName] || 0) + qty;
            }
            if (entry.reminderProducts) {
                entry.reminderProducts.forEach(prod => {
                    if (prod.sampleName && prod.quantity) {
                        const qty = Math.round(Number(prod.quantity));
                        usedQuantities[prod.sampleName] = (usedQuantities[prod.sampleName] || 0) + qty;
                    }
                });
            }
        });

        setTeamSummaryData({
            ...combinedData,
            marketingSamples,
            usedQuantities
        });

      } catch (serverError: any) {
          const permissionError = new FirestorePermissionError({
            path: 'teamSummary',
            operation: 'list',
          } satisfies SecurityRuleContext);
          errorEmitter.emit('permission-error', permissionError);
      } finally {
        setLoadingSummary(false);
      }
  }, [managerId, toast]);
  
  const fetchUserData = useCallback(async (userId: string, forceAllWeek = false) => {
    if (!userId || !db) {
        setAllEntries([]);
        setAllDoctors([]);
        setAllPlans([]);
        setAllTimeLogs([]);
        return;
    }
    setLoading(true);
    try {
        const startDate = getQueryStartDateISO(forceAllWeek);
        const q = (coll: string) => query(collection(db, coll), where("userId", "==", userId));
        
        const [entriesSnap, doctorsSnap, plansSnap, timeLogsSnap, nonCallDaysSnap] = await Promise.all([
            getDocs(q("coverageEntries")),
            getDocs(q("doctors")),
            getDocs(q("plans")),
            getDocs(q("timeLogs")),
            getDocs(q("nonCallDays")),
        ]);
        
        const entries = entriesSnap.docs
            .map(d => ({id: d.id, ...d.data()}) as CoverageEntry)
            .filter(e => (e.submittedAt || '') >= startDate);
            
        const plans = plansSnap.docs
            .map(d => ({id: d.id, ...d.data()}) as Plan)
            .filter(p => (p.plannedDate || '') >= startDate);

        const timeLogs = timeLogsSnap.docs
            .map(d => ({id: d.id, ...d.data()}) as TimeLog)
            .filter(t => (t.timeIn || '') >= startDate);

        const nonCallDays = nonCallDaysSnap.docs
            .map(d => ({id: d.id, ...d.data()}) as NonCallDay)
            .filter(n => (n.date || '') >= startDate);
        
        setAllEntries(entries);
        setAllDoctors(doctorsSnap.docs.map(d => ({id: d.id, ...d.data()}) as Doctor));
        setAllPlans(plans);
        setAllTimeLogs(timeLogs);
        setAllNonCallDays(nonCallDays);

    } catch (serverError: any) {
        const permissionError = new FirestorePermissionError({
          path: 'userData',
          operation: 'list',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    } finally {
        setLoading(false);
    }
  }, []);


  const updateNonCallDayStatus = async (id: string, status: 'approved' | 'rejected') => {
      if (!db) return;
      const docRef = doc(db, 'nonCallDays', id);
      updateDoc(docRef, { status })
        .then(() => {
            setAllNonCallDays(prev => prev.map(d => d.id === id ? {...d, status} : d));
            toast({ title: 'Success', description: `Request has been ${status}.`});
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
              path: docRef.path,
              operation: 'update',
              requestResourceData: { status },
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        });
  };
  
  const updatePlanningRequestStatus = async (id: string, status: 'approved' | 'rejected') => {
      if (!db) return;
      const docRef = doc(db, 'planningRequests', id);
      updateDoc(docRef, { status })
        .then(() => {
            setAllPlanningRequests(prev => prev.map(r => r.id === id ? {...r, status} : r));
            toast({ title: 'Success', description: `Request has been ${status}.` });
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
              path: docRef.path,
              operation: 'update',
              requestResourceData: { status },
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        });
  };

  const deleteEntry = async (id: string) => {
    if (!db) return;
    const docRef = doc(db, "coverageEntries", id);
    deleteDoc(docRef)
      .then(() => {
        setAllEntries(prev => prev.filter(e => e.id !== id));
        if (teamSummaryData) {
            setTeamSummaryData(prev => prev ? { ...prev, entries: prev.entries.filter(e => e.id !== id) } : null);
        }
        toast({ variant: 'destructive', title: "Entry Deleted", description: `Coverage report has been removed.` });
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
  };
  
  const addDoctor = async (doctorData: Omit<Doctor, 'id'>) => {
    if (!db) return;
    const colRef = collection(db, "doctors");
    addDoc(colRef, doctorData)
      .then((docRef) => {
        const newDoctor = { id: docRef.id, ...doctorData } as Doctor;
        if (teamSummaryData) {
            setTeamSummaryData(prev => prev ? ({ ...prev, doctors: [...prev.doctors, newDoctor] }) : null);
        }
        setAllDoctors(prev => [...prev, newDoctor]);
        toast({ title: "Doctor Added", description: `${doctorData.firstName} ${doctorData.lastName} has been added.` });
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: colRef.path,
          operation: 'create',
          requestResourceData: doctorData,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const updateDoctor = async (doctorData: Doctor) => {
    if (!db) return;
    const { id, userId, ...dataToUpdate } = doctorData;
    const docRef = doc(db, "doctors", id);
    updateDoc(docRef, dataToUpdate)
      .then(() => {
        if (teamSummaryData) {
            setTeamSummaryData(prev => {
                if (!prev) return null;
                const newDoctors = prev.doctors.map(d => d.id === id ? doctorData : d);
                return { ...prev, doctors: newDoctors };
            });
        }
        setAllDoctors(prev => prev.map(d => d.id === id ? doctorData : d));
        toast({ title: "Doctor Updated", description: `${doctorData.firstName} ${doctorData.lastName}'s details have been updated.` });
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'update',
          requestResourceData: dataToUpdate,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
  };
  
  const deleteDoctor = async (id: string) => {
    if (!db) return;
    const docRef = doc(db, "doctors", id);
    deleteDoc(docRef)
      .then(() => {
        if (teamSummaryData) {
          setTeamSummaryData(prev => prev ? ({...prev, doctors: prev.doctors.filter(d => d.id !== id)}) : null);
        }
        setAllDoctors(prev => prev.filter(d => d.id !== id));
        toast({ variant: 'destructive', title: "Doctor Deleted" });
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
  };
  
  const deleteDoctorsBulk = async (ids: string[]) => {
    if (ids.length === 0 || !db) return;
    const batch = writeBatch(db);
    ids.forEach(id => {
      batch.delete(doc(db, "doctors", id));
    });

    batch.commit()
      .then(() => {
        if (teamSummaryData) {
          setTeamSummaryData(prev => prev ? ({...prev, doctors: prev.doctors.filter(d => !ids.includes(d.id))}) : null);
        }
        setAllDoctors(prev => prev.filter(d => !ids.includes(d.id)));
        toast({ variant: 'destructive', title: "Doctors Deleted", description: `${ids.length} doctor(s) have been removed.` });
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: 'doctors',
          operation: 'delete',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const addDoctorsBulk = async (doctorsData: Omit<Doctor, 'id'>[]) => {
    if (!db) return;
    const chunkSize = 500;
    try {
        for (let i = 0; i < doctorsData.length; i += chunkSize) {
            const chunk = doctorsData.slice(i, i + chunkSize);
            const batch = writeBatch(db);
            chunk.forEach(doctor => {
                const docRef = doc(collection(db, "doctors"));
                batch.set(docRef, doctor);
            });
            await batch.commit();
        }
        await fetchTeamSummary();
        toast({ title: 'Bulk Add Successful', description: `${doctorsData.length} doctors processed.` });
    } catch (serverError: any) {
        const permissionError = new FirestorePermissionError({
          path: 'doctors',
          operation: 'write',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    }
  };


  return { 
    allEntries,
    allDoctors,
    allPlans,
    allTimeLogs,
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
    deleteDoctorsBulk,
    addDoctorsBulk,
  };
}
