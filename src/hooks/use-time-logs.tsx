
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { isToday, parseISO } from 'date-fns';
import { getQueryStartDateISO } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export const useTimeLogs = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [todaysTimeIn, setTodaysTimeIn] = useState<TimeLog | null>(null);

  const fetchTimeLogs = useCallback(async () => {
    if (!user || !db) {
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
        where("timeIn", ">=", startDate)
      );
      
      const querySnapshot = await getDocs(q);
      const fetchedLogs: TimeLog[] = [];
      querySnapshot.forEach((doc) => {
        fetchedLogs.push({ id: doc.id, ...doc.data() } as TimeLog);
      });

      fetchedLogs.sort((a, b) => b.timeIn.localeCompare(a.timeIn));

      setTodaysTimeIn(fetchedLogs.find(l => isToday(parseISO(l.timeIn)) && !l.timeOut) || null);
      setTimeLogs(fetchedLogs);
    } catch (serverError: any) {
      const permissionError = new FirestorePermissionError({
        path: 'timeLogs',
        operation: 'list',
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
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
          if (!user || !db) return;
          const newLog = { userId: user.uid, timeIn: new Date().toISOString(), locationType: loc, timeInPhoto: photo };
          const colRef = collection(db, "timeLogs");
          
          addDoc(colRef, newLog)
            .then((docRef) => {
              const created = { id: docRef.id, ...newLog } as TimeLog;
              setTimeLogs(prev => [created, ...prev]);
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
      }, 
      addTimeOut: async (photo: string) => {
          if (!user || !db || !todaysTimeIn) return;
          const logRef = doc(db, "timeLogs", todaysTimeIn.id);
          const updateData = { timeOut: new Date().toISOString(), timeOutPhoto: photo };
          
          updateDoc(logRef, updateData)
            .then(() => {
              setTimeLogs(prev => prev.map(l => l.id === todaysTimeIn.id ? {...l, ...updateData} : l));
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
      }, 
      loading, 
      todaysTimeIn,
      fetchTimeLogs
  };
};
