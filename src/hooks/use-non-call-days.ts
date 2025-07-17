
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { NonCallDay } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';

const NON_CALL_DAYS_KEY = 'sfe-offline-coverage-non-call-days';

export const useNonCallDays = () => {
  const { toast } = useToast();
  const [nonCallDays, setNonCallDays] = useState<NonCallDay[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(NON_CALL_DAYS_KEY);
        if (stored) {
          setNonCallDays(JSON.parse(stored));
        }
      } catch (error) {
        console.error("Failed to parse non-call days from localStorage", error);
        toast({
          variant: 'destructive',
          title: 'Error loading data',
          description: 'Could not load your non-call day entries.',
        });
      }
    }
  }, [toast]);

  const updateLocalStorage = (updatedEntries: NonCallDay[]) => {
    localStorage.setItem(NON_CALL_DAYS_KEY, JSON.stringify(updatedEntries));
  };

  const addNonCallDay = useCallback((entry: Omit<NonCallDay, 'id'>) => {
    const newEntry: NonCallDay = {
      ...entry,
      id: crypto.randomUUID(),
    };
    const updatedEntries = [...nonCallDays, newEntry];
    setNonCallDays(updatedEntries);
    updateLocalStorage(updatedEntries);
    toast({ title: "Non-Call Day Logged", description: `Your entry for ${format(new Date(entry.date), 'PPP')} has been saved.` });
  }, [nonCallDays, toast]);

  return { nonCallDays, addNonCallDay };
};
