
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { isToday, parseISO, isValid } from 'date-fns';

export const useTimeLogs = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [todaysTimeIn, setTodaysTimeIn] = useState<TimeLog | null>(null);

  const fetchAllTimeLogs = useCallback(async () => {
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

      // Sort by timeIn descending, safely handling invalid dates
      fetchedLogs.sort((a, b) => {
        const dateA = a.timeIn ? parseISO(a.timeIn) : null;
        const dateB = b.timeIn ? parseISO(b.timeIn) : null;
        if (isValid(dateA) && isValid(dateB)) {
          return dateB.getTime() - dateA.getTime();
        }
        if (isValid(dateA)) return -1;
        if (isValid(dateB)) return 1;
        return 0;
      });
      
      setTimeLogs(fetchedLogs);

      const latestLog = fetchedLogs.length > 0 ? fetchedLogs[0] : null;
      if (latestLog) {
        const timeInDate = latestLog.timeIn ? parseISO(latestLog.timeIn) : null;
        if (timeInDate && isValid(timeInDate) && isToday(timeInDate) && !latestLog.timeOut) {
          setTodaysTimeIn(latestLog);
        } else {
          setTodaysTimeIn(null);
        }
      } else {
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
        fetchAllTimeLogs();
    } else {
        setLoading(false);
        setTimeLogs([]);
        setTodaysTimeIn(null);
    }
  }, [user, fetchAllTimeLogs]);

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
      timeOut: null,
      timeOutPhoto: null,
    };
    try {
      const docRef = await addDoc(collection(db, "timeLogs"), newTimeLog);
      const createdLog = { id: docRef.id, ...newTimeLog } as TimeLog;
      setTimeLogs(prev => [createdLog, ...prev]);
      setTodaysTimeIn(createdLog);
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
        setTimeLogs(prev => prev.map(log => log.id === todaysTimeIn.id ? updatedLog : log));
        setTodaysTimeIn(null); // Reset for next day
        toast({ title: "Time Out Successful", description: `You have successfully timed out at ${new Date().toLocaleTimeString()}` });
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Could not save time out." });
    }

  }, [user, toast, todaysTimeIn]);

  return { timeLogs, fetchAllTimeLogs, addTimeIn, addTimeOut, loading, todaysTimeIn };
};
