
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Plan, Doctor } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format, isSameWeek, startOfToday } from 'date-fns';
import { useAuth } from './use-auth';

const PLANS_KEY = 'sfe-offline-coverage-plans';

export const usePlans = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const getLocalKey = useCallback(() => `${PLANS_KEY}_${user?.uid}`, [user]);

  useEffect(() => {
    if (user) {
        setLoading(true);
        try {
            const localData = localStorage.getItem(getLocalKey());
            if (localData) {
                setPlans(JSON.parse(localData));
            } else {
                setPlans([]);
            }
        } catch (error) {
            console.error("Failed to load plans from local storage", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load visit plans.' });
        }
        setLoading(false);
    } else {
        setPlans([]);
        setLoading(false);
    }
  }, [user, getLocalKey, toast]);

  const updateLocalStorage = (updatedPlans: Plan[]) => {
    setPlans(updatedPlans);
    if (user) {
        localStorage.setItem(getLocalKey(), JSON.stringify(updatedPlans));
    }
  };

  const addPlan = useCallback((doctor: Doctor, plannedDate: Date) => {
    if (!user) return;

    const today = startOfToday();
    const isCurrentWeek = isSameWeek(plannedDate, today, { weekStartsOn: 1 });
    const callType = isCurrentWeek ? 'unplanned' : 'planned';

    const newPlan: Plan = {
      id: crypto.randomUUID(),
      userId: user.uid,
      doctorId: doctor.id,
      doctorFirstName: doctor.firstName,
      doctorLastName: doctor.lastName,
      plannedDate: plannedDate.toISOString(),
      callType: callType,
    };
    
    const updatedPlans = [...plans, newPlan];
    updateLocalStorage(updatedPlans);
    toast({ 
        title: "Visit Added", 
        description: `${doctor.firstName} ${doctor.lastName} scheduled for ${format(plannedDate, 'PPP')} as an ${callType} call.` 
    });
  }, [plans, toast, user]);
  
  const removePlan = useCallback((planId: string) => {
    const planToRemove = plans.find(p => p.id === planId);
    
    const updatedPlans = plans.filter(p => p.id !== planId);
    updateLocalStorage(updatedPlans);
    
    if(planToRemove) {
        toast({ variant: 'destructive', title: "Plan Removed", description: `Visit for ${planToRemove.doctorFirstName} ${planToRemove.doctorLastName} has been removed.` });
    }
  }, [plans, toast]);


  return { plans, addPlan, removePlan, loading };
};
