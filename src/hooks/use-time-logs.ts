
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

  const fetchAllTimeLogs = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(collection(db, "timeLogs"), where("userId", "==", user.uid), orderBy("timeIn", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedLogs: TimeLog[] = [];
      querySnapshot.forEach((doc) => {
        fetchedLogs.push({ id: doc.id, ...doc.data() } as TimeLog);
      });
      setTimeLogs(fetchedLogs);
    } catch (error) {
      console.error("Error fetching all time logs:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not fetch time log history." });
    }
  }, [user, toast]);

  const fetchTodaysTimeIn = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = query(
        collection(db, "timeLogs"), 
        where("userId", "==", user.uid), 
        orderBy("timeIn", "desc"), 
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const latestLog = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as TimeLog;
        const timeInDate = typeof latestLog.timeIn === 'string' ? parseISO(latestLog.timeIn) : latestLog.timeIn;

        if (isValid(timeInDate) && isToday(timeInDate) && !latestLog.timeOut) {
          setTodaysTimeIn(latestLog);
        } else {
          setTodaysTimeIn(null);
        }
      } else {
        setTodaysTimeIn(null);
      }
    } catch (error) {
      console.error("Error fetching today's time log:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not fetch latest time log." });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);


  useEffect(() => {
    if(user) {
        fetchTodaysTimeIn();
    } else {
        setLoading(false);
        setTimeLogs([]);
        setTodaysTimeIn(null);
    }
  }, [user, fetchTodaysTimeIn]);

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

