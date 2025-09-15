
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Plan, Doctor } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format, isSameWeek, startOfToday } from 'date-fns';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';


export const usePlans = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    if (!user) {
      setPlans([]);
      setLoading(false);
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
      setPlans(fetchedPlans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load visit plans." });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);
  
  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);


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
    
    try {
        const docRef = await addDoc(collection(db, "plans"), newPlanData);
        setPlans(prev => [...prev, {id: docRef.id, ...newPlanData}])
        toast({ 
            title: "Visit Added", 
            description: `${doctor.firstName} ${doctor.lastName} scheduled for ${format(plannedDate, 'PPP')} as a ${callType} call.` 
        });
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Could not save the plan." });
    }

  }, [toast, user]);
  
  const removePlan = useCallback(async (planId: string) => {
    if (!user) return;
    const planToRemove = plans.find(p => p.id === planId);
    try {
        await deleteDoc(doc(db, "plans", planId));
        setPlans(prev => prev.filter(p => p.id !== planId));
        if(planToRemove) {
          toast({ variant: 'destructive', title: "Plan Removed", description: `Visit for ${planToRemove.doctorFirstName} ${planToRemove.doctorLastName} has been removed.` });
        }
    } catch (error) {
        toast({ variant: 'destructive', title: "Error", description: "Could not remove the plan." });
    }
  }, [plans, toast, user]);

  return { plans, addPlan, removePlan, loading };
};
