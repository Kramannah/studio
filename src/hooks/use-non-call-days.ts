
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { NonCallDay } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { parseISO, isValid } from 'date-fns';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { getQueryStartDateISO } from '@/lib/utils';

export const useNonCallDays = (active: boolean = true) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [nonCallDays, setNonCallDays] = useState<NonCallDay[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNonCallDays = useCallback(async () => {
    if (!user || !db || !active) {
      if (!active) setLoading(false);
      return;
    };
    setLoading(true);
    try {
      const q = query(collection(db, "nonCallDays"), where("userId", "==", user.uid));
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
        setNonCallDays(prev => [...prev, { id: docRef.id, ...newEntry }]);
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
