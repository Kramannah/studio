"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Plan, Doctor, PlanningPermissionRequest } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, writeBatch, orderBy } from 'firebase/firestore';
import { isSyncWindowOpen, getQueryStartDateISO } from '@/lib/utils';

const OFFLINE_PLANS_KEY = 'sfe-offline-plans-v2';

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

  const fetchData = useCallback(async (forceAllWeek = false) => {
    if (!user) return;
    setLoading(true);

    if (isOnline) {
      try {
        const startDate = getQueryStartDateISO(forceAllWeek);
        
        // Optimize query to only fetch relevant plans for the current period
        const plansQuery = query(
          collection(db, "plans"), 
          where("userId", "==", user.uid),
          where("plannedDate", ">=", startDate),
          orderBy("plannedDate", "asc")
        );
        
        const requestsQuery = query(collection(db, "planningRequests"), where("userId", "==", user.uid));
        
        const [plansSnapshot, requestsSnapshot] = await Promise.all([
          getDocs(plansQuery),
          getDocs(requestsQuery),
        ]);

        const allPlans: Plan[] = [];
        plansSnapshot.forEach((doc) => {
          allPlans.push({ id: doc.id, ...doc.data() } as Plan);
        });

        setMasterPlans(allPlans);
        
        const fetchedRequests: PlanningPermissionRequest[] = [];
        requestsSnapshot.forEach((doc) => {
            fetchedRequests.push({ id: doc.id, ...doc.data() } as PlanningPermissionRequest);
        });
        setPlanningRequests(fetchedRequests);

      } catch (error) {
        console.error("Error fetching plans:", error);
      }
    }
    
    try {
        const localData = localStorage.getItem(getOfflineKey());
        if (localData) setOfflinePlans(JSON.parse(localData));
    } catch (error) {}
    
    setLoading(false);
  }, [user, isOnline, getOfflineKey]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addPlan = useCallback(async (doctor: Doctor, plannedDate: Date) => {
    if (!user) return;
    const newPlanData = {
      userId: user.uid,
      doctorId: doctor.id,
      doctorFirstName: doctor.firstName,
      doctorLastName: doctor.lastName,
      plannedDate: plannedDate.toISOString(),
      callType: 'planned' as const,
    };
    
    try {
        const docRef = await addDoc(collection(db, "plans"), newPlanData);
        setMasterPlans(prev => [...prev, {id: docRef.id, ...newPlanData}]);
        toast({ title: "Visit Scheduled" });
    } catch (error) {
        setOfflinePlans(prev => [...prev, { id: crypto.randomUUID(), ...newPlanData }]);
    }
  }, [user, toast]);

  const syncAllOfflinePlans = useCallback(async () => {
    if (!isOnline || !user || offlinePlans.length === 0) return;
    const batch = writeBatch(db);
    offlinePlans.forEach(plan => {
        const { id, ...dataToSync } = plan;
        batch.set(doc(collection(db, 'plans')), dataToSync);
    });
    await batch.commit();
    localStorage.setItem(getOfflineKey(), JSON.stringify([]));
    setOfflinePlans([]);
    await fetchData();
  }, [isOnline, user, offlinePlans, fetchData, getOfflineKey]);

  const allPlans = useMemo(() => [...masterPlans, ...offlinePlans], [masterPlans, offlinePlans]);

  return { 
      plans: allPlans, 
      planningRequests,
      addPlan, 
      removePlan: async (id: string) => {
          await deleteDoc(doc(db, "plans", id));
          setMasterPlans(prev => prev.filter(p => p.id !== id));
      }, 
      requestPlanningPermission: async (week: Date, reason: string) => {
          await addDoc(collection(db, 'planningRequests'), { userId: user?.uid, weekStartDate: week.toISOString(), reason, status: 'pending', requestedAt: new Date().toISOString() });
          return true;
      },
      loading, 
      syncAllOfflinePlans: offlinePlans.length > 0 ? syncAllOfflinePlans : undefined,
      fetchData
  };
};

import { useAuth } from './use-auth';
