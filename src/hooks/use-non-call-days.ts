
"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { NonCallDay } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { parseISO, isValid } from 'date-fns';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { getMonthRangeISO } from '@/lib/utils';

const NCD_STORAGE_KEY = 'sfe-non-call-days-v4';

export const useNonCallDays = (active: boolean = true, selectedMonth?: string) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [nonCallDays, setNonCallDays] = useState<NonCallDay[]>([]);
  const [loading, setLoading] = useState(false);
  
  const lastFetchedKeyRef = useRef<string | null>(null);

  const getStoreKey = () => `${NCD_STORAGE_KEY}_${user?.uid}`;

  useEffect(() => {
    if (user?.uid) {
        try {
            const cached = localStorage.getItem(getStoreKey());
            if (cached) setNonCallDays(JSON.parse(cached));
        } catch (e) {}
    }
  }, [user?.uid]);

  const fetchNonCallDays = useCallback(async (force = false) => {
    if (!user || !db || !active || !navigator.onLine) {
      if (!active) setLoading(false);
      return;
    };
    
    // [LOW_COST_UPDATE] Prevent redundant server reads
    const fetchKey = `${user.uid}_${selectedMonth || 'current'}`;
    if (!force && lastFetchedKeyRef.current === fetchKey && nonCallDays.length > 0) return;

    if (nonCallDays.length === 0 || force) {
        setLoading(true);
    }

    try {
      const { start, end } = getMonthRangeISO(selectedMonth);
      
      const q = query(
        collection(db, "nonCallDays"), 
        where("userId", "==", user.uid),
        where("date", ">=", start),
        where("date", "<=", end),
        limit(200)
      );
      
      const querySnapshot = await getDocs(q);
      const fetched: NonCallDay[] = [];
      querySnapshot.forEach((doc) => {
        fetched.push({ id: doc.id, ...(doc.data() as NonCallDay) });
      });

      setNonCallDays(fetched);
      lastFetchedKeyRef.current = fetchKey;
      try {
          localStorage.setItem(getStoreKey(), JSON.stringify(fetched));
      } catch (e) {}
    } catch (error) {
        console.error("Error fetching non-call days:", error);
    } finally {
      setLoading(false);
    }
  }, [user, active, nonCallDays.length, selectedMonth]);

  useEffect(() => {
    if (active) {
        fetchNonCallDays();
    }
  }, [fetchNonCallDays, active]);

  const addNonCallDay = async (entry: any) => {
    if (!user || !db) return;
    const newEntry = { userId: user.uid, ...entry, status: 'pending' as const };
    try {
        const docRef = await addDoc(collection(db, "nonCallDays"), newEntry);
        setNonCallDays(prev => [...prev, { id: docRef.id, ...newEntry }]);
        toast({ title: "Request Submitted" });
    } catch (error) {
        toast({ variant: 'destructive', title: "Submission Failed" });
    }
  };

  return { 
      nonCallDays, 
      addNonCallDay, 
      loading,
      fetchNonCallDays
  };
};
