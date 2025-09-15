
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, orderBy, limit } from 'firebase/firestore';


const TIME_LOGS_KEY_PREFIX = 'sfe-offline-coverage-time-logs';
const CURRENT_LOG_KEY_PREFIX = 'sfe-offline-coverage-current-log';

export const useTimeLog = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [currentTimeLog, setCurrentTimeLog] = useState<TimeLog | null>(null);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);

  const getTimeLogsKey = useCallback(() => `${TIME_LOGS_KEY_PREFIX}_${user?.uid}`, [user]);
  const getCurrentLogKey = useCallback(() => `${CURRENT_LOG_KEY_PREFIX}_${user?.uid}`, [user]);

  const fetchTimeLogs = useCallback(async () => {
      if (!user) {
        setTimeLogs([]);
        setCurrentTimeLog(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setUserId(user.email || user.uid);

      // Load local data first for responsiveness
      const localLogs = localStorage.getItem(getTimeLogsKey());
      if(localLogs) setTimeLogs(JSON.parse(localLogs));
      const localCurrent = localStorage.getItem(getCurrentLogKey());
      if(localCurrent) setCurrentTimeLog(JSON.parse(localCurrent));

      if (navigator.onLine) {
        try {
            // Fetch all completed logs
            const logsQuery = query(collection(db, "timeLogs"), where("userId", "==", user.uid), where("timeOut", "!=", null), orderBy("timeOut", "desc"));
            const logsSnapshot = await getDocs(logsQuery);
            const firestoreLogs = logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeLog));
            setTimeLogs(firestoreLogs);
            localStorage.setItem(getTimeLogsKey(), JSON.stringify(firestoreLogs));

            // Check for an open log on Firestore
            const currentLogQuery = query(collection(db, "timeLogs"), where("userId", "==", user.uid), where("timeOut", "==", null), orderBy("timeIn", "desc"), limit(1));
            const currentLogSnapshot = await getDocs(currentLogQuery);

            if (!currentLogSnapshot.empty) {
                const firestoreCurrentLog = { id: currentLogSnapshot.docs[0].id, ...currentLogSnapshot.docs[0].data() } as TimeLog;
                setCurrentTimeLog(firestoreCurrentLog);
                localStorage.setItem(getCurrentLogKey(), JSON.stringify(firestoreCurrentLog));
            } else {
                // If no open log on firestore, ensure local is also clear
                setCurrentTimeLog(null);
                localStorage.removeItem(getCurrentLogKey());
            }
        } catch (error) {
            console.error("Error fetching time logs from Firestore:", error);
            toast({ variant: 'destructive', title: 'Sync Error', description: 'Could not fetch latest time logs.' });
        }
      }
      setLoading(false);

  }, [user, toast, getTimeLogsKey, getCurrentLogKey]);

  useEffect(() => {
    fetchTimeLogs();
  }, [fetchTimeLogs]);


  const handleTimeIn = useCallback(async (locationType: 'inbase' | 'outbase') => {
    if (!user) return;
    const newLogData: Omit<TimeLog, 'id'> = {
      userId: user.uid,
      timeIn: new Date().toISOString(),
      timeOut: null,
      locationType,
    };

    try {
        const docRef = await addDoc(collection(db, "timeLogs"), newLogData);
        const newLog = { ...newLogData, id: docRef.id };
        setCurrentTimeLog(newLog);
        localStorage.setItem(getCurrentLogKey(), JSON.stringify(newLog));
        toast({ title: "Time In Successful", description: `You timed in at ${format(new Date(newLog.timeIn), 'PPP p')}.` });
    } catch(e) {
        console.error(e);
        toast({ variant: 'destructive', title: 'Time In Failed', description: 'Could not save time-in to server.' });
    }
  }, [toast, user, getCurrentLogKey]);

  const handleTimeOut = useCallback(async () => {
    if (!currentTimeLog || !currentTimeLog.id) return;
    
    const timeOut = new Date().toISOString();
    
    try {
        const docRef = doc(db, "timeLogs", currentTimeLog.id);
        await updateDoc(docRef, { timeOut });

        const completedLog: TimeLog = { ...currentTimeLog, timeOut };
        const updatedLogs = [...timeLogs, completedLog];
        
        setTimeLogs(updatedLogs);
        localStorage.setItem(getTimeLogsKey(), JSON.stringify(updatedLogs));

        setCurrentTimeLog(null);
        localStorage.removeItem(getCurrentLogKey());

        toast({ title: "Time Out Successful", description: `You timed out at ${format(new Date(timeOut), 'PPP p')}.` });
    } catch (e) {
        console.error(e);
        toast({ variant: 'destructive', title: 'Time Out Failed', description: 'Could not save time-out to server.' });
    }
  }, [currentTimeLog, timeLogs, toast, getTimeLogsKey, getCurrentLogKey]);

  const clearTimeLogs = useCallback(async () => {
    if (!user) return;
    
    // Optimistically clear UI
    setTimeLogs([]);
    localStorage.removeItem(getTimeLogsKey());
    toast({ title: "Time Log History Cleared", variant: "destructive" });

    // Delete from Firestore
    try {
        const q = query(collection(db, "timeLogs"), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        const batch = writeBatch(db);
        querySnapshot.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
    } catch(e) {
        console.error("Failed to clear firestore time logs", e);
        toast({ variant: 'destructive', title: 'Clear Failed', description: 'Could not clear history from server. Please try again.'});
        // Refetch to restore UI state if server delete fails
        fetchTimeLogs();
    }

  }, [toast, user, getTimeLogsKey, fetchTimeLogs]);


  return { timeLogs, currentTimeLog, handleTimeIn, handleTimeOut, clearTimeLogs, userId, loading };
};
