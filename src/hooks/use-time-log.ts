

"use client"

import { useState, useEffect, useCallback } from 'react';
import type { TimeLog } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';

const TIME_LOGS_KEY = 'sfe-offline-coverage-time-logs';
const CURRENT_LOG_KEY = 'sfe-offline-coverage-current-log';
const USER_ID_KEY = 'sfe-offline-coverage-user-id';


export const useTimeLog = () => {
  const { toast } = useToast();
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [currentTimeLog, setCurrentTimeLog] = useState<TimeLog | null>(null);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedLogs = localStorage.getItem(TIME_LOGS_KEY);
        if (storedLogs) {
          setTimeLogs(JSON.parse(storedLogs));
        }
        const storedCurrent = localStorage.getItem(CURRENT_LOG_KEY);
        if (storedCurrent) {
          setCurrentTimeLog(JSON.parse(storedCurrent));
        }

        let storedUserId = localStorage.getItem(USER_ID_KEY);
        if(!storedUserId) {
            storedUserId = `Mark Michael`;
            localStorage.setItem(USER_ID_KEY, storedUserId);
        }
        setUserId(storedUserId);

      } catch (error) {
        console.error("Failed to parse time logs from localStorage", error);
        toast({
          variant: 'destructive',
          title: 'Error loading data',
          description: 'Could not load your time log entries.',
        });
      }
    }
  }, [toast]);

  const updateLogsInStorage = (updatedLogs: TimeLog[]) => {
    localStorage.setItem(TIME_LOGS_KEY, JSON.stringify(updatedLogs));
  };

  const updateCurrentLogInStorage = (currentLog: TimeLog | null) => {
    if (currentLog) {
      localStorage.setItem(CURRENT_LOG_KEY, JSON.stringify(currentLog));
    } else {
      localStorage.removeItem(CURRENT_LOG_KEY);
    }
  };

  const handleTimeIn = useCallback((locationType: 'inbase' | 'outbase') => {
    const newLog: TimeLog = {
      id: crypto.randomUUID(),
      userId: userId,
      timeIn: new Date().toISOString(),
      timeOut: null,
      locationType,
    };
    setCurrentTimeLog(newLog);
    updateCurrentLogInStorage(newLog);
    toast({ title: "Time In Successful", description: `You timed in at ${format(new Date(newLog.timeIn), 'PPP p')}.` });
  }, [toast, userId]);

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
  }, [currentTimeLog, timeLogs, toast]);

  const clearTimeLogs = useCallback(() => {
    setTimeLogs([]);
    updateLogsInStorage([]);
    toast({ title: "Time Log History Cleared", variant: "destructive" });
  }, [toast]);


  return { timeLogs, currentTimeLog, handleTimeIn, handleTimeOut, clearTimeLogs, userId };
};
