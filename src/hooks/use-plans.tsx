
"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Plan, Doctor, PlanningPermissionRequest } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, writeBatch, limit, orderBy } from 'firebase/firestore';
import { getMonthRangeISO } from '@/lib/utils';
import { useAuth } from './use-auth';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
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
        setLoading(false);
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
        
        // OPTIMIZATION: Fetch monthly plans directly
        const plansQuery = query(
          collection(db, "plans"), 
          where("userId", "==", user.uid),
          where("plannedDate", ">=", start),
          where("plannedDate", "<=", end),
          limit(1000)
        );
        
        const requestsQuery = query(
            collection(db, "planningRequests"), 
            where("userId", "==", user.uid),
            limit(100)
        );
        
        const [plansSnapshot, requestsSnapshot] = await Promise.all([
          getDocs(plansQuery).catch(() => getDocs(query(collection(db!, "plans"), where("userId", "==", user.uid), orderBy("plannedDate", "desc"), limit(500)))),
          getDocs(requestsQuery),
        ]);

        const filteredPlans: Plan[] = [];
        plansSnapshot.forEach((doc) => {
          const data = doc.data() as Plan;
          const d = parseISO(data.plannedDate);
          if (isValid(d) && isWithinInterval(d, { start: parseISO(start), end: parseISO(end) })) {
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
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'plans',
          operation: 'list',
        } satisfies SecurityRuleContext));
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
    
    const colRef = collection(db, "plans");
    addDoc(colRef, newPlanData)
      .then((docRef) => {
        setMasterPlans(prev => [...prev, {id: docRef.id, ...newPlanData}]);
        toast({ title: "Scheduled" });
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
    } catch (serverError: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'plans',
          operation: 'write',
        } satisfies SecurityRuleContext));
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
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        } satisfies SecurityRuleContext));
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
    try {
        await addDoc(collection(db, 'planningRequests'), newRequest);
        return true;
    } catch (serverError: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'planningRequests',
          operation: 'create',
          requestResourceData: newRequest,
        }));
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
        await fetchData(true);
      })
      .catch(async (serverError) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'plans',
          operation: 'create',
        }));
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
