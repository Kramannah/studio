"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { NonCallDay } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { parseISO, isValid, isWithinInterval, format } from 'date-fns';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { getMonthRangeISO, safeStorageSet } from '@/lib/utils';

const NCD_STORAGE_KEY = 'sfe-non-call-days-v5';

/**
 * LOW-COST V2: Optimized for minimum reads by restricting fetching to a relevant window.
 */
export const useNonCallDays = (active: boolean = true, selectedMonth?: string) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [nonCallDays, setNonCallDays] = useState<NonCallDay[]>([]);
  const [loading, setLoading] = useState(false);
  
  const lastFetchedKeyRef = useRef<string | null>(null);

  const getStoreKey = () => `${NCD_STORAGE_KEY}_${user?.uid}_${selectedMonth || 'current'}`;

  useEffect(() => {
    if (user?.uid) {
        try {
            const cached = localStorage.getItem(getStoreKey());
            if (cached) {
                setNonCallDays(JSON.parse(cached));
            } else {
                setNonCallDays([]);
            }
        } catch (e) {}
    }
  }, [user?.uid, selectedMonth]);

  const fetchNonCallDays = useCallback(async (force = false) => {
    if (!user || !db || !active || !navigator.onLine) return;
    
    const fetchKey = `${user.uid}_${selectedMonth || 'current'}`;
    if (!force && lastFetchedKeyRef.current === fetchKey && nonCallDays.length > 0) return;

    setLoading(true);

    try {
      const { start, end } = getMonthRangeISO(selectedMonth);
      
      const q = query(
        collection(db, "nonCallDays"), 
        where("userId", "==", user.uid),
        where("date", ">=", start),
        where("date", "<=", end),
        limit(200)
      );
      
      try {
          const querySnapshot = await getDocs(q);
          const fetched: NonCallDay[] = querySnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as NonCallDay) }));
          setNonCallDays(fetched);
          lastFetchedKeyRef.current = fetchKey;
          safeStorageSet(getStoreKey(), JSON.stringify(fetched));
      } catch (indexError) {
          const fallbackQ = query(collection(db, "nonCallDays"), where("userId", "==", user.uid), limit(200));
          const querySnapshot = await getDocs(fallbackQ);
          const interval = { start: parseISO(start), end: parseISO(end) };
          const filtered = querySnapshot.docs
            .map(doc => ({ id: doc.id, ...(doc.data() as NonCallDay) }))
            .filter(n => n.date && isValid(parseISO(n.date)) && isWithinInterval(parseISO(n.date), interval));
          
          setNonCallDays(filtered);
      }
    } catch (error) {
        console.error("Error fetching non-call days:", error);
    } finally {
      setLoading(false);
    }
  }, [user, active, nonCallDays.length, selectedMonth]);

  useEffect(() => {
    if (user && active) {
        fetchNonCallDays();
    }
  }, [fetchNonCallDays, active, user, selectedMonth]);

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

  return { nonCallDays, addNonCallDay, loading, fetchNonCallDays };
};