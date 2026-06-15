
"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Plan, Doctor, PlanningPermissionRequest } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, writeBatch, limit } from 'firebase/firestore';
import { getMonthRangeISO, parseAnyDate } from '@/lib/utils';
import { useAuth } from './use-auth';
import { isToday, isBefore, startOfToday, parseISO, isValid, isWithinInterval } from 'date-fns';

const OFFLINE_PLANS_KEY = 'sfe-offline-plans-v2';

export const usePlans = (active: boolean = true, selectedMonth?: string) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [offlinePlans, setOfflinePlans] = useState<Plan[]>([]);
  const [masterPlans, setMasterPlans] = useState<Plan[]>([]);
  const [planningRequests, setPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  
  const lastFetchedKeyRef = useRef<string | null>(null);

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

  const fetchData = useCallback(async (force = false) => {
    if (!user || !active) {
        if (!active) setLoading(false);
        return;
    }
    
    const fetchKey = `${user.uid}_${selectedMonth}`;
    if (!force && lastFetchedKeyRef.current === fetchKey && masterPlans.length > 0) {
        setLoading(false);
        return;
    }

    setLoading(true);

    if (isOnline && db) {
      try {
        const { start, end } = getMonthRangeISO(selectedMonth);
        const interval = { start: parseISO(start), end: parseISO(end) };
        
        const plansQuery = query(
          collection(db, "plans"), 
          where("userId", "==", user.uid),
          limit(2000)
        );
        
        const requestsQuery = query(
            collection(db, "planningRequests"), 
            where("userId", "==", user.uid),
            limit(200)
        );
        
        const [plansSnapshot, requestsSnapshot] = await Promise.all([
          getDocs(plansQuery),
          getDocs(requestsQuery),
        ]);

        const filteredPlans: Plan[] = [];
        plansSnapshot.forEach((doc) => {
          const data = doc.data() as Plan;
          const date = parseAnyDate(data.plannedDate);
          if (date && isValid(date) && isWithinInterval(date, interval)) {
              filteredPlans.push({ id: doc.id, ...data });
          }
        });

        filteredPlans.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
        setMasterPlans(filteredPlans);
        lastFetchedKeyRef.current = fetchKey;
        
        const fetchedRequests: PlanningPermissionRequest[] = [];
        requestsSnapshot.forEach((doc) => {
            fetchedRequests.push({ id: doc.id, ...(doc.data() as PlanningPermissionRequest) });
        });
        setPlanningRequests(fetchedRequests);

      } catch (serverError: any) {
        console.error("Plans fetch error:", serverError);
      }
    }
    
    try {
        const localData = localStorage.getItem(getOfflineKey());
        if (localData) setOfflinePlans(JSON.parse(localData));
    } catch (error) {}
    
    setLoading(false);
  }, [user, isOnline, getOfflineKey, active, masterPlans.length, selectedMonth]);
  
  useEffect(() => {
    if (active) {
        fetchData();
    }
  }, [fetchData, active]);

  const addPlan = useCallback(async (doctor: Doctor, plannedDate: Date) => {
    if (!user || !db) return;
    
    const callType = (isToday(plannedDate) || isBefore(plannedDate, startOfToday())) ? 'unplanned' : 'planned';
    
    const newPlanData = {
      userId: user.uid,
      doctorId: doctor.id,
      doctorFirstName: doctor.firstName,
      doctorLastName: doctor.lastName,
      plannedDate: plannedDate.toISOString(),
      callType: callType as 'planned' | 'unplanned',
    };
    
    try {
        const docRef = await addDoc(collection(db, "plans"), newPlanData);
        setMasterPlans(prev => [...prev, {id: docRef.id, ...newPlanData}]);
        toast({ title: "Scheduled" });
    } catch (error) {
        setOfflinePlans(prev => [...prev, { id: crypto.randomUUID(), ...newPlanData }]);
    }
  }, [user, toast]);

  const addPlansBulk = useCallback(async (doctors: Doctor[], plannedDate: Date) => {
    if (!user || !db || doctors.length === 0) return;
    
    const batch = writeBatch(db);
    const dateISO = plannedDate.toISOString();
    const callType = (isToday(plannedDate) || isBefore(plannedDate, startOfToday())) ? 'unplanned' : 'planned';
    
    const newPlans: Plan[] = [];

    doctors.forEach(doctor => {
        const docRef = doc(collection(db, "plans"));
        const newPlan = {
            userId: user.uid,
            doctorId: doctor.id,
            doctorFirstName: doctor.firstName,
            doctorLastName: doctor.lastName,
            plannedDate: dateISO,
            callType: callType as 'planned' | 'unplanned',
        };
        batch.set(docRef, newPlan);
        newPlans.push({ id: docRef.id, ...newPlan });
    });

    try {
        await batch.commit();
        setMasterPlans(prev => [...prev, ...newPlans]);
        toast({ title: "Visits Scheduled", description: `Added ${doctors.length} doctors.` });
        return true;
    } catch (error) {
        console.error("Bulk scheduling failed:", error);
        return false;
    }
  }, [user, toast]);

  const removePlan = async (id: string) => {
    if (!db) return;
    try {
        await deleteDoc(doc(db, "plans", id));
        setMasterPlans(prev => prev.filter(p => p.id !== id));
    } catch (e) {}
  };

  const requestPlanningPermission = async (week: Date, reason: string) => {
    if (!db) return false;
    const newRequest = {
        userId: user?.uid,
        weekStartDate: week.toISOString(),
        reason,
        status: 'pending',
        requestedAt: new Date().toISOString()
    };
    try {
        await addDoc(collection(db, 'planningRequests'), newRequest);
        return true;
    } catch (e) {
        return false;
    }
  };

  const syncAllOfflinePlans = useCallback(async () => {
    if (!isOnline || !user || !db || offlinePlans.length === 0) return;
    const batch = writeBatch(db);
    offlinePlans.forEach(plan => {
        const { id, ...dataToSync } = plan;
        batch.set(doc(collection(db, 'plans')), dataToSync);
    });
    
    try {
        await batch.commit();
        localStorage.setItem(getOfflineKey(), JSON.stringify([]));
        setOfflinePlans([]);
        await fetchData(true);
    } catch (e) {}
  }, [isOnline, user, offlinePlans, fetchData, getOfflineKey]);

  const allPlans = useMemo(() => [...masterPlans, ...offlinePlans], [masterPlans, offlinePlans]);

  return { 
      plans: allPlans, 
      planningRequests,
      addPlan, 
      addPlansBulk,
      removePlan, 
      requestPlanningPermission,
      loading, 
      syncAllOfflinePlans: offlinePlans.length > 0 ? syncAllOfflinePlans : undefined,
      fetchData
  };
};
