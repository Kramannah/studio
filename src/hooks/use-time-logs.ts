
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc, getDoc, limit } from 'firebase/firestore';
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
      const q = query(collection(db, "timeLogs"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const fetchedLogs: TimeLog[] = [];
      let foundTodaysTimeIn = false;
      querySnapshot.forEach((doc) => {
        const log = { id: doc.id, ...doc.data() } as TimeLog;
        fetchedLogs.push(log);
      });
      
      // Sort on the client side
      fetchedLogs.sort((a, b) => new Date(b.timeIn).getTime() - new Date(a.timeIn).getTime());

      const latestLog = fetchedLogs[0];
      if (latestLog) {
        const timeInDate = typeof latestLog.timeIn === 'string' ? parseISO(latestLog.timeIn) : latestLog.timeIn;
        if (isValid(timeInDate) && isToday(timeInDate) && !latestLog.timeOut) {
          setTodaysTimeIn(latestLog);
          foundTodaysTimeIn = true;
        }
      }

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
    if(user) {
        fetchTimeLogs();
    } else {
        setLoading(false);
    }
  }, [user, fetchTimeLogs]);

  const addTimeIn = useCallback(async (photo: string, locationType: 'inbase' | 'outbase') => {
    if (!user) return;

    if (todaysTimeIn) {
        toast({ variant: "destructive", title: "Already Timed In", description: "You have already timed in for today." });
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
      setTimeLogs(prev => [createdLog, ...prev].sort((a,b) => new Date(b.timeIn).getTime() - new Date(a.timeIn).getTime()));
      setTodaysTimeIn(createdLog as TimeLog);
      toast({ title: "Time In Successful", description: `You have successfully timed in at ${new Date().toLocaleTimeString()}` });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not save time in." });
    }
  }, [user, toast, todaysTimeIn]);

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
        setTimeLogs(prev => prev.map(log => log.id === todaysTimeIn.id ? updatedLog : log).sort((a,b) => new Date(b.timeIn).getTime() - new Date(a.timeIn).getTime()));
        setTodaysTimeIn(null); // Reset for next day
        toast({ title: "Time Out Successful", description: `You have successfully timed out at ${new Date().toLocaleTimeString()}` });
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Could not save time out." });
    }

  }, [user, toast, todaysTimeIn]);

  return { timeLogs, addTimeIn, addTimeOut, loading, todaysTimeIn };
};
