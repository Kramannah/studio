
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Plan, Doctor, PlanningPermissionRequest } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { getQueryStartDateISO } from '@/lib/utils';
import { useAuth } from './use-auth';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { isToday } from 'date-fns';

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

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    if (isOnline && db) {
      try {
        const startDate = getQueryStartDateISO();
        
        const plansQuery = query(
          collection(db, "plans"), 
          where("userId", "==", user.uid)
        );
        
        const requestsQuery = query(collection(db, "planningRequests"), where("userId", "==", user.uid));
        
        const [plansSnapshot, requestsSnapshot] = await Promise.all([
          getDocs(plansQuery),
          getDocs(requestsQuery),
        ]);

        const allPlans: Plan[] = [];
        plansSnapshot.forEach((doc) => {
          const data = doc.data() as Plan;
          if (data.plannedDate && data.plannedDate >= startDate) {
              allPlans.push({ id: doc.id, ...data });
          }
        });

        allPlans.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
        setMasterPlans(allPlans);
        
        const fetchedRequests: PlanningPermissionRequest[] = [];
        requestsSnapshot.forEach((doc) => {
            fetchedRequests.push({ id: doc.id, ...doc.data() } as PlanningPermissionRequest);
        });
        setPlanningRequests(fetchedRequests);

      } catch (serverError: any) {
        const permissionError = new FirestorePermissionError({
          path: 'plans',
          operation: 'list',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
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
    if (!user || !db) return;
    
    // If planned for today, it should be marked as unplanned
    const callType = isToday(plannedDate) ? 'unplanned' : 'planned';
    
    const newPlanData = {
      userId: user.uid,
      doctorId: doctor.id,
      doctorFirstName: doctor.firstName,
      doctorLastName: doctor.lastName,
      plannedDate: plannedDate.toISOString(),
      callType: callType as 'planned' | 'unplanned',
    };
    
    const colRef = collection(db, "plans");
    addDoc(colRef, newPlanData)
      .then((docRef) => {
        setMasterPlans(prev => [...prev, {id: docRef.id, ...newPlanData}]);
        toast({ title: "Visit Scheduled" });
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: colRef.path,
          operation: 'create',
          requestResourceData: newPlanData,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
        setOfflinePlans(prev => [...prev, { id: crypto.randomUUID(), ...newPlanData }]);
      });
  }, [user, toast]);

  const addPlansBulk = useCallback(async (doctors: Doctor[], plannedDate: Date) => {
    if (!user || !db || doctors.length === 0) return;
    
    const batch = writeBatch(db);
    const dateISO = plannedDate.toISOString();
    const callType = isToday(plannedDate) ? 'unplanned' : 'planned';
    
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
        toast({ title: "Visits Scheduled", description: `Added ${doctors.length} doctors to your plan.` });
        return true;
    } catch (serverError: any) {
        const permissionError = new FirestorePermissionError({
          path: 'plans',
          operation: 'write',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
        return false;
    }
  }, [user, toast]);

  const removePlan = async (id: string) => {
    if (!db) return;
    const docRef = doc(db, "plans", id);
    deleteDoc(docRef)
      .then(() => {
        setMasterPlans(prev => prev.filter(p => p.id !== id));
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
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
    const colRef = collection(db, 'planningRequests');
    try {
        await addDoc(colRef, newRequest);
        return true;
    } catch (serverError: any) {
        const permissionError = new FirestorePermissionError({
          path: colRef.path,
          operation: 'create',
          requestResourceData: newRequest,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
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
    
    batch.commit()
      .then(async () => {
        localStorage.setItem(getOfflineKey(), JSON.stringify([]));
        setOfflinePlans([]);
        await fetchData();
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: 'plans',
          operation: 'create',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
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
