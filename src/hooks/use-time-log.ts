
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
  const [loading, setLoading] = useState(true);

  const getTimeLogsKey = useCallback(() => `${TIME_LOGS_KEY_PREFIX}_${user?.uid}`, [user]);
  const getCurrentLogKey = useCallback(() => `${CURRENT_LOG_KEY_PREFIX}_${user?.uid}`, [user]);

  useEffect(() => {
    if (!user) {
      setTimeLogs([]);
      setCurrentTimeLog(null);
      setUserId('');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setUserId(user.email || user.uid);

    try {
      const localLogs = localStorage.getItem(getTimeLogsKey());
      if(localLogs) setTimeLogs(JSON.parse(localLogs));

      const localCurrent = localStorage.getItem(getCurrentLogKey());
      if(localCurrent) setCurrentTimeLog(JSON.parse(localCurrent));
    } catch(e) {
      console.error("Failed to load time logs from storage", e);
      toast({ variant: 'destructive', title: 'Load Error', description: 'Could not load time tracking data.'});
    }

    setLoading(false);
  }, [user, toast, getTimeLogsKey, getCurrentLogKey]);


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
    localStorage.setItem(getCurrentLogKey(), JSON.stringify(newLog));
    toast({ title: "Time In Successful", description: `You timed in at ${format(new Date(newLog.timeIn), 'PPP p')}.` });
  }, [toast, user, getCurrentLogKey]);

  const handleTimeOut = useCallback(() => {
    if (!currentTimeLog) return;
    
    const timeOut = new Date().toISOString();
    const completedLog: TimeLog = { ...currentTimeLog, timeOut };
    
    const updatedLogs = [...timeLogs, completedLog];
    
    setTimeLogs(updatedLogs);
    localStorage.setItem(getTimeLogsKey(), JSON.stringify(updatedLogs));

    setCurrentTimeLog(null);
    localStorage.removeItem(getCurrentLogKey());

    toast({ title: "Time Out Successful", description: `You timed out at ${format(new Date(timeOut), 'PPP p')}.` });
  }, [currentTimeLog, timeLogs, toast, getTimeLogsKey, getCurrentLogKey]);

  const clearTimeLogs = useCallback(() => {
    setTimeLogs([]);
    localStorage.removeItem(getTimeLogsKey());
    toast({ title: "Time Log History Cleared", variant: "destructive" });
  }, [toast, getTimeLogsKey]);


  return { timeLogs, currentTimeLog, handleTimeIn, handleTimeOut, clearTimeLogs, userId, loading };
};
