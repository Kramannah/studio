
import { useEffect, useState, useCallback } from "react";
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_UIDS, MANAGER_TEAMS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, MarketingSample, PlanningPermissionRequest, AdminData } from "@/lib/types";
import { useToast } from "./use-toast";


export function useAdminData(managerId?: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [allEntries, setAllEntries] = useState<CoverageEntry[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [allTimeLogs, setAllTimeLogs] = useState<TimeLog[]>([]);
  const [allNonCallDays, setAllNonCallDays] = useState<NonCallDay[]>([]);
  const [allPlanningRequests, setAllPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  const [loading, setLoading] = useState(true);

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
          allTimeLogs: "timeLogs",
        };

        const q = (coll: string) => query(collection(db, coll), where("userId", "==", userId));
        
        const [entriesSnap, doctorsSnap, plansSnap, timeLogsSnap] = await Promise.all([
            getDocs(q(collections.allEntries)),
            getDocs(q(collections.allDoctors)),
            getDocs(q(collections.allPlans)),
            getDocs(q(collections.allTimeLogs)),
        ]);
        
        setAllEntries(entriesSnap.docs.map(d => ({id: d.id, ...d.data()}) as CoverageEntry));
        setAllDoctors(doctorsSnap.docs.map(d => ({id: d.id, ...d.data()}) as Doctor));
        setAllPlans(plansSnap.docs.map(d => ({id: d.id, ...d.data()}) as Plan));
        setAllTimeLogs(timeLogsSnap.docs.map(d => ({id: d.id, ...d.data()}) as TimeLog));

    } catch (error) {
         console.error("Error fetching user data:", error);
         toast({ variant: 'destructive', title: 'Error', description: `Failed to load data for user ${userId}.`})
    } finally {
        setLoading(false);
    }
  }, [toast]);


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
    loading, 
    fetchUserData, 
    updateNonCallDayStatus, 
    updatePlanningRequestStatus, 
    deleteEntry 
  };
}

    