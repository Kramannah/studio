
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Plan, Doctor } from '@/lib/types';
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

  const fetchMasterPlans = useCallback(async () => {
    if (!user || !isOnline) {
        if(user) setLoading(false);
        return;
    }
    setLoading(true);
    try {
      const q = query(collection(db, "plans"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const fetchedPlans: Plan[] = [];
      querySnapshot.forEach((doc) => {
        fetchedPlans.push({ id: doc.id, ...doc.data() } as Plan);
      });
      setMasterPlans(fetchedPlans);
    } catch (error) {
      console.error("Error fetching master plans:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load visit plans." });
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
        fetchMasterPlans();
    } else {
        setOfflinePlans([]);
        setMasterPlans([]);
        setLoading(false);
    }
  }, [user, getOfflineKey, fetchMasterPlans]);

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
        try {
            await deleteDoc(doc(db, "plans", planId));
            setMasterPlans(prev => prev.filter(p => p.id !== planId));
            toast({ variant: 'destructive', title: "Plan Removed", description: `Visit for ${planToRemove.doctorFirstName} ${planToRemove.doctorLastName} has been removed from server.` });
        } catch (error) {
            toast({ variant: 'destructive', title: "Error", description: "Could not remove the plan from server." });
        }
    }
  }, [masterPlans, offlinePlans, toast, user]);

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
        toast({ title: 'Plan Sync Complete', description: `${successCount} plans synced successfully.` });
        fetchMasterPlans();
    } catch (error) {
        console.error('Failed to sync plans:', error);
        toast({ variant: 'destructive', title: 'Sync Error', description: `Failed to sync plans.` });
    }
  }, [isOnline, user, offlinePlans, toast, fetchMasterPlans, getOfflineKey]);

  const allPlans = useMemo(() => [...masterPlans, ...offlinePlans], [masterPlans, offlinePlans]);

  return { plans: allPlans, addPlan, removePlan, loading, syncAllOfflinePlans, offlinePlanCount: offlinePlans.length };
};
