
import { useEffect, useState, useCallback } from "react";
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_UIDS, MANAGER_TEAMS } from "@/lib/admins";
import { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, MarketingSample, PlanningPermissionRequest, AdminData } from "@/lib/types";
import { useToast } from "./use-toast";


export function useAdminData() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<Omit<AdminData, "loading">>({
    allEntries: [],
    allDoctors: [],
    allPlans: [],
    allNonCallDays: [],
    allTimeLogs: [],
    allPlanningRequests: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) {
        setLoading(false);
        return;
    };
    setLoading(true);

    try {
      let userFilter: string[] | null = null;
      if (ADMIN_UIDS.includes(user.uid)) {
        userFilter = null;
      } else if (MANAGER_TEAMS[user.uid]) {
        userFilter = [...MANAGER_TEAMS[user.uid], user.uid]; 
      } else {
        userFilter = [user.uid];
      }

      const collections = {
          allEntries: "coverageEntries",
          allDoctors: "doctors",
          allPlans: "plans",
          allNonCallDays: "nonCallDays",
          allTimeLogs: "timeLogs",
          allPlanningRequests: "planningRequests",
      };

      const results: Partial<AdminData> = {};

      for (const [key, collName] of Object.entries(collections)) {
        let q;
        if (userFilter) {
          q = query(collection(db, collName), where("userId", "in", userFilter));
        } else {
          q = query(collection(db, collName));
        }
        const snap = await getDocs(q);
        results[key as keyof AdminData] = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as any;
      }

      setData(results as Omit<AdminData, "loading">);
    } catch (error) {
      console.error("Error fetching admin data:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load dashboard data.'})
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateNonCallDayStatus = useCallback(async (id: string, status: 'approved' | 'rejected') => {
      try {
          const docRef = doc(db, 'nonCallDays', id);
          await updateDoc(docRef, { status });
          setData(prev => ({
              ...prev,
              allNonCallDays: prev.allNonCallDays.map(d => d.id === id ? {...d, status} : d)
          }));
          toast({ title: 'Success', description: `Request has been ${status}.`});
      } catch (error) {
          toast({ variant: 'destructive', title: 'Error', description: 'Failed to update request status.' });
      }
  }, [toast]);
  
  const updatePlanningRequestStatus = useCallback(async (id: string, status: 'approved' | 'rejected') => {
      try {
          const docRef = doc(db, 'planningRequests', id);
          await updateDoc(docRef, { status });
          setData(prev => ({
              ...prev,
              allPlanningRequests: prev.allPlanningRequests.map(r => r.id === id ? {...r, status} : r)
          }));
          toast({ title: 'Success', description: `Request has been ${status}.` });
      } catch (error) {
          toast({ variant: 'destructive', title: 'Error', description: 'Failed to update request status.' });
      }
  }, [toast]);

  const deleteEntry = useCallback(async (id: string) => {
    try {
        await deleteDoc(doc(db, "coverageEntries", id));
        setData(prev => ({ ...prev, allEntries: prev.allEntries.filter(e => e.id !== id) }));
        toast({ variant: 'destructive', title: "Entry Deleted", description: `Coverage report has been removed.` });
    } catch (error) {
        toast({ variant: 'destructive', title: "Delete Failed", description: "Could not delete entry from server." });
    }
  }, [toast]);

  return { ...data, loading, fetchAllData: fetchData, updateNonCallDayStatus, updatePlanningRequestStatus, deleteEntry };
}
