"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, limit, orderBy } from 'firebase/firestore';
import { isToday, parseISO, isValid, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';
import { getMonthRangeISO, safeStorageSet } from '@/lib/utils';
import { uploadBase64ToStorage, compressImage } from '@/lib/storage-utils';

const TIME_LOGS_STORAGE_KEY = 'sfe-time-logs-v5';

/**
 * LOW-COST V2.2: Attendance Logs with Storage Pivot.
 * Automatically offloads attendance photos to Cloud Storage.
 */
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
                setTodaysTimeIn(logs.find((l: TimeLog) => l.timeIn && isToday(parseISO(l.timeIn)) && !l.timeOut) || null);
            }
        } catch (e) {}
    }
  }, [user?.uid]);

  const fetchTimeLogs = useCallback(async (force = false) => {
    if (!user || !db || !active || !navigator.onLine) return;

    const fetchKey = `${user.uid}_${selectedMonth || 'current'}`;
    if (!force && lastFetchedKeyRef.current === fetchKey && timeLogs.length > 0) return;

    setLoading(true);

    try {
      const { start, end } = getMonthRangeISO(selectedMonth);
      
      const q = query(
        collection(db, "timeLogs"), 
        where("userId", "==", user.uid),
        where("timeIn", ">=", start),
        where("timeIn", "<=", end),
        limit(150)
      );
      
      try {
          const querySnapshot = await getDocs(q);
          const fetchedLogs: TimeLog[] = querySnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as TimeLog) }));
          fetchedLogs.sort((a, b) => b.timeIn.localeCompare(a.timeIn));

          setTodaysTimeIn(fetchedLogs.find(l => l.timeIn && isToday(parseISO(l.timeIn)) && !l.timeOut) || null);
          setTimeLogs(fetchedLogs);
          lastFetchedKeyRef.current = fetchKey;
          safeStorageSet(getStoreKey(), JSON.stringify(fetchedLogs));
      } catch (indexError) {
          const fallbackQ = query(collection(db, "timeLogs"), where("userId", "==", user.uid), limit(100));
          const snap = await getDocs(fallbackQ);
          const interval = { start: parseISO(start), end: parseISO(end) };
          const filtered = snap.docs
            .map(doc => ({ id: doc.id, ...(doc.data() as TimeLog) }))
            .filter(l => l.timeIn && isValid(parseISO(l.timeIn)) && isWithinInterval(parseISO(l.timeIn), interval));
          setTimeLogs(filtered);
      }
    } catch (serverError: any) {
        console.error("Time logs fetch error:", serverError);
    } finally {
      setLoading(false);
    }
  }, [user, active, timeLogs.length, selectedMonth]);

  useEffect(() => {
    if (active) fetchTimeLogs();
  }, [fetchTimeLogs, active]);

  const addTimeIn = async (photo: string, loc: 'inbase' | 'outbase') => {
    if (!user || !db) return;
    
    let photoUrl = photo;
    try {
        // Pillar B: Shrink attendance photo to 800px
        const compressed = await compressImage(photo, 800, 0.5);
        // Pillar A: Offload to Storage
        const path = `coverage/${user.uid}/timelog_${Date.now()}_in.jpg`;
        photoUrl = await uploadBase64ToStorage(compressed, path);
    } catch (e) {
        console.warn("Storage upload failed for Time In, using base64 fallback", e);
    }

    const newLog = { userId: user.uid, timeIn: new Date().toISOString(), locationType: loc, timeInPhoto: photoUrl };
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

    let photoUrl = photo;
    try {
        const compressed = await compressImage(photo, 800, 0.5);
        const path = `coverage/${user.uid}/timelog_${Date.now()}_out.jpg`;
        photoUrl = await uploadBase64ToStorage(compressed, path);
    } catch (e) {
        console.warn("Storage upload failed for Time Out, using base64 fallback", e);
    }

    const updateData = { timeOut: new Date().toISOString(), timeOutPhoto: photoUrl };
    try {
        await updateDoc(doc(db, "timeLogs", todaysTimeIn.id), updateData);
        setTimeLogs(prev => prev.map(l => l.id === todaysTimeIn.id ? {...l, ...updateData} : l));
        setTodaysTimeIn(null);
        toast({ title: "Time Out Recorded" });
    } catch (error) {
        console.error("Time out failed:", error);
    }
  };

  return { timeLogs, addTimeIn, addTimeOut, loading, todaysTimeIn, fetchTimeLogs };
};
