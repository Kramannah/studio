"use client"

import { useState, useEffect, useCallback } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, limit } from 'firebase/firestore';
import { isToday, parseISO } from 'date-fns';
import { getQueryStartDateISO } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const TIME_LOGS_STORAGE_KEY = 'sfe-time-logs-v4';

export const useTimeLogs = (active: boolean = true) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [todaysTimeIn, setTodaysTimeIn] = useState<TimeLog | null>(null);

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

  const fetchTimeLogs = useCallback(async () => {
    if (!user || !db || !active || !navigator.onLine) {
      if (!active) setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const startDate = getQueryStartDateISO();
      
      const q = query(
        collection(db, "timeLogs"), 
        where("userId", "==", user.uid),
        limit(1000)
      );
      
      const querySnapshot = await getDocs(q);
      const fetchedLogs: TimeLog[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data() as TimeLog;
        if (data.timeIn && data.timeIn >= startDate) {
            fetchedLogs.push({ id: doc.id, ...data });
        }
      });

      fetchedLogs.sort((a, b) => b.timeIn.localeCompare(a.timeIn));

      setTodaysTimeIn(fetchedLogs.find(l => isToday(parseISO(l.timeIn)) && !l.timeOut) || null);
      setTimeLogs(fetchedLogs);
      localStorage.setItem(getStoreKey(), JSON.stringify(fetchedLogs));
    } catch (serverError: any) {
      const permissionError = new FirestorePermissionError({
        path: 'timeLogs',
        operation: 'list',
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
    } finally {
      setLoading(false);
    }
  }, [user, active]);

  useEffect(() => {
    if (active) {
        fetchTimeLogs();
    }
  }, [fetchTimeLogs, active]);

  const addTimeIn = async (photo: string, loc: 'inbase' | 'outbase') => {
    if (!user || !db) return;
    const newLog = { userId: user.uid, timeIn: new Date().toISOString(), locationType: loc, timeInPhoto: photo };
    const colRef = collection(db, "timeLogs");
    addDoc(colRef, newLog)
      .then((docRef) => {
        const created = { id: docRef.id, ...newLog } as TimeLog;
        setTimeLogs(prev => {
            const next = [created, ...prev];
            localStorage.setItem(getStoreKey(), JSON.stringify(next));
            return next;
        });
        setTodaysTimeIn(created);
        toast({ title: "Time In Recorded" });
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: colRef.path,
          operation: 'create',
          requestResourceData: newLog,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const addTimeOut = async (photo: string) => {
    if (!user || !db || !todaysTimeIn) return;
    const logRef = doc(db, "timeLogs", todaysTimeIn.id);
    const updateData = { timeOut: new Date().toISOString(), timeOutPhoto: photo };
    updateDoc(logRef, updateData)
      .then(() => {
        setTimeLogs(prev => {
            const next = prev.map(l => l.id === todaysTimeIn.id ? {...l, ...updateData} : l);
            localStorage.setItem(getStoreKey(), JSON.stringify(next));
            return next;
        });
        setTodaysTimeIn(null);
        toast({ title: "Time Out Recorded" });
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: logRef.path,
          operation: 'update',
          requestResourceData: updateData,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
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