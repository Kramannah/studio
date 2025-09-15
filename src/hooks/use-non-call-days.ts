
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { NonCallDay } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from './use-auth';


const NON_CALL_DAYS_KEY = 'sfe-offline-coverage-non-call-days';

export const useNonCallDays = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [nonCallDays, setNonCallDays] = useState<NonCallDay[]>([]);
  const [loading, setLoading] = useState(true);

  const getLocalKey = useCallback(() => `${NON_CALL_DAYS_KEY}_${user?.uid}`, [user]);

  const fetchNonCallDays = useCallback(async () => {
    if (!user) {
        setNonCallDays([]);
        setLoading(false);
        return;
    }

    setLoading(true);
    const localData = localStorage.getItem(getLocalKey());
    if (localData) {
        setNonCallDays(JSON.parse(localData));
    }

    if (navigator.onLine) {
        try {
            const q = query(collection(db, "nonCallDays"), where("userId", "==", user.uid));
            const querySnapshot = await getDocs(q);
            const firestoreData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NonCallDay));
            setNonCallDays(firestoreData);
            localStorage.setItem(getLocalKey(), JSON.stringify(firestoreData));
        } catch (error) {
            console.error("Error fetching non-call days from Firestore:", error);
            if (!localData) {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Could not fetch non-call days."
                });
            }
        }
    } else {
        if (!localData) {
            toast({
                title: "Offline",
                description: "Displaying cached non-call days."
            });
        }
    }
    setLoading(false);
  }, [user, toast, getLocalKey]);
  
  useEffect(() => {
    fetchNonCallDays();
  }, [fetchNonCallDays]);


  const addNonCallDay = useCallback(async (entry: Omit<NonCallDay, 'id' | 'userId'>) => {
    if (!user) return;
    
    const newEntryData: Omit<NonCallDay, 'id'> = {
      ...entry,
      userId: user.uid,
    };

    try {
        const docRef = await addDoc(collection(db, "nonCallDays"), newEntryData);
        const newEntry = { ...newEntryData, id: docRef.id };
        setNonCallDays(prev => [...prev, newEntry]);
        localStorage.setItem(getLocalKey(), JSON.stringify([...nonCallDays, newEntry]));
        toast({ title: "Non-Call Day Logged", description: `Your entry for ${format(new Date(entry.date), 'PPP')} has been saved.` });
    } catch (error) {
        console.error("Error adding non-call day:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to save non-call day.' });
    }
  }, [nonCallDays, toast, user, getLocalKey]);

  return { nonCallDays, addNonCallDay, loading };
};
