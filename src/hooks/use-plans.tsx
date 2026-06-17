
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Plan, Doctor, PlanningPermissionRequest } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, writeBatch, limit, startAt, endAt } from 'firebase/firestore';
import { isToday, isBefore, startOfToday, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { useAuth } from './use-auth';

/**
 * LOW-COST V2: Restricts plan fetching to a specific date range (current month +/- 1 month)
 * to prevent over-scanning history for veteran accounts.
 */
export const usePlans = (active: boolean = true) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [offlinePlans, setOfflinePlans] = useState<Plan[]>([]);
  const [masterPlans, setMasterPlans] = useState<Plan[]>([]);
  const [planningRequests, setPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user || !db || !active || !navigator.onLine) return;
    setLoading(true);
    
    try {
      // LOW-COST V2: Only fetch plans from last month to next month (3-month window)
      const rangeStart = startOfMonth(subMonths(new Date(), 1)).toISOString();
      const rangeEnd = endOfMonth(addMonths(new Date(), 1)).toISOString();

      const plansQuery = query(
        collection(db, "plans"), 
        where("userId", "==", user.uid),
        where("plannedDate", ">=", rangeStart),
        where("plannedDate", "<=", rangeEnd),
        limit(2000)
      );
      
      const requestsQuery = query(
        collection(db, "planningRequests"), 
        where("userId", "==", user.uid),
        limit(50)
      );
      
      const [plansSnapshot, requestsSnapshot] = await Promise.all([
        getDocs(plansQuery).catch(() => {
           // Fallback if index missing
           return getDocs(query(collection(db, "plans"), where("userId", "==", user.uid), limit(1000)));
        }),
        getDocs(requestsQuery),
      ]);

      const plans = plansSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Plan));
      const requests = requestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlanningPermissionRequest));
      
      setMasterPlans(plans.sort((a, b) => (b.plannedDate || "").localeCompare(a.plannedDate || "")));
      setPlanningRequests(requests.sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || "")));
    } catch (error) {
        console.error("Fetch plans error:", error);
    } finally {
        setLoading(false);
    }
  }, [user, active]);

  useEffect(() => {
    if (active) fetchData();
  }, [fetchData, active]);

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
    try {
        const docRef = await addDoc(collection(db, "plans"), newPlan);
        setMasterPlans(prev => [...prev, {id: docRef.id, ...newPlan}]);
        toast({ title: "Scheduled" });
    } catch (error) {
        setOfflinePlans(prev => [...prev, { id: crypto.randomUUID(), ...newPlan }]);
    }
  }, [user, toast]);

  const addPlansBulk = useCallback(async (doctors: Doctor[], plannedDate: Date) => {
    if (doctors.length === 0 || !user || !db) return false;
    const batch = writeBatch(db);
    const dateISO = plannedDate.toISOString();
    const callType = (isToday(plannedDate) || isBefore(plannedDate, startOfToday())) ? 'unplanned' : 'planned';
    
    const newPlans: Plan[] = doctors.map(doctor => {
        const docRef = doc(collection(db, "plans"));
        const data = { userId: user.uid, doctorId: doctor.id, doctorFirstName: doctor.firstName, doctorLastName: doctor.lastName, plannedDate: dateISO, callType: callType as 'planned' | 'unplanned' };
        batch.set(docRef, data);
        return { id: docRef.id, ...data };
    });

    try {
        await batch.commit();
        setMasterPlans(prev => [...prev, ...newPlans]);
        toast({ title: "Visits Scheduled" });
        return true;
    } catch (error) {
        return false;
    }
  }, [user, toast]);

  const removePlan = async (id: string) => {
    if (!db) return;
    await deleteDoc(doc(db, "plans", id));
    setMasterPlans(prev => prev.filter(p => p.id !== id));
  };

  const requestPlanningPermission = async (week: Date, reason: string) => {
    if (!db || !user) return false;
    const newRequest = { userId: user.uid, weekStartDate: week.toISOString(), reason, status: 'pending', requestedAt: new Date().toISOString() };
    try {
        await addDoc(collection(db, 'planningRequests'), newRequest);
        return true;
    } catch (e) {
        return false;
    }
  };

  const allPlans = useMemo(() => [...masterPlans, ...offlinePlans], [masterPlans, offlinePlans]);

  return { plans: allPlans, planningRequests, addPlan, addPlansBulk, removePlan, requestPlanningPermission, loading, fetchData };
};
