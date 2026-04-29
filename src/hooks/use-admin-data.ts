
"use client"

import { useEffect, useState, useCallback, useMemo } from "react";
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc, addDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_UIDS, MANAGER_TEAMS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest, MarketingSample } from "@/lib/types";
import { useToast } from "./use-toast";

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
  const isUserAdmin = useMemo(() => user && ADMIN_UIDS.includes(user.uid), [user]);

  const fetchTeamApprovals = useCallback(async () => {
    if (!user) {
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

            if (userIds === null) { // Admin fetching all
                const q = query(collection(db, collName));
                const snapshot = await getDocs(q);
                allDocsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            } else { // Manager fetching for team
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
      
      // Sort in memory to avoid index requirements
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

    } catch (error) {
      console.error("Error fetching admin approval data:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load approval data.'})
    } finally {
      setLoading(false);
    }
  }, [user, managerId, isUserAdmin, toast]);

  useEffect(() => {
    fetchTeamApprovals();
  }, [fetchTeamApprovals]);

  const fetchTeamSummary = useCallback(async () => {
      if (!managerId) {
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
        
        const chunks: string[][] = [];
        for (let i = 0; i < userFilter.length; i += 30) {
            chunks.push(userFilter.slice(i, i + 30));
        }
        
        const fetchDataForChunk = async (chunk: string[]) => {
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
                entries: entriesSnap.docs.map(d => ({ id: d.id, ...d.data() }) as CoverageEntry),
                timeLogs: timeLogsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as TimeLog),
                doctors: doctorsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Doctor),
                nonCallDays: nonCallDaysSnap.docs.map(d => ({ id: d.id, ...d.data() }) as NonCallDay),
                plans: plansSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Plan),
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
        }, { entries: [], timeLogs: [], doctors: [], nonCallDays: [], plans: [] });

        // Sort data in memory
        combinedData.entries.sort((a, b) => {
            const dateA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
            const dateB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
            return dateB - dateA;
        });
        combinedData.timeLogs.sort((a, b) => {
            const dateA = a.timeIn ? new Date(a.timeIn).getTime() : 0;
            const dateB = b.timeIn ? new Date(b.timeIn).getTime() : 0;
            return dateB - dateA;
        });
        combinedData.nonCallDays.sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateB - dateA;
        });
        combinedData.plans.sort((a, b) => {
            const dateA = a.plannedDate ? new Date(a.plannedDate).getTime() : 0;
            const dateB = b.plannedDate ? new Date(b.plannedDate).getTime() : 0;
            return dateB - dateA;
        });

        const marketingSamples = marketingSamplesSnap.docs.map(d => ({id: d.id, ...d.data()}) as MarketingSample);
        
        const usedQuantities: Record<string, number> = {};
        combinedData.entries.forEach(entry => {
            // Sum primary
            if (entry.primarySampleName && entry.primaryProductQty) {
                usedQuantities[entry.primarySampleName] = (usedQuantities[entry.primarySampleName] || 0) + Number(entry.primaryProductQty);
            }
            // Sum secondary
            if (entry.secondarySampleName && entry.secondaryProductQty) {
                usedQuantities[entry.secondarySampleName] = (usedQuantities[entry.secondarySampleName] || 0) + Number(entry.secondaryProductQty);
            }
            // Sum reminders
            if (entry.reminderProducts) {
                entry.reminderProducts.forEach(prod => {
                    if (prod.sampleName && prod.quantity) {
                        usedQuantities[prod.sampleName] = (usedQuantities[prod.sampleName] || 0) + Number(prod.quantity);
                    }
                });
            }
        });

        setTeamSummaryData({
            ...combinedData,
            marketingSamples,
            usedQuantities
        });

      } catch (error) {
          console.error("Error fetching team summary:", error);
          toast({ variant: 'destructive', title: 'Error', description: 'Failed to load team summary data.'})
      } finally {
        setLoadingSummary(false);
      }
  }, [managerId, toast]);
  
  const fetchUserData = useCallback(async (userId: string) => {
    if (!userId) {
        setAllEntries([]);
        setAllDoctors([]);
        setAllPlans([]);
        setAllTimeLogs([]);
        return;
    }
    setLoading(true);
    try {
        const collections = {
          allEntries: "coverageEntries",
          allDoctors: "doctors",
          allPlans: "plans",
        };

        const q = (coll: string) => query(collection(db, coll), where("userId", "==", userId));
        
        const [entriesSnap, doctorsSnap, plansSnap] = await Promise.all([
            getDocs(q(collections.allEntries)),
            getDocs(q(collections.allDoctors)),
            getDocs(q(collections.allPlans)),
        ]);
        
        const entries = entriesSnap.docs.map(d => ({id: d.id, ...d.data()}) as CoverageEntry);
        const plans = plansSnap.docs.map(d => ({id: d.id, ...d.data()}) as Plan);

        // Sort in memory
        entries.sort((a, b) => {
            const dateA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
            const dateB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
            return dateB - dateA;
        });
        plans.sort((a, b) => {
            const dateA = a.plannedDate ? new Date(a.plannedDate).getTime() : 0;
            const dateB = b.plannedDate ? new Date(b.plannedDate).getTime() : 0;
            return dateB - dateA;
        });
        
        setAllEntries(entries);
        setAllDoctors(doctorsSnap.docs.map(d => ({id: d.id, ...d.data()}) as Doctor));
        setAllPlans(plans);
        
        if (teamSummaryData?.timeLogs) {
            setAllTimeLogs(teamSummaryData.timeLogs.filter(log => log.userId === userId));
        }


    } catch (error) {
         console.error("Error fetching user data:", error);
         toast({ variant: 'destructive', title: 'Error', description: `Failed to load data for user ${userId}.`})
    } finally {
        setLoading(false);
    }
  }, [toast, teamSummaryData]);


  const updateNonCallDayStatus = useCallback(async (id: string, status: 'approved' | 'rejected') => {
      try {
          const docRef = doc(db, 'nonCallDays', id);
          await updateDoc(docRef, { status });
          setAllNonCallDays(prev => prev.map(d => d.id === id ? {...d, status} : d));
          toast({ title: 'Success', description: `Request has been ${status}.`});
      } catch (error) {
          toast({ variant: 'destructive', title: 'Error', description: 'Failed to update request status.' });
      }
  }, [toast]);
  
  const updatePlanningRequestStatus = useCallback(async (id: string, status: 'approved' | 'rejected') => {
      try {
          const docRef = doc(db, 'planningRequests', id);
          await updateDoc(docRef, { status });
          setAllPlanningRequests(prev => prev.map(r => r.id === id ? {...r, status} : r));
          toast({ title: 'Success', description: `Request has been ${status}.` });
      } catch (error) {
          toast({ variant: 'destructive', title: 'Error', description: 'Failed to update request status.' });
      }
  }, [toast]);

  const deleteEntry = useCallback(async (id: string) => {
    try {
        await deleteDoc(doc(db, "coverageEntries", id));
        setAllEntries(prev => prev.filter(e => e.id !== id));
        if (teamSummaryData) {
            setTeamSummaryData(prev => prev ? { ...prev, entries: prev.entries.filter(e => e.id !== id) } : null);
        }
        toast({ variant: 'destructive', title: "Entry Deleted", description: `Coverage report has been removed.` });
    } catch (error) {
        toast({ variant: 'destructive', title: "Delete Failed", description: "Could not delete entry from server." });
    }
  }, [toast, teamSummaryData]);
  
  const addDoctor = useCallback(async (doctorData: Omit<Doctor, 'id'>) => {
    if (!managerId) return;
    try {
      const docRef = await addDoc(collection(db, "doctors"), doctorData);
      const newDoctor = { id: docRef.id, ...doctorData } as Doctor;
      if (teamSummaryData) {
          setTeamSummaryData(prev => prev ? ({ ...prev, doctors: [...prev.doctors, newDoctor] }) : null);
      }
      setAllDoctors(prev => [...prev, newDoctor]);
      toast({ title: "Doctor Added", description: `${doctorData.firstName} ${doctorData.lastName} has been added.` });
    } catch (error) {
       toast({ variant: "destructive", title: "Error", description: "Could not add doctor." });
    }
  }, [managerId, toast, teamSummaryData]);

  const updateDoctor = useCallback(async (doctorData: Doctor) => {
    try {
        const { id, ...dataToUpdate } = doctorData;
        const doctorRef = doc(db, "doctors", id);
        await updateDoc(doctorRef, dataToUpdate);
        
        if (teamSummaryData) {
            setTeamSummaryData(prev => {
                if (!prev) return null;
                const newDoctors = prev.doctors.map(d => d.id === id ? doctorData : d);
                return { ...prev, doctors: newDoctors };
            });
        }
        setAllDoctors(prev => prev.map(d => d.id === id ? doctorData : d));
        toast({ title: "Doctor Updated", description: `${doctorData.firstName} ${doctorData.lastName}'s details have been updated.` });
    } catch (error) {
        console.error("Error updating doctor:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not update doctor details." });
    }
  }, [toast, teamSummaryData]);
  
  const deleteDoctor = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, "doctors", id));
      if (teamSummaryData) {
        setTeamSummaryData(prev => prev ? ({...prev, doctors: prev.doctors.filter(d => d.id !== id)}) : null);
      }
      setAllDoctors(prev => prev.filter(d => d.id !== id));
      toast({ variant: 'destructive', title: "Doctor Deleted" });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not delete doctor.' });
    }
  }, [toast, teamSummaryData]);
  
  const deleteDoctorsBulk = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const batch = writeBatch(db);
      ids.forEach(id => {
        const docRef = doc(db, "doctors", id);
        batch.delete(docRef);
      });
      await batch.commit();

      if (teamSummaryData) {
        setTeamSummaryData(prev => prev ? ({...prev, doctors: prev.doctors.filter(d => !ids.includes(d.id))}) : null);
      }
      setAllDoctors(prev => prev.filter(d => !ids.includes(d.id)));
      toast({ variant: 'destructive', title: "Doctors Deleted", description: `${ids.length} doctor(s) have been removed.` });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Bulk Delete Failed', description: 'Could not delete the selected doctors.' });
    }
  }, [toast, teamSummaryData]);

  const addDoctorsBulk = useCallback(async (doctorsData: Omit<Doctor, 'id'>[]) => {
    await fetchTeamSummary();
    toast({ title: 'Bulk Add', description: 'Bulk add processed, refreshing data.' });
  }, [fetchTeamSummary, toast]);


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
