
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Plan, Doctor } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format, isSameWeek, startOfToday } from 'date-fns';
import { db } from '@/lib/firebase';
import { collection, addDoc, deleteDoc, getDocs, query, where, doc } from 'firebase/firestore';
import { useAuth } from './use-auth';

const PLANS_KEY = 'sfe-offline-coverage-plans';

export const usePlans = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const getLocalKey = useCallback(() => `${PLANS_KEY}_${user?.uid}`, [user]);

  const fetchPlans = useCallback(async () => {
    if (!user) {
        setPlans([]);
        setLoading(false);
        return;
    };

    setLoading(true);
    const localData = localStorage.getItem(getLocalKey());
    if (localData) {
        setPlans(JSON.parse(localData));
    }

    if (navigator.onLine) {
        try {
            const q = query(collection(db, "plans"), where("userId", "==", user.uid));
            const querySnapshot = await getDocs(q);
            const firestorePlans = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Plan));
            setPlans(firestorePlans);
            localStorage.setItem(getLocalKey(), JSON.stringify(firestorePlans));
        } catch (error) {
            console.error("Error fetching plans from Firestore:", error);
            if(!localData) {
              toast({
                  variant: "destructive",
                  title: "Error",
                  description: "Could not fetch visit plans."
              });
            }
        }
    } else {
      if(!localData) {
        toast({
            title: "Offline",
            description: "Displaying cached plans. Some data may be outdated."
        });
      }
    }
    setLoading(false);
  }, [user, toast, getLocalKey]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const addPlan = useCallback(async (doctor: Doctor, plannedDate: Date) => {
    if (!user) return;

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
        setPlans(prev => [...prev, newPlan]);
        localStorage.setItem(getLocalKey(), JSON.stringify([...plans, newPlan]));
        toast({ 
            title: "Visit Added", 
            description: `${doctor.firstName} ${doctor.lastName} scheduled for ${format(plannedDate, 'PPP')} as an ${callType} call.` 
        });
    } catch (error) {
        console.error("Error adding plan:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to save plan.' });
    }
  }, [plans, toast, user, getLocalKey]);
  
  const removePlan = useCallback(async (planId: string) => {
    const planToRemove = plans.find(p => p.id === planId);
    
    try {
        await deleteDoc(doc(db, "plans", planId));
        const updatedPlans = plans.filter(p => p.id !== planId);
        setPlans(updatedPlans);
        localStorage.setItem(getLocalKey(), JSON.stringify(updatedPlans));
        if(planToRemove) {
            toast({ variant: 'destructive', title: "Plan Removed", description: `Visit for ${planToRemove.doctorFirstName} ${planToRemove.doctorLastName} has been removed.` });
        }
    } catch(error) {
        console.error("Error removing plan:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to remove plan.' });
    }
  }, [plans, toast, getLocalKey]);


  return { plans, addPlan, removePlan, loading };
};
