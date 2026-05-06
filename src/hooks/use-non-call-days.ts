"use client"

import { useState, useEffect, useCallback } from 'react';
import type { NonCallDay } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { parseISO, isValid, startOfMonth, isAfter } from 'date-fns';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';

export const useNonCallDays = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [nonCallDays, setNonCallDays] = useState<NonCallDay[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNonCallDays = useCallback(async () => {
    if (!user || !db) {
      setNonCallDays([]);
      setLoading(false);
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

      const monthStart = startOfMonth(new Date());

      const filtered = fetched.filter(d => {
          const dDate = d.date ? parseISO(d.date) : null;
          return dDate && isValid(dDate) && isAfter(dDate, monthStart);
      });

      setNonCallDays(filtered);
    } catch (error) {
      console.error("Error fetching non-call days:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNonCallDays();
  }, [fetchNonCallDays]);

  return { 
      nonCallDays, 
      addNonCallDay: async (entry: any) => {
          if (!user || !db) return;
          try {
              const newEntry = { userId: user.uid, ...entry, status: 'pending' as const };
              const docRef = await addDoc(collection(db, "nonCallDays"), newEntry);
              setNonCallDays(prev => [...prev, { id: docRef.id, ...newEntry }]);
              toast({ title: "Request Submitted" });
          } catch (error) {
              console.error("Error logging non-call day", error);
          }
      }, 
      loading,
      fetchNonCallDays
  };
};