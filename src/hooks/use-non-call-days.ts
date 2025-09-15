
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { NonCallDay } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { useAuth } from './use-auth';

const NON_CALL_DAYS_KEY = 'sfe-offline-coverage-non-call-days';

export const useNonCallDays = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [nonCallDays, setNonCallDays] = useState<NonCallDay[]>([]);
  const [loading, setLoading] = useState(true);

  const getLocalKey = useCallback(() => `${NON_CALL_DAYS_KEY}_${user?.uid}`, [user]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      try {
        const localData = localStorage.getItem(getLocalKey());
        if (localData) {
          setNonCallDays(JSON.parse(localData));
        } else {
          setNonCallDays([]);
        }
      } catch (error) {
        console.error("Failed to load non-call days from local storage", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load non-call days.' });
      }
      setLoading(false);
    } else {
      setNonCallDays([]);
      setLoading(false);
    }
  }, [user, getLocalKey, toast]);

  const updateLocalStorage = (updatedDays: NonCallDay[]) => {
    setNonCallDays(updatedDays);
    if(user) {
        localStorage.setItem(getLocalKey(), JSON.stringify(updatedDays));
    }
  }

  const addNonCallDay = useCallback((entry: Omit<NonCallDay, 'id' | 'userId'>) => {
    if (!user) return;
    
    const newEntry: NonCallDay = {
      ...entry,
      id: crypto.randomUUID(),
      userId: user.uid,
    };

    const updatedDays = [...nonCallDays, newEntry];
    updateLocalStorage(updatedDays);
    toast({ title: "Non-Call Day Logged", description: `Your entry for ${format(new Date(entry.date), 'PPP')} has been saved.` });
  }, [nonCallDays, toast, user]);

  return { nonCallDays, addNonCallDay, loading };
};
