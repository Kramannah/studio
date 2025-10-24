
import { useEffect, useState, useCallback } from "react";
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_UIDS, MANAGER_TEAMS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest } from "@/lib/types";
import { useToast } from "./use-toast";

export interface TeamSummaryData {
    entries: CoverageEntry[];
    doctors: Doctor[];
    nonCallDays: NonCallDay[];
    timeLogs: TimeLog[];
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
            setTeamSummaryData({ entries: [], timeLogs: [], doctors: [], nonCallDays: [] });
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

            const [entriesSnap, timeLogsSnap, doctorsSnap, nonCallDaysSnap] = await Promise.all([
                entriesPromise,
                timeLogsPromise,
                doctorsPromise,
                nonCallDaysPromise,
            ]);

            return {
                entries: entriesSnap.docs.map(d => ({ id: d.id, ...d.data() }) as CoverageEntry),
                timeLogs: timeLogsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as TimeLog),
                doctors: doctorsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Doctor),
                nonCallDays: nonCallDaysSnap.docs.map(d => ({ id: d.id, ...d.data() }) as NonCallDay),
            }
        };

        const chunkResults = await Promise.all(chunks.map(fetchDataForChunk));

        const combinedData: TeamSummaryData = chunkResults.reduce((acc, current) => {
            acc.entries.push(...current.entries);
            acc.timeLogs.push(...current.timeLogs);
            acc.doctors.push(...current.doctors);
            acc.nonCallDays.push(...current.nonCallDays);
            return acc;
        }, { entries: [], timeLogs: [], doctors: [], nonCallDays: [] });
        
        setTeamSummaryData(combinedData);
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
        toast({ variant: 'destructive', title: "Entry Deleted", description: `Coverage report has been removed.` });
    } catch (error) {
        toast({ variant: 'destructive', title: "Delete Failed", description: "Could not delete entry from server." });
    }
  }, [toast]);

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
    deleteEntry 
  };
}

    