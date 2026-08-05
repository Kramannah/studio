
"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Plan, Doctor, PlanningPermissionRequest } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, writeBatch, limit } from 'firebase/firestore';
import { isToday, isBefore, startOfToday, isValid, parseISO, isWithinInterval, startOfMonth, endOfMonth, subMonths, addMonths, format } from 'date-fns';
import { useAuth } from './use-auth';
import { getMonthRangeISO, parseAnyDate, safeStorageSet } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const PLANS_STORAGE_KEY = 'sfe-plans-v6';
const CACHE_TTL = 20 * 60 * 1000; // 20 Minutes

export const usePlans = (active: boolean = true, selectedMonth?: string) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [offlinePlans, setOfflinePlans] = useState<Plan[]>([]);
  const [masterPlans, setMasterPlans] = useState<Plan[]>([]);
  const [planningRequests, setPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  
  const lastFetchedKeyRef = useRef<string | null>(null);
  const lastFetchTimeRef = useRef<number>(0);

  useEffect(() => {
    if (user) {
        const cacheKey = `${PLANS_STORAGE_KEY}_${user.uid}_${selectedMonth || 'current'}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const { data, requests, timestamp } = JSON.parse(cached);
                setMasterPlans(data || []);
                setPlanningRequests(requests || []);
                lastFetchTimeRef.current = timestamp || 0;
            } catch (e) {
                setMasterPlans([]);
            }
        } else {
            setMasterPlans([]);
        }
    }
  }, [user, selectedMonth]);

  const fetchData = useCallback(async (force = false) => {
    if (!user || !db || (!active && !force) || !navigator.onLine) return;
    
    const fetchKey = `${user.uid}_${selectedMonth || 'current'}`;
    const now = Date.now();
    
    if (!force && lastFetchedKeyRef.current === fetchKey && (now - lastFetchTimeRef.current < CACHE_TTL) && masterPlans.length > 0) {
        return;
    }

    setLoading(true);
    
    try {
      const refDate = selectedMonth ? parseISO(selectedMonth + "-01") : new Date();
      const rangeStart = startOfMonth(subMonths(refDate, 1)).toISOString();
      const rangeEnd = endOfMonth(addMonths(refDate, 1)).toISOString();
      const interval = { start: parseISO(rangeStart), end: parseISO(rangeEnd) };

      const plansQuery = query(
        collection(db, "plans"), 
        where("userId", "==", user.uid),
        where("plannedDate", ">=", rangeStart),
        where("plannedDate", "<=", rangeEnd),
        limit(1500)
      );
      
      const requestsQuery = query(
        collection(db, "planningRequests"), 
        where("userId", "==", user.uid),
        limit(300)
      );
      
      const [plansSnapshot, requestsSnapshot] = await Promise.all([
        getDocs(plansQuery).catch(async (error) => {
           console.warn("Plans fallback:", error.message);
           const fallbackQ = query(collection(db, "plans"), where("userId", "==", user.uid), limit(1500));
           const snap = await getDocs(fallbackQ);
           
           const filtered = snap.docs
               .map(d => ({ id: d.id, ...d.data() } as Plan))
               .filter(d => {
                   const date = parseAnyDate(d.plannedDate);
                   return date && isValid(date) && isWithinInterval(date, interval);
               });
               
           return { docs: filtered.map(d => ({ id: d.id, data: () => d })) } as any;
        }),
        getDocs(requestsQuery),
      ]);

      const plans = (plansSnapshot.docs || []).map((doc: any) => ({ id: doc.id, ...doc.data() } as Plan));
      const requests = (requestsSnapshot.docs || []).map(doc => ({ id: doc.id, ...doc.data() } as PlanningPermissionRequest));
      
      const sortedPlans = plans.sort((a, b) => (b.plannedDate || "").localeCompare(a.plannedDate || ""));
      const sortedRequests = requests.sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));
      
      setMasterPlans(sortedPlans);
      setPlanningRequests(sortedRequests);
      lastFetchedKeyRef.current = fetchKey;
      lastFetchTimeRef.current = now;

      safeStorageSet(`${PLANS_STORAGE_KEY}_${user.uid}_${selectedMonth || 'current'}`, JSON.stringify({ 
          data: sortedPlans, 
          requests: sortedRequests,
          timestamp: now 
      }));
    } catch (error) {
        console.error("Fetch plans failure:", error);
    } finally {
        setLoading(false);
    }
  }, [user, active, selectedMonth, masterPlans.length]);

  useEffect(() => {
    if (active && user) {
        fetchData();
    }
  }, [fetchData, active, user]);

  const addPlan = useCallback(async (doctor: Doctor, plannedDate: Date) => {
    if (!user || !db) return;
    const callType = (isToday(plannedDate) || isBefore(plannedDate, startOfToday())) ? 'unplanned' : 'planned';
    const newPlan = {
      userId: user.uid,
      doctorId: doctor.id,
      doctorFirstName: doctor.firstName,
      doctorLastName: doctor.lastName,
      plannedDate: plannedDate.toISOString(),
      callType: callType as 'planned' | 'unplanned',
    };
    
    addDoc(collection(db, "plans"), newPlan)
      .then((docRef) => {
        setMasterPlans(prev => [...prev, {id: docRef.id, ...newPlan}]);
        toast({ title: "Scheduled" });
      })
      .catch(async (error) => {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'plans',
                operation: 'create',
                requestResourceData: newPlan,
            }));
        } else {
            setOfflinePlans(prev => [...prev, { id: crypto.randomUUID(), ...newPlan }]);
        }
      });
  }, [user, toast]);

  const addPlansBulk = useCallback(async (doctors: Doctor[], plannedDate: Date) => {
    if (doctors.length === 0 || !user || !db) return false;
    const batch = writeBatch(db);
    const dateISO = plannedDate.toISOString();
    const callType = (isToday(plannedDate) || isBefore(plannedDate, startOfToday())) ? 'unplanned' : 'planned';
    
    const newPlans: any[] = doctors.map(doctor => ({
      userId: user.uid,
      doctorId: doctor.id,
      doctorFirstName: doctor.firstName,
      doctorLastName: doctor.lastName,
      plannedDate: dateISO,
      callType: callType as 'planned' | 'unplanned',
    }));

    newPlans.forEach(data => {
        batch.set(doc(collection(db, "plans")), data);
    });

    return batch.commit()
      .then(() => {
        setMasterPlans(prev => [...prev, ...newPlans.map((p, i) => ({ id: `new_${i}`, ...p }))]);
        toast({ title: "Visits Scheduled" });
        fetchData(true);
        return true;
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'plans',
            operation: 'create',
            requestResourceData: newPlans,
        }));
        return false;
      });
  }, [user, toast, fetchData]);

  const removePlan = async (id: string) => {
    if (!db) return;
    const docRef = doc(db, "plans", id);
    deleteDoc(docRef)
      .then(() => {
        setMasterPlans(prev => prev.filter(p => p.id !== id));
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        }));
      });
  };

  const requestPlanningPermission = async (week: Date, reason: string) => {
    if (!db || !user) return false;
    const newRequest = { 
        userId: user.uid, 
        weekStartDate: week.toISOString(), 
        reason, 
        status: 'pending', 
        requestedAt: new Date().toISOString() 
    };
    
    return addDoc(collection(db, 'planningRequests'), newRequest)
      .then(() => true)
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'planningRequests',
            operation: 'create',
            requestResourceData: newRequest,
        }));
        return false;
      });
  };

  const allPlans = useMemo(() => [...masterPlans, ...offlinePlans], [masterPlans, offlinePlans]);

  return { plans: allPlans, planningRequests, addPlan, addPlansBulk, removePlan, requestPlanningPermission, loading, fetchData };
};
