
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { NonCallDay } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';

const NON_CALL_DAYS_LOCAL_KEY = 'sfe-offline-coverage-non-call-days-local';

export const useNonCallDays = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [nonCallDays, setNonCallDays] = useState<NonCallDay[]>([]);
  const [loading, setLoading] = useState(true);

  const getLocalKey = useCallback(() => `${NON_CALL_DAYS_LOCAL_KEY}_${user?.uid}`, [user]);

  const fetchNonCallDaysFromFirestore = useCallback(async () => {
    if (!db || !user) {
        setNonCallDays([]);
        return [];
    }
    setLoading(true);
    try {
        const q = query(collection(db, 'nonCallDays'), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        const firestoreDays = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NonCallDay));
        
        setNonCallDays(firestoreDays);
        localStorage.setItem(getLocalKey(), JSON.stringify(firestoreDays));
        return firestoreDays;
    } catch (error) {
        console.error("Error fetching non-call days from Firestore:", error);
        toast({
            variant: "destructive",
            title: "Network Error",
            description: "Could not fetch non-call days. Loading local data."
        });
        const localData = localStorage.getItem(getLocalKey());
        return localData ? JSON.parse(localData) : [];
    } finally {
        setLoading(false);
    }
  }, [user, getLocalKey, toast]);

  useEffect(() => {
    if (user) {
        setLoading(true);
        const localData = localStorage.getItem(getLocalKey());
        if (localData) {
            setNonCallDays(JSON.parse(localData));
        }
        fetchNonCallDaysFromFirestore().then(fetchedDays => {
           if (fetchedDays.length > 0 || !localData) {
               setNonCallDays(fetchedDays);
           }
        }).finally(() => setLoading(false));
    } else {
        setNonCallDays([]);
        setLoading(false);
    }
  }, [user, fetchNonCallDaysFromFirestore, getLocalKey]);


  const addNonCallDay = useCallback(async (entry: Omit<NonCallDay, 'id' | 'userId'>) => {
    if (!user || !db) return;
    
    const newEntryData: Omit<NonCallDay, 'id'> = {
      ...entry,
      userId: user.uid,
    };

    try {
        const docRef = await addDoc(collection(db, "nonCallDays"), newEntryData);
        const newEntry = { ...newEntryData, id: docRef.id };
        const updatedDays = [...nonCallDays, newEntry];
        setNonCallDays(updatedDays);
        localStorage.setItem(getLocalKey(), JSON.stringify(updatedDays));
        toast({ title: "Non-Call Day Logged", description: `Your entry for ${format(new Date(entry.date), 'PPP')} has been saved.` });
    } catch(error) {
        console.error("Error adding non-call day to Firestore:", error);
        toast({ variant: 'destructive', title: 'Save Failed', description: 'Could not save non-call day online.' });
    }
  }, [nonCallDays, toast, user, getLocalKey]);

  return { nonCallDays, addNonCallDay, loading };
};
