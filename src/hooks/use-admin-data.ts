
"use client"

import { useEffect, useState, useCallback } from "react";
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

  const fetchTeamApprovals = useCallback(async () => {
    if (!user || !managerId) {
        setAllNonCallDays([]);
        setAllPlanningRequests([]);
        setLoading(false);
        return;
    };
    setLoading(true);

    try {
      const userFilter = MANAGER_TEAMS[managerId] || [];
      if (userFilter.length === 0) {
        setAllNonCallDays([]);
        setAllPlanningRequests([]);
        setLoading(false);
        return;
      }
      
      const collections = {
          allNonCallDays: "nonCallDays",
          allPlanningRequests: "planningRequests",
      };

      const results: { allNonCallDays: NonCallDay[], allPlanningRequests: PlanningPermissionRequest[] } = {
          allNonCallDays: [],
          allPlanningRequests: [],
      };

      for (const [key, collName] of Object.entries(collections)) {
        const chunks: string[][] = [];
        for (let i = 0; i < userFilter.length; i += 30) {
            chunks.push(userFilter.slice(i, i + 30));
        }

        const promises = chunks.map(chunk => {
            const q = query(collection(db, collName), where("userId", "in", chunk));
            return getDocs(q);
        });

        const snapshots = await Promise.all(promises);
        const allDocs = snapshots.flatMap(snap => snap.docs);

        results[key as keyof typeof results] = allDocs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as any;
      }
      
      setAllNonCallDays(results.allNonCallDays);
      setAllPlanningRequests(results.allPlanningRequests);

    } catch (error) {
      console.error("Error fetching admin approval data:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load approval data.'})
    } finally {
      setLoading(false);
    }
  }, [user, managerId, toast]);

  useEffect(() => {
    fetchTeamApprovals();
  }, [fetchTeamApprovals]);

  const fetchTeamSummary = useCallback(async () => {
      if (!managerId) {
          setTeamSummaryData(null);
          return;
      }
      setLoadingSummary(true);
      try {
        const userFilter = MANAGER_TEAMS[managerId] || [];
        if (userFilter.length === 0) {
            setTeamSummaryData({ entries: [], timeLogs: [], doctors: [], nonCallDays: [], plans: [], marketingSamples: [], usedQuantities: {} });
            return;
        }

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

        const marketingSamples = marketingSamplesSnap.docs.map(d => ({id: d.id, ...d.data()}) as MarketingSample);
        
        const usedQuantities: Record<string, number> = {};
        combinedData.entries.forEach(entry => {
            if (entry.primarySampleName && entry.primaryProductQty) {
                usedQuantities[entry.primarySampleName] = (usedQuantities[entry.primarySampleName] || 0) + entry.primaryProductQty;
            }
            if (entry.secondarySampleName && entry.secondaryProductQty) {
                usedQuantities[entry.secondarySampleName] = (usedQuantities[entry.secondarySampleName] || 0) + entry.secondaryProductQty;
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
        
        setAllEntries(entriesSnap.docs.map(d => ({id: d.id, ...d.data()}) as CoverageEntry));
        setAllDoctors(doctorsSnap.docs.map(d => ({id: d.id, ...d.data()}) as Doctor));
        setAllPlans(plansSnap.docs.map(d => ({id: d.id, ...d.data()}) as Plan));
        
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
        // Explicitly destructure to separate non-updatable fields
        const { id, userId, ...dataToUpdate } = doctorData;
        const doctorRef = doc(db, "doctors", id);

        await updateDoc(doctorRef, dataToUpdate);
        
        const updatedDoctor = { id, userId, ...dataToUpdate };

        if (teamSummaryData) {
            setTeamSummaryData(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    doctors: prev.doctors.map(d => d.id === id ? updatedDoctor : d)
                };
            });
        }
        setAllDoctors(prev => prev.map(d => d.id === id ? updatedDoctor : d));
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
    // This is scoped to a manager's team, but bulk adding might need a different context.
    // For now, let's just refresh the list for simplicity.
    await fetchTeamSummary();
    toast({ title: 'Bulk Add', description: 'Bulk add in admin view not fully implemented, refreshing data.' });
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
