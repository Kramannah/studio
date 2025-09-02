
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Plan, Doctor } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format, isSameWeek, startOfToday } from 'date-fns';

const PLANS_KEY = 'sfe-offline-coverage-plans';

export const usePlans = () => {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedPlans = localStorage.getItem(PLANS_KEY);
        if (storedPlans) {
          setPlans(JSON.parse(storedPlans));
        }
      } catch (error) {
        console.error("Failed to parse plans from localStorage", error);
        toast({
          variant: 'destructive',
          title: 'Error loading data',
          description: 'Could not load your visit plans.',
        });
      }
    }
  }, [toast]);

  const updateLocalStorage = (updatedPlans: Plan[]) => {
    localStorage.setItem(PLANS_KEY, JSON.stringify(updatedPlans));
  };

  const addPlan = useCallback((doctor: Doctor, plannedDate: Date) => {
    const today = startOfToday();
    const isCurrentWeek = isSameWeek(plannedDate, today, { weekStartsOn: 1 });
    const callType = isCurrentWeek ? 'unplanned' : 'planned';

    const newPlan: Plan = {
      id: crypto.randomUUID(),
      doctorId: doctor.id,
      doctorFirstName: doctor.firstName,
      doctorLastName: doctor.lastName,
      plannedDate: plannedDate.toISOString(),
      callType: callType,
    };
    const updatedPlans = [...plans, newPlan];
    setPlans(updatedPlans);
    updateLocalStorage(updatedPlans);
    toast({ 
        title: "Visit Added", 
        description: `${doctor.firstName} ${doctor.lastName} scheduled for ${format(plannedDate, 'PPP')} as an ${callType} call.` 
    });
  }, [plans, toast]);
  
  const removePlan = useCallback((planId: string) => {
    const planToRemove = plans.find(p => p.id === planId);
    const updatedPlans = plans.filter(p => p.id !== planId);
    setPlans(updatedPlans);
    updateLocalStorage(updatedPlans);
    if(planToRemove) {
        toast({ variant: 'destructive', title: "Plan Removed", description: `Visit for ${planToRemove.doctorFirstName} ${planToRemove.doctorLastName} has been removed.` });
    }
  }, [plans, toast]);


  return { plans, addPlan, removePlan };
};
