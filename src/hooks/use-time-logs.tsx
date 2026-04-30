"use client"

import { useState, useEffect, useCallback } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, orderBy } from 'firebase/firestore';
import { isToday, parseISO } from 'date-fns';
import { getQueryStartDateISO } from '@/lib/utils';

export const useTimeLogs = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [todaysTimeIn, setTodaysTimeIn] = useState<TimeLog | null>(null);

  const fetchTimeLogs = useCallback(async () => {
    if (!user) {
      setTimeLogs([]);
      setTodaysTimeIn(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const startDate = getQueryStartDateISO();
      
      const q = query(
        collection(db, "timeLogs"), 
        where("userId", "==", user.uid),
        where("timeIn", ">=", startDate),
        orderBy("timeIn", "desc")
      );
      
      const querySnapshot = await getDocs(q);
      const fetchedLogs: TimeLog[] = [];
      querySnapshot.forEach((doc) => {
        fetchedLogs.push({ id: doc.id, ...doc.data() } as TimeLog);
      });

      setTodaysTimeIn(fetchedLogs.find(l => isToday(parseISO(l.timeIn)) && !l.timeOut) || null);
      setTimeLogs(fetchedLogs);
    } catch (error) {
      console.error("Error fetching time logs:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTimeLogs();
  }, [fetchTimeLogs]);

  return { 
      timeLogs, 
      addTimeIn: async (photo: string, loc: 'inbase' | 'outbase') => {
          const newLog = { userId: user?.uid, timeIn: new Date().toISOString(), locationType: loc, timeInPhoto: photo };
          const docRef = await addDoc(collection(db, "timeLogs"), newLog);
          const created = { id: docRef.id, ...newLog } as TimeLog;
          setTimeLogs(prev => [created, ...prev]);
          setTodaysTimeIn(created);
      }, 
      addTimeOut: async (photo: string) => {
          if (!todaysTimeIn) return;
          const ref = doc(db, "timeLogs", todaysTimeIn.id);
          const data = { timeOut: new Date().toISOString(), timeOutPhoto: photo };
          await updateDoc(ref, data);
          setTimeLogs(prev => prev.map(l => l.id === todaysTimeIn.id ? {...l, ...data} : l));
          setTodaysTimeIn(null);
      }, 
      loading, 
      todaysTimeIn,
      fetchTimeLogs
  };
};
