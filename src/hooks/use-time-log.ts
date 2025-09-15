
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { useAuth } from './use-auth';

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

  useEffect(() => {
    if (user) {
      setLoading(true);
      setUserId(user.email || user.uid);
      try {
        const localLogs = localStorage.getItem(getLogsLocalKey());
        if (localLogs) setTimeLogs(JSON.parse(localLogs));

        const localCurrent = localStorage.getItem(getCurrentLogLocalKey());
        if (localCurrent) setCurrentTimeLog(JSON.parse(localCurrent));
      } catch (error) {
        console.error("Error reading time logs from local storage:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load time log data." });
      } finally {
        setLoading(false);
      }
    } else {
      setTimeLogs([]);
      setCurrentTimeLog(null);
      setUserId('');
      setLoading(false);
    }
  }, [user, getLogsLocalKey, getCurrentLogLocalKey, toast]);

  const handleTimeIn = useCallback((locationType: 'inbase' | 'outbase') => {
    if (!user) return;
    
    if (currentTimeLog) {
        toast({ title: "Already Timed In", description: "You already have an active session." });
        return;
    }
      
    const newLog: TimeLog = {
      id: crypto.randomUUID(),
      userId: user.uid,
      timeIn: new Date().toISOString(),
      timeOut: null,
      locationType,
    };
    
    setCurrentTimeLog(newLog);
    localStorage.setItem(getCurrentLogLocalKey(), JSON.stringify(newLog));
    toast({ title: "Time In Successful", description: `You timed in at ${format(new Date(newLog.timeIn), 'PPP p')}.` });
  }, [toast, user, getCurrentLogLocalKey, currentTimeLog]);

  const handleTimeOut = useCallback(() => {
    if (!currentTimeLog) return;
    
    const timeOut = new Date().toISOString();
    const completedLog: TimeLog = { ...currentTimeLog, timeOut };
    const updatedLogs = [completedLog, ...timeLogs];
    
    setTimeLogs(updatedLogs);
    localStorage.setItem(getLogsLocalKey(), JSON.stringify(updatedLogs));

    setCurrentTimeLog(null);
    localStorage.removeItem(getCurrentLogLocalKey());

    toast({ title: "Time Out Successful", description: `You timed out at ${format(new Date(timeOut), 'PPP p')}.` });
  }, [currentTimeLog, timeLogs, toast, getLogsLocalKey, getCurrentLogLocalKey]);

  const clearTimeLogs = useCallback(() => {
    if (!user) return;
    setTimeLogs([]);
    localStorage.removeItem(getLogsLocalKey());
    toast({ title: "Time Log History Cleared", variant: "destructive" });
  }, [toast, user, getLogsLocalKey]);

  return { timeLogs, currentTimeLog, handleTimeIn, handleTimeOut, clearTimeLogs, userId, loading };
};
