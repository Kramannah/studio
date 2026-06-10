
"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, limit } from 'firebase/firestore';
import { isToday, parseISO, isValid, isWithinInterval } from 'date-fns';
import { getMonthRangeISO } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

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
    if (!force && lastFetchedKeyRef.current === fetchKey && timeLogs.length > 0) return;

    if (timeLogs.length === 0 || force) {
        setLoading(true);
    }

    try {
      const { start, end } = getMonthRangeISO(selectedMonth);
      const interval = { start: parseISO(start), end: parseISO(end) };
      
      // [INDEX_FIX] Single index query
      const q = query(
        collection(db, "timeLogs"), 
        where("userId", "==", user.uid),
        limit(1000)
      );
      
      const querySnapshot = await getDocs(q);
      const fetchedLogs: TimeLog[] = [];
      querySnapshot.forEach((doc) => {
        fetchedLogs.push({ id: doc.id, ...(doc.data() as TimeLog) });
      });

      // [CLIENT_SIDE_FILTER]
      const filtered = fetchedLogs.filter(l => {
          const d = parseISO(l.timeIn);
          return isValid(d) && isWithinInterval(d, interval);
      });

      filtered.sort((a, b) => b.timeIn.localeCompare(a.timeIn));

      setTodaysTimeIn(filtered.find(l => isToday(parseISO(l.timeIn)) && !l.timeOut) || null);
      setTimeLogs(filtered);
      lastFetchedKeyRef.current = fetchKey;
      try {
          localStorage.setItem(getStoreKey(), JSON.stringify(filtered));
      } catch (e) {}
    } catch (serverError: any) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'timeLogs',
        operation: 'list',
      } satisfies SecurityRuleContext));
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
    addDoc(collection(db, "timeLogs"), newLog)
      .then((docRef) => {
        const created = { id: docRef.id, ...newLog } as TimeLog;
        setTimeLogs(prev => [created, ...prev]);
        setTodaysTimeIn(created);
        toast({ title: "Time In Recorded" });
      })
      .catch(async (serverError) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'timeLogs',
          operation: 'create',
          requestResourceData: newLog,
        } satisfies SecurityRuleContext));
      });
  };

  const addTimeOut = async (photo: string) => {
    if (!user || !db || !todaysTimeIn) return;
    const updateData = { timeOut: new Date().toISOString(), timeOutPhoto: photo };
    updateDoc(doc(db, "timeLogs", todaysTimeIn.id), updateData)
      .then(() => {
        setTimeLogs(prev => prev.map(l => l.id === todaysTimeIn.id ? {...l, ...updateData} : l));
        setTodaysTimeIn(null);
        toast({ title: "Time Out Recorded" });
      })
      .catch(async (serverError) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'timeLogs',
          operation: 'update',
          requestResourceData: updateData,
        } satisfies SecurityRuleContext));
      });
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
