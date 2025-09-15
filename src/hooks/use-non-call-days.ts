
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { NonCallDay } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';


export const useNonCallDays = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [nonCallDays, setNonCallDays] = useState<NonCallDay[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNonCallDays = useCallback(async () => {
    if (!user) {
      setNonCallDays([]);
      setLoading(false);
      return;
    };
    setLoading(true);
    try {
      const q = query(collection(db, "nonCallDays"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const fetchedDays: NonCallDay[] = [];
      querySnapshot.forEach((doc) => {
        fetchedDays.push({ id: doc.id, ...doc.data() } as NonCallDay);
      });
      setNonCallDays(fetchedDays);
    } catch (error) {
      console.error("Error fetching non-call days:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load non-call days." });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchNonCallDays();
  }, [fetchNonCallDays]);


  const addNonCallDay = useCallback(async (entry: Omit<NonCallDay, 'id' | 'userId'>) => {
    if (!user) return;
    
    const newEntry = {
      userId: user.uid,
      ...entry,
    };

    try {
      const docRef = await addDoc(collection(db, "nonCallDays"), newEntry);
      setNonCallDays(prev => [...prev, { id: docRef.id, ...newEntry }]);
      toast({ title: "Non-Call Day Logged", description: `Your entry for ${format(new Date(entry.date), 'PPP')} has been saved.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not save non-call day." });
    }
  }, [toast, user]);

  return { nonCallDays, addNonCallDay, loading };
};
