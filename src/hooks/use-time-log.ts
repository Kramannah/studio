

"use client"

import { useState, useEffect, useCallback } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { useAuth } from './use-auth';

const TIME_LOGS_KEY_PREFIX = 'sfe-offline-coverage-time-logs';
const CURRENT_LOG_KEY_PREFIX = 'sfe-offline-coverage-current-log';

export const useTimeLog = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [currentTimeLog, setCurrentTimeLog] = useState<TimeLog | null>(null);
  const [userId, setUserId] = useState('');

  const getTimeLogsKey = useCallback(() => `${TIME_LOGS_KEY_PREFIX}_${user?.uid}`, [user]);
  const getCurrentLogKey = useCallback(() => `${CURRENT_LOG_KEY_PREFIX}_${user?.uid}`, [user]);

  useEffect(() => {
    if (typeof window !== 'undefined' && user) {
      setUserId(user.email || user.uid);
      try {
        const storedLogs = localStorage.getItem(getTimeLogsKey());
        if (storedLogs) {
          setTimeLogs(JSON.parse(storedLogs));
        } else {
          setTimeLogs([]);
        }
        const storedCurrent = localStorage.getItem(getCurrentLogKey());
        if (storedCurrent) {
          setCurrentTimeLog(JSON.parse(storedCurrent));
        } else {
            setCurrentTimeLog(null);
        }

      } catch (error) {
        console.error("Failed to parse time logs from localStorage", error);
        toast({
          variant: 'destructive',
          title: 'Error loading data',
          description: 'Could not load your time log entries.',
        });
      }
    } else if (!user) {
        // Clear data if user logs out
        setTimeLogs([]);
        setCurrentTimeLog(null);
    }
  }, [toast, user, getTimeLogsKey, getCurrentLogKey]);

  const updateLogsInStorage = useCallback((updatedLogs: TimeLog[]) => {
    localStorage.setItem(getTimeLogsKey(), JSON.stringify(updatedLogs));
  }, [getTimeLogsKey]);

  const updateCurrentLogInStorage = useCallback((currentLog: TimeLog | null) => {
    if (currentLog) {
      localStorage.setItem(getCurrentLogKey(), JSON.stringify(currentLog));
    } else {
      localStorage.removeItem(getCurrentLogKey());
    }
  }, [getCurrentLogKey]);

  const handleTimeIn = useCallback((locationType: 'inbase' | 'outbase') => {
    if (!user) return;
    const newLog: TimeLog = {
      id: crypto.randomUUID(),
      userId: user.uid,
      timeIn: new Date().toISOString(),
      timeOut: null,
      locationType,
    };
    setCurrentTimeLog(newLog);
    updateCurrentLogInStorage(newLog);
    toast({ title: "Time In Successful", description: `You timed in at ${format(new Date(newLog.timeIn), 'PPP p')}.` });
  }, [toast, user, updateCurrentLogInStorage]);

  const handleTimeOut = useCallback(() => {
    if (!currentTimeLog) return;
    
    const completedLog: TimeLog = {
      ...currentTimeLog,
      timeOut: new Date().toISOString(),
    };

    const updatedLogs = [...timeLogs, completedLog];
    setTimeLogs(updatedLogs);
    updateLogsInStorage(updatedLogs);

    setCurrentTimeLog(null);
    updateCurrentLogInStorage(null);

    toast({ title: "Time Out Successful", description: `You timed out at ${format(new Date(completedLog.timeOut!), 'PPP p')}.` });
  }, [currentTimeLog, timeLogs, toast, updateLogsInStorage, updateCurrentLogInStorage]);

  const clearTimeLogs = useCallback(() => {
    setTimeLogs([]);
    updateLogsInStorage([]);
    toast({ title: "Time Log History Cleared", variant: "destructive" });
  }, [toast, updateLogsInStorage]);


  return { timeLogs, currentTimeLog, handleTimeIn, handleTimeOut, clearTimeLogs, userId };
};
