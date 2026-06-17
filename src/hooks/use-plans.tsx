"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Plan, Doctor, PlanningPermissionRequest } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, writeBatch, limit } from 'firebase/firestore';
import { isToday, isBefore, startOfToday, isValid, parseISO, isWithinInterval, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { useAuth } from './use-auth';
import { getMonthRangeISO, parseAnyDate } from '@/lib/utils';

/**
 * LOW-COST V2.2: Restricts plan fetching to a specific month for historical accuracy.
 * Ensures high-volume accounts like VIS-06 see all plotted calls.
 */
export const usePlans = (active: boolean = true, selectedMonth?: string) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [offlinePlans, setOfflinePlans] = useState<Plan[]>([]);
  const [masterPlans, setMasterPlans] = useState<Plan[]>([]);
  const [planningRequests, setPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  
  const lastFetchedKeyRef = useRef<string | null>(null);

  const fetchData = useCallback(async (force = false) => {
    if (!user || !db || !active || !navigator.onLine) return;
    
    const fetchKey = `${user.uid}_${selectedMonth || 'current'}`;
    if (!force && lastFetchedKeyRef.current === fetchKey && masterPlans.length > 0) return;

    setLoading(true);
    
    try {
      const refDate = selectedMonth ? parseISO(selectedMonth + "-01") : new Date();
      const rangeStart = startOfMonth(subMonths(refDate, 1)).toISOString();
      const rangeEnd = endOfMonth(addMonths(refDate, 1)).toISOString();

      const plansQuery = query(
        collection(db, "plans"), 
        where("userId", "==", user.uid),
        where("plannedDate", ">=", rangeStart),
        where("plannedDate", "<=", rangeEnd),
        limit(3000)
      );
      
      const requestsQuery = query(
        collection(db, "planningRequests"), 
        where("userId", "==", user.uid),
        limit(100)
      );
      
      const [plansSnapshot, requestsSnapshot] = await Promise.all([
        getDocs(plansQuery).catch(async (error) => {
           console.warn("Plans range query fallback triggered:", error.message);
           const fallbackQ = query(collection(db, "plans"), where("userId", "==", user.uid), limit(3000));
           const snap = await getDocs(fallbackQ);
           const interval = { start: parseISO(rangeStart), end: parseISO(rangeEnd) };
           
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
      
      setMasterPlans(plans.sort((a, b) => (b.plannedDate || "").localeCompare(a.plannedDate || "")));
      setPlanningRequests(requests.sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || "")));
      lastFetchedKeyRef.current = fetchKey;
    } catch (error) {
        console.error("Fetch plans error:", error);
    } finally {
        setLoading(false);
    }
  }, [user, active, selectedMonth, masterPlans.length]);

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