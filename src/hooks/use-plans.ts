

"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Plan, Doctor, PlanningPermissionRequest } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format, isSameWeek, startOfToday } from 'date-fns';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, writeBatch } from 'firebase/firestore';

const OFFLINE_PLANS_KEY = 'sfe-offline-plans-v1';

export const usePlans = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [offlinePlans, setOfflinePlans] = useState<Plan[]>([]);
  const [masterPlans, setMasterPlans] = useState<Plan[]>([]);
  const [planningRequests, setPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  const getOfflineKey = useCallback(() => `${OFFLINE_PLANS_KEY}_${user?.uid}`, [user]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchPlansAndRequests = useCallback(async () => {
    if (!user || !isOnline) {
        if(user) setLoading(false);
        return;
    }
    setLoading(true);
    try {
      const plansQuery = query(collection(db, "plans"), where("userId", "==", user.uid));
      const plansSnapshot = await getDocs(plansQuery);
      const fetchedPlans: Plan[] = [];
      plansSnapshot.forEach((doc) => {
        fetchedPlans.push({ id: doc.id, ...doc.data() } as Plan);
      });
      setMasterPlans(fetchedPlans);
      
      const requestsQuery = query(collection(db, "planningRequests"), where("userId", "==", user.uid));
      const requestsSnapshot = await getDocs(requestsQuery);
      const fetchedRequests: PlanningPermissionRequest[] = [];
      requestsSnapshot.forEach((doc) => {
        fetchedRequests.push({ id: doc.id, ...doc.data() } as PlanningPermissionRequest);
      });
      setPlanningRequests(fetchedRequests);

    } catch (error) {
      console.error("Error fetching master plans/requests:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load visit plans or requests." });
    } finally {
        setLoading(false);
    }
  }, [user, isOnline, toast]);
  
  useEffect(() => {
    if (user) {
        setLoading(true);
        try {
            const localData = localStorage.getItem(getOfflineKey());
            if (localData) {
                setOfflinePlans(JSON.parse(localData));
            }
        } catch (error) {
            console.error("Failed to parse offline plans from local storage:", error);
        }
        fetchPlansAndRequests();
    } else {
        setOfflinePlans([]);
        setMasterPlans([]);
        setPlanningRequests([]);
        setLoading(false);
    }
  }, [user, getOfflineKey, fetchPlansAndRequests]);

  const updateOfflineInStorage = (updatedPlans: Plan[]) => {
      setOfflinePlans(updatedPlans);
      localStorage.setItem(getOfflineKey(), JSON.stringify(updatedPlans));
  }

  const addPlan = useCallback(async (doctor: Doctor, plannedDate: Date) => {
    if (!user) return;

    const today = startOfToday();
    const isCurrentWeek = isSameWeek(plannedDate, today, { weekStartsOn: 1 });
    const callType = isCurrentWeek ? 'unplanned' : 'planned';

    const newPlanData = {
      userId: user.uid,
      doctorId: doctor.id,
      doctorFirstName: doctor.firstName,
      doctorLastName: doctor.lastName,
      plannedDate: plannedDate.toISOString(),
      callType: callType,
    };
    
    if (isOnline) {
        try {
            const docRef = await addDoc(collection(db, "plans"), newPlanData);
            setMasterPlans(prev => [...prev, {id: docRef.id, ...newPlanData}])
            toast({ 
                title: "Visit Added", 
                description: `${doctor.firstName} ${doctor.lastName} scheduled for ${format(plannedDate, 'PPP')}.` 
            });
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "Could not save the plan online, saving locally." });
            savePlanOffline(newPlanData);
        }
    } else {
        savePlanOffline(newPlanData);
    }
  }, [toast, user, isOnline]);
  
  const savePlanOffline = (planData: Omit<Plan, 'id'>) => {
      const planWithId = {
          ...planData,
          id: crypto.randomUUID(),
      }
      updateOfflineInStorage([...offlinePlans, planWithId]);
      toast({ title: "Plan Saved Locally", description: "You are offline. Plan will sync when you're back online." });
  }

  const removePlan = useCallback(async (planId: string) => {
    if (!user) return;

    const planToRemove = [...masterPlans, ...offlinePlans].find(p => p.id === planId);
    if(!planToRemove) return;

    // Check if it's an offline plan by checking if the ID is a UUID
    const isOfflinePlan = offlinePlans.some(p => p.id === planId);
    
    if (isOfflinePlan) {
        updateOfflineInStorage(offlinePlans.filter(p => p.id !== planId));
        toast({ variant: 'destructive', title: "Plan Removed", description: `Local plan for ${planToRemove.doctorFirstName} ${planToRemove.doctorLastName} removed.` });
    } else {
        if (isOnline) {
            try {
                await deleteDoc(doc(db, "plans", planId));
                setMasterPlans(prev => prev.filter(p => p.id !== planId));
                toast({ variant: 'destructive', title: "Plan Removed", description: `Visit for ${planToRemove.doctorFirstName} ${planToRemove.doctorLastName} has been removed from server.` });
            } catch (error) {
                toast({ variant: 'destructive', title: "Error", description: "Could not remove the plan from server." });
            }
        } else {
            toast({ variant: 'destructive', title: "Currently Offline", description: "Cannot remove a synced plan while offline." });
        }
    }
  }, [masterPlans, offlinePlans, toast, user, isOnline]);

  const requestPlanningPermission = useCallback(async (weekStartDate: Date, reason: string) => {
    if (!user) return false;

    const newRequest: Omit<PlanningPermissionRequest, 'id'> = {
        userId: user.uid,
        weekStartDate: weekStartDate.toISOString(),
        reason,
        status: 'pending',
        requestedAt: new Date().toISOString(),
    };

    try {
        const docRef = await addDoc(collection(db, "planningRequests"), newRequest);
        setPlanningRequests(prev => [...prev, { id: docRef.id, ...newRequest }]);
        toast({ title: "Request Submitted", description: "Your request to plan calls for this week has been submitted for approval." });
        return true;
    } catch(error) {
        console.error("Error submitting planning permission request", error);
        toast({ variant: "destructive", title: "Request Failed", description: "Could not submit your request. Please try again." });
        return false;
    }
  }, [user, toast]);

  const syncAllOfflinePlans = useCallback(async () => {
    if (!isOnline || !user || offlinePlans.length === 0) {
      return;
    }
    
    const batch = writeBatch(db);
    offlinePlans.forEach(plan => {
        const { id, ...dataToSync } = plan;
        const planRef = doc(collection(db, 'plans'));
        batch.set(planRef, dataToSync);
    });

    try {
        await batch.commit();
        const successCount = offlinePlans.length;
        updateOfflineInStorage([]);
        if(successCount > 0) {
            toast({ title: 'Plan Sync Complete', description: `${successCount} plans synced successfully.` });
        }
        fetchPlansAndRequests();
    } catch (error) {
        console.error('Failed to sync plans:', error);
        toast({ variant: 'destructive', title: 'Sync Error', description: `Failed to sync plans.` });
    }
  }, [isOnline, user, offlinePlans, toast, fetchPlansAndRequests, getOfflineKey]);

  const allPlans = useMemo(() => [...masterPlans, ...offlinePlans], [masterPlans, offlinePlans]);

  return { plans: allPlans, planningRequests, addPlan, removePlan, requestPlanningPermission, loading, syncAllOfflinePlans, offlinePlanCount: offlinePlans.length };
};
