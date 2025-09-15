
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, updateDoc, doc, limit, orderBy } from 'firebase/firestore';

const TIME_LOGS_LOCAL_KEY = 'sfe-offline-coverage-time-logs-local';
const CURRENT_LOG_LOCAL_KEY = 'sfe-offline-coverage-current-log-local';

export const useTimeLog = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [currentTimeLog, setCurrentTimeLog] = useState<TimeLog | null>(null);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);

  const getLogsLocalKey = useCallback(() => `${TIME_LOGS_LOCAL_KEY}_${user?.uid}`, [user]);
  const getCurrentLogLocalKey = useCallback(() => `${CURRENT_LOG_LOCAL_KEY}_${user?.uid}`, [user]);

  const fetchTimeLogsFromFirestore = useCallback(async () => {
    if (!db || !user) {
        setTimeLogs([]);
        return [];
    }
    try {
        const q = query(collection(db, 'timeLogs'), where("userId", "==", user.uid), orderBy("timeIn", "desc"));
        const querySnapshot = await getDocs(q);
        const firestoreLogs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeLog));
        
        setTimeLogs(firestoreLogs);
        localStorage.setItem(getLogsLocalKey(), JSON.stringify(firestoreLogs));
        return firestoreLogs;
    } catch (error) {
        console.error("Error fetching time logs from Firestore:", error);
        toast({
            variant: "destructive",
            title: "Network Error",
            description: "Could not fetch time logs. Loading local data."
        });
        const localData = localStorage.getItem(getLogsLocalKey());
        return localData ? JSON.parse(localData) : [];
    }
  }, [user, getLogsLocalKey, toast]);

  const checkForActiveLogIn = useCallback(async () => {
      if (!user || !db) {
        setCurrentTimeLog(null);
        return;
      }
      try {
        const q = query(
            collection(db, 'timeLogs'), 
            where("userId", "==", user.uid), 
            where("timeOut", "==", null),
            orderBy("timeIn", "desc"),
            limit(1)
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const activeLog = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as TimeLog;
            setCurrentTimeLog(activeLog);
            localStorage.setItem(getCurrentLogLocalKey(), JSON.stringify(activeLog));
        } else {
            setCurrentTimeLog(null);
            localStorage.removeItem(getCurrentLogLocalKey());
        }
      } catch (error) {
        console.error("Error checking for active log in:", error);
        const localCurrent = localStorage.getItem(getCurrentLogLocalKey());
        if (localCurrent) setCurrentTimeLog(JSON.parse(localCurrent));
      }
  }, [user, getCurrentLogLocalKey]);


  useEffect(() => {
    if (user) {
      setLoading(true);
      setUserId(user.email || user.uid);
      
      const localLogs = localStorage.getItem(getLogsLocalKey());
      if (localLogs) setTimeLogs(JSON.parse(localLogs));

      const localCurrent = localStorage.getItem(getCurrentLogLocalKey());
      if (localCurrent) setCurrentTimeLog(JSON.parse(localCurrent));

      Promise.all([fetchTimeLogsFromFirestore(), checkForActiveLogIn()]).finally(() => {
          setLoading(false);
      });

    } else {
      setTimeLogs([]);
      setCurrentTimeLog(null);
      setUserId('');
      setLoading(false);
    }
  }, [user, fetchTimeLogsFromFirestore, checkForActiveLogIn, getLogsLocalKey, getCurrentLogLocalKey]);


  const handleTimeIn = useCallback(async (locationType: 'inbase' | 'outbase') => {
    if (!user || !db) return;
    
    if (currentTimeLog) {
        toast({ title: "Already Timed In", description: "You already have an active session." });
        return;
    }
      
    const newLogData: Omit<TimeLog, 'id'> = {
      userId: user.uid,
      timeIn: new Date().toISOString(),
      timeOut: null,
      locationType,
    };

    try {
        const docRef = await addDoc(collection(db, 'timeLogs'), newLogData);
        const newLog = { ...newLogData, id: docRef.id };
        setCurrentTimeLog(newLog);
        localStorage.setItem(getCurrentLogLocalKey(), JSON.stringify(newLog));
        toast({ title: "Time In Successful", description: `You timed in at ${format(new Date(newLog.timeIn), 'PPP p')}.` });
    } catch (error) {
        console.error("Error during time in:", error);
        toast({ variant: 'destructive', title: 'Time In Failed', description: 'Could not save time-in record online.' });
    }
  }, [toast, user, getCurrentLogLocalKey, currentTimeLog]);

  const handleTimeOut = useCallback(async () => {
    if (!currentTimeLog || !db) return;
    
    const timeOut = new Date().toISOString();
    
    try {
        const docRef = doc(db, "timeLogs", currentTimeLog.id);
        await updateDoc(docRef, { timeOut: timeOut });
        
        const completedLog: TimeLog = { ...currentTimeLog, timeOut };
        const updatedLogs = [completedLog, ...timeLogs];
        
        setTimeLogs(updatedLogs);
        localStorage.setItem(getLogsLocalKey(), JSON.stringify(updatedLogs));

        setCurrentTimeLog(null);
        localStorage.removeItem(getCurrentLogLocalKey());

        toast({ title: "Time Out Successful", description: `You timed out at ${format(new Date(timeOut), 'PPP p')}.` });
    } catch (error) {
        console.error("Error during time out:", error);
        toast({ variant: 'destructive', title: 'Time Out Failed', description: 'Could not save time-out record online.' });
    }
  }, [currentTimeLog, timeLogs, toast, getLogsLocalKey, getCurrentLogLocalKey]);

  const clearTimeLogs = useCallback(async () => {
    if (!user || !db) return;
    try {
        const q = query(collection(db, 'timeLogs'), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        const batch = writeBatch(db);
        querySnapshot.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();

        setTimeLogs([]);
        localStorage.removeItem(getLogsLocalKey());
        toast({ title: "Time Log History Cleared", variant: "destructive" });
    } catch(error) {
        console.error("Error clearing time logs:", error);
        toast({ variant: "destructive", title: "Clear Failed", description: "Could not clear time log history."});
    }
  }, [toast, user, getLogsLocalKey]);


  return { timeLogs, currentTimeLog, handleTimeIn, handleTimeOut, clearTimeLogs, userId, loading };
};
