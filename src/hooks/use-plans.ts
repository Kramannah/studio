
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Plan, Doctor } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format, isSameWeek, startOfToday } from 'date-fns';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';

const PLANS_LOCAL_KEY = 'sfe-offline-coverage-plans-local';

export const usePlans = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const getLocalKey = useCallback(() => `${PLANS_LOCAL_KEY}_${user?.uid}`, [user]);

  const fetchPlansFromFirestore = useCallback(async () => {
    if (!db || !user) {
        setPlans([]);
        return [];
    }
    setLoading(true);
    try {
        const q = query(collection(db, 'plans'), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        const firestorePlans = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Plan));
        
        setPlans(firestorePlans);
        localStorage.setItem(getLocalKey(), JSON.stringify(firestorePlans));
        return firestorePlans;
    } catch (error) {
        console.error("Error fetching plans from Firestore:", error);
        toast({
            variant: "destructive",
            title: "Network Error",
            description: "Could not fetch visit plans. Loading local data."
        });
        const localData = localStorage.getItem(getLocalKey());
        return localData ? JSON.parse(localData) : [];
    } finally {
        setLoading(false);
    }
  }, [user, getLocalKey, toast]);

  useEffect(() => {
    if (user) {
        setLoading(true);
        const localData = localStorage.getItem(getLocalKey());
        if (localData) {
            setPlans(JSON.parse(localData));
        }
        fetchPlansFromFirestore().then(fetchedPlans => {
            if (fetchedPlans.length > 0 || !localData) {
                setPlans(fetchedPlans);
            }
        }).finally(() => setLoading(false));
    } else {
        setPlans([]);
        setLoading(false);
    }
  }, [user, fetchPlansFromFirestore, getLocalKey]);


  const addPlan = useCallback(async (doctor: Doctor, plannedDate: Date) => {
    if (!user || !db) return;

    const today = startOfToday();
    const isCurrentWeek = isSameWeek(plannedDate, today, { weekStartsOn: 1 });
    const callType = isCurrentWeek ? 'unplanned' : 'planned';

    const newPlanData: Omit<Plan, 'id'> = {
      userId: user.uid,
      doctorId: doctor.id,
      doctorFirstName: doctor.firstName,
      doctorLastName: doctor.lastName,
      plannedDate: plannedDate.toISOString(),
      callType: callType,
    };
    
    try {
        const docRef = await addDoc(collection(db, "plans"), newPlanData);
        const newPlan = { ...newPlanData, id: docRef.id };
        const updatedPlans = [...plans, newPlan];
        setPlans(updatedPlans);
        localStorage.setItem(getLocalKey(), JSON.stringify(updatedPlans));
        toast({ 
            title: "Visit Added", 
            description: `${doctor.firstName} ${doctor.lastName} scheduled for ${format(plannedDate, 'PPP')} as a ${callType} call.` 
        });
    } catch (error) {
        console.error("Error adding plan to Firestore:", error);
        toast({ variant: 'destructive', title: 'Save Failed', description: 'Could not save plan online.' });
    }
  }, [plans, toast, user, getLocalKey]);
  
  const removePlan = useCallback(async (planId: string) => {
    if (!user || !db) return;

    const planToRemove = plans.find(p => p.id === planId);
    
    try {
        await deleteDoc(doc(db, "plans", planId));
        const updatedPlans = plans.filter(p => p.id !== planId);
        setPlans(updatedPlans);
        localStorage.setItem(getLocalKey(), JSON.stringify(updatedPlans));
        if(planToRemove) {
            toast({ variant: 'destructive', title: "Plan Removed", description: `Visit for ${planToRemove.doctorFirstName} ${planToRemove.doctorLastName} has been removed.` });
        }
    } catch (error) {
        console.error("Error deleting plan from Firestore:", error);
        toast({ variant: 'destructive', title: 'Delete Failed', description: 'Could not delete plan online.' });
    }
  }, [plans, toast, user, getLocalKey]);


  return { plans, addPlan, removePlan, loading };
};
