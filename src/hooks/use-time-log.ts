
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, updateDoc, doc, limit, orderBy, serverTimestamp } from 'firebase/firestore';

export const useTimeLog = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [currentTimeLog, setCurrentTimeLog] = useState<TimeLog | null>(null);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTimeLogs = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setTimeLogs([]);
      setCurrentTimeLog(null);
      return;
    }
    
    setLoading(true);
    setUserId(user.email || user.uid);
    try {
      // Fetch all logs for history
      const historyQuery = query(collection(db, 'timeLogs'), where('userId', '==', user.uid), orderBy('timeIn', 'desc'));
      const historySnapshot = await getDocs(historyQuery);
      const fetchedLogs = historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeLog));
      setTimeLogs(fetchedLogs);

      // Check for an active (not timed-out) session
      const activeLogQuery = query(collection(db, 'timeLogs'), where('userId', '==', user.uid), where('timeOut', '==', null), limit(1));
      const activeLogSnapshot = await getDocs(activeLogQuery);
      
      if (!activeLogSnapshot.empty) {
        const activeLogDoc = activeLogSnapshot.docs[0];
        setCurrentTimeLog({ id: activeLogDoc.id, ...activeLogDoc.data() } as TimeLog);
      } else {
        setCurrentTimeLog(null);
      }
    } catch (error) {
      console.error("Error fetching time logs:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load time log data." });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchTimeLogs();
  }, [fetchTimeLogs]);

  const handleTimeIn = useCallback(async (locationType: 'inbase' | 'outbase') => {
    if (!user) return;
    
    if (currentTimeLog) {
        toast({ title: "Already Timed In", description: "You already have an active session." });
        return;
    }

    try {
      const newLogData = {
        userId: user.uid,
        timeIn: new Date().toISOString(),
        timeOut: null,
        locationType,
      };
      const docRef = await addDoc(collection(db, 'timeLogs'), newLogData);
      const newLog = { id: docRef.id, ...newLogData };
      setCurrentTimeLog(newLog);
      toast({ title: "Time In Successful", description: `You timed in at ${format(new Date(newLog.timeIn), 'PPP p')}.` });
    } catch (error) {
      console.error("Error timing in:", error);
      toast({ variant: "destructive", title: "Time In Failed", description: "Could not save time-in record online." });
    }
  }, [toast, user, currentTimeLog]);

  const handleTimeOut = useCallback(async () => {
    if (!currentTimeLog) return;
    
    const timeOut = new Date().toISOString();
    try {
      const logRef = doc(db, 'timeLogs', currentTimeLog.id);
      await updateDoc(logRef, { timeOut: timeOut });

      const completedLog: TimeLog = { ...currentTimeLog, timeOut };
      setTimeLogs(prev => [completedLog, ...prev]);
      setCurrentTimeLog(null);

      toast({ title: "Time Out Successful", description: `You timed out at ${format(new Date(timeOut), 'PPP p')}.` });
    } catch (error) {
      console.error("Error timing out:", error);
      toast({ variant: "destructive", title: "Time Out Failed", description: "Could not save time-out record online." });
    }
  }, [currentTimeLog, toast]);

  const clearTimeLogs = useCallback(async () => {
    if (!user) return;
    // This is a destructive operation, consider if it's really needed.
    // For now, it will just clear local state, not Firestore.
    setTimeLogs([]);
    toast({ title: "Local Time Log History Cleared", description: "To permanently delete, please manage data in Firestore.", variant: "destructive" });
  }, [toast, user]);

  return { timeLogs, currentTimeLog, handleTimeIn, handleTimeOut, clearTimeLogs, userId, loading };
};
