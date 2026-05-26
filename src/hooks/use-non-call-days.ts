"use client"

import { useState, useEffect, useCallback } from 'react';
import type { NonCallDay } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { parseISO, isValid } from 'date-fns';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { getQueryStartDateISO } from '@/lib/utils';

const NCD_STORAGE_KEY = 'sfe-non-call-days-v4';

export const useNonCallDays = (active: boolean = true) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [nonCallDays, setNonCallDays] = useState<NonCallDay[]>([]);
  const [loading, setLoading] = useState(false);

  const getStoreKey = () => `${NCD_STORAGE_KEY}_${user?.uid}`;

  useEffect(() => {
    if (user?.uid) {
        try {
            const cached = localStorage.getItem(getStoreKey());
            if (cached) setNonCallDays(JSON.parse(cached));
        } catch (e) {}
    }
  }, [user?.uid]);

  const fetchNonCallDays = useCallback(async () => {
    if (!user || !db || !active || !navigator.onLine) {
      if (!active) setLoading(false);
      return;
    };
    
    // Always show loading for non-call days when active to prevent "blank" state panic
    setLoading(true);

    try {
      const q = query(collection(db, "nonCallDays"), where("userId", "==", user.uid), limit(1000));
      const querySnapshot = await getDocs(q);
      const fetched: NonCallDay[] = [];
      querySnapshot.forEach((doc) => {
        fetched.push({ id: doc.id, ...doc.data() } as NonCallDay);
      });

      const startDate = getQueryStartDateISO();

      const filtered = fetched.filter(d => {
          const dDate = d.date ? parseISO(d.date) : null;
          return dDate && isValid(dDate) && d.date >= startDate;
      });

      setNonCallDays(filtered);
      try {
          localStorage.setItem(getStoreKey(), JSON.stringify(filtered));
      } catch (e) {}
    } catch (error) {
        console.error("Error fetching non-call days:", error);
    } finally {
      setLoading(false);
    }
  }, [user, active]);

  useEffect(() => {
    if (active) {
        fetchNonCallDays();
    }
  }, [fetchNonCallDays, active]);

  const addNonCallDay = async (entry: any) => {
    if (!user || !db) return;
    const newEntry = { userId: user.uid, ...entry, status: 'pending' as const };
    const colRef = collection(db, "nonCallDays");
    try {
        const docRef = await addDoc(colRef, newEntry);
        setNonCallDays(prev => {
            const next = [...prev, { id: docRef.id, ...newEntry }];
            try {
                localStorage.setItem(getStoreKey(), JSON.stringify(next));
            } catch (e) {}
            return next;
        });
        toast({ title: "Request Submitted" });
    } catch (error) {
        console.error("Error adding non-call day:", error);
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
