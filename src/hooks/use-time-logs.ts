
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc } from 'firebase/firestore';
import { isToday, parseISO, isValid } from 'date-fns';

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
      const q = query(collection(db, "timeLogs"), where("userId", "==", user.uid), orderBy("timeIn", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedLogs: TimeLog[] = [];
      let foundTodaysTimeIn = false;
      querySnapshot.forEach((doc) => {
        const log = { id: doc.id, ...doc.data() } as TimeLog;
        fetchedLogs.push(log);
        const timeInDate = typeof log.timeIn === 'string' ? parseISO(log.timeIn) : log.timeIn;
        if (!foundTodaysTimeIn && isValid(timeInDate) && isToday(timeInDate) && !log.timeOut) {
          setTodaysTimeIn(log);
          foundTodaysTimeIn = true;
        }
      });
      setTimeLogs(fetchedLogs);
      if (!foundTodaysTimeIn) {
        setTodaysTimeIn(null);
      }
    } catch (error) {
      console.error("Error fetching time logs:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not fetch time logs." });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchTimeLogs();
  }, [fetchTimeLogs]);

  const addTimeIn = useCallback(async (photo: string, locationType: 'inbase' | 'outbase') => {
    if (!user) return;
    
    // Check if any log (timed-in or timed-out) exists for today
    const hasLogForToday = timeLogs.some(log => {
        const timeInDate = typeof log.timeIn === 'string' ? parseISO(log.timeIn) : log.timeIn;
        return isValid(timeInDate) && isToday(timeInDate);
    });

    if (hasLogForToday) {
        toast({ variant: "destructive", title: "Time In Not Allowed", description: "You can only time in once per day." });
        return;
    }

    const newTimeLog = {
      userId: user.uid,
      timeIn: new Date().toISOString(),
      locationType,
      timeInPhoto: photo,
    };
    try {
      const docRef = await addDoc(collection(db, "timeLogs"), newTimeLog);
      const createdLog = { id: docRef.id, ...newTimeLog };
      setTimeLogs(prev => [createdLog, ...prev]);
      setTodaysTimeIn(createdLog);
      toast({ title: "Time In Successful", description: `You have successfully timed in at ${new Date().toLocaleTimeString()}` });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not save time in." });
    }
  }, [user, toast, timeLogs]);

  const addTimeOut = useCallback(async (photo: string) => {
    if (!user) return;
    
    if (!todaysTimeIn) {
      toast({ variant: "destructive", title: "Not Timed In", description: "You must time in before you can time out." });
      return;
    }
    
    const timeLogRef = doc(db, "timeLogs", todaysTimeIn.id);
    const timeOutData = {
        timeOut: new Date().toISOString(),
        timeOutPhoto: photo,
    };
    try {
        await updateDoc(timeLogRef, timeOutData);
        const updatedLog = { ...todaysTimeIn, ...timeOutData };
        setTimeLogs(prev => prev.map(log => log.id === todaysTimeIn.id ? updatedLog : log));
        setTodaysTimeIn(null); // Reset for next day
        toast({ title: "Time Out Successful", description: `You have successfully timed out at ${new Date().toLocaleTimeString()}` });
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Could not save time out." });
    }

  }, [user, toast, todaysTimeIn]);

  return { timeLogs, addTimeIn, addTimeOut, loading, todaysTimeIn };
};
