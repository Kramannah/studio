
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { isToday, parseISO, isValid } from 'date-fns';
import { isSyncWindowOpen, isCurrentWeek } from '@/lib/utils';

export const useTimeLogs = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [todaysTimeIn, setTodaysTimeIn] = useState<TimeLog | null>(null);

  const fetchTimeLogs = useCallback(async (forceAllWeek = false) => {
    if (!user) {
      setTimeLogs([]);
      setTodaysTimeIn(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = query(collection(db, "timeLogs"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const fetchedLogs: TimeLog[] = [];
      querySnapshot.forEach((doc) => {
        fetchedLogs.push({ id: doc.id, ...doc.data() } as TimeLog);
      });

      const isNightMode = forceAllWeek || isSyncWindowOpen();

      const filtered = fetchedLogs.filter(log => {
          const tDate = log.timeIn ? parseISO(log.timeIn) : null;
          if (!tDate || !isValid(tDate)) return false;
          
          if (isNightMode) {
              return isCurrentWeek(log.timeIn);
          } else {
              return isToday(tDate);
          }
      });

      filtered.sort((a, b) => new Date(b.timeIn).getTime() - new Date(a.timeIn).getTime());

      setTodaysTimeIn(filtered.find(l => isToday(parseISO(l.timeIn)) && !l.timeOut) || null);
      setTimeLogs(filtered);
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
