
"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, limit } from 'firebase/firestore';
import { isToday, parseISO, isValid, isWithinInterval } from 'date-fns';
import { getMonthRangeISO } from '@/lib/utils';

const TIME_LOGS_STORAGE_KEY = 'sfe-time-logs-v4';

export const useTimeLogs = (active: boolean = true, selectedMonth?: string) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [todaysTimeIn, setTodaysTimeIn] = useState<TimeLog | null>(null);
  
  const lastFetchedKeyRef = useRef<string | null>(null);

  const getStoreKey = () => `${TIME_LOGS_STORAGE_KEY}_${user?.uid}`;

  useEffect(() => {
    if (user?.uid) {
        try {
            const cached = localStorage.getItem(getStoreKey());
            if (cached) {
                const logs = JSON.parse(cached);
                setTimeLogs(logs);
                setTodaysTimeIn(logs.find((l: TimeLog) => isToday(parseISO(l.timeIn)) && !l.timeOut) || null);
            }
        } catch (e) {}
    }
  }, [user?.uid]);

  const fetchTimeLogs = useCallback(async (force = false) => {
    if (!user || !db || !active || !navigator.onLine) {
        if (!active) setLoading(false);
        return;
    }

    const fetchKey = `${user.uid}_${selectedMonth || 'current'}`;
    if (!force && lastFetchedKeyRef.current === fetchKey && timeLogs.length > 0) {
        setLoading(false);
        return;
    }

    setLoading(true);

    try {
      const { start, end } = getMonthRangeISO(selectedMonth);
      const interval = { start: parseISO(start), end: parseISO(end) };
      
      const q = query(
        collection(db, "timeLogs"), 
        where("userId", "==", user.uid),
        limit(1000)
      );
      
      const querySnapshot = await getDocs(q);
      
      const fetchedLogs: TimeLog[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data() as TimeLog;
        const d = parseISO(data.timeIn);
        if (isValid(d) && isWithinInterval(d, interval)) {
            fetchedLogs.push({ id: doc.id, ...data });
        }
      });

      fetchedLogs.sort((a, b) => b.timeIn.localeCompare(a.timeIn));

      setTodaysTimeIn(fetchedLogs.find(l => isToday(parseISO(l.timeIn)) && !l.timeOut) || null);
      setTimeLogs(fetchedLogs);
      lastFetchedKeyRef.current = fetchKey;
      try {
          localStorage.setItem(getStoreKey(), JSON.stringify(fetchedLogs));
      } catch (e) {}
    } catch (serverError: any) {
        console.warn("Time logs fetch error (Handled):", serverError.message);
    } finally {
      setLoading(false);
    }
  }, [user, active, timeLogs.length, selectedMonth]);

  useEffect(() => {
    if (active) {
        fetchTimeLogs();
    }
  }, [fetchTimeLogs, active]);

  const addTimeIn = async (photo: string, loc: 'inbase' | 'outbase') => {
    if (!user || !db) return;
    const newLog = { userId: user.uid, timeIn: new Date().toISOString(), locationType: loc, timeInPhoto: photo };
    try {
        const docRef = await addDoc(collection(db, "timeLogs"), newLog);
        const created = { id: docRef.id, ...newLog } as TimeLog;
        setTimeLogs(prev => [created, ...prev]);
        setTodaysTimeIn(created);
        toast({ title: "Time In Recorded" });
    } catch (error) {
        console.error("Time in failed:", error);
    }
  };

  const addTimeOut = async (photo: string) => {
    if (!user || !db || !todaysTimeIn) return;
    const updateData = { timeOut: new Date().toISOString(), timeOutPhoto: photo };
    try {
        await updateDoc(doc(db, "timeLogs", todaysTimeIn.id), updateData);
        setTimeLogs(prev => prev.map(l => l.id === todaysTimeIn.id ? {...l, ...updateData} : l));
        setTodaysTimeIn(null);
        toast({ title: "Time Out Recorded" });
    } catch (error) {
        console.error("Time out failed:", error);
    }
  };

  return { 
      timeLogs, 
      addTimeIn, 
      addTimeOut, 
      loading, 
      todaysTimeIn,
      fetchTimeLogs
  };
};
