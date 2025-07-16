"use client"

import { useState, useEffect, useCallback } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";

const OFFLINE_KEY = 'hovidcoverage-offline';
const MASTER_KEY = 'hovidcoverage-master';

export const useOfflineSync = () => {
  const { toast } = useToast();
  const [offlineEntries, setOfflineEntries] = useState<CoverageEntry[]>([]);
  const [masterEntries, setMasterEntries] = useState<CoverageEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const offlineData = localStorage.getItem(OFFLINE_KEY);
      const masterData = localStorage.getItem(MASTER_KEY);
      if (offlineData) setOfflineEntries(JSON.parse(offlineData));
      if (masterData) setMasterEntries(JSON.parse(masterData));
      setIsOnline(navigator.onLine);
    }
  }, []);

  const syncAllOfflineEntries = useCallback(async () => {
    if (!navigator.onLine || isSyncing || offlineEntries.length === 0) {
      if(offlineEntries.length > 0 && navigator.onLine){
        toast({ title: 'Sync in progress.', description: 'Please wait.' });
      }
      return;
    }

    setIsSyncing(true);
    toast({ title: 'Syncing started...', description: `${offlineEntries.length} entries to sync.` });

    const entriesToSync = [...offlineEntries];
    const syncedEntries: CoverageEntry[] = [];
    const failedEntries: CoverageEntry[] = [];

    for (const entry of entriesToSync) {
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('Syncing entry:', entry.id);
        syncedEntries.push(entry);
      } catch (error) {
        console.error('Failed to sync entry:', entry.id, error);
        failedEntries.push(entry);
      }
    }

    if (syncedEntries.length > 0) {
      const newMasterEntries = [...masterEntries, ...syncedEntries];
      setMasterEntries(newMasterEntries);
      localStorage.setItem(MASTER_KEY, JSON.stringify(newMasterEntries));

      const newOfflineEntries = offlineEntries.filter(
        entry => !syncedEntries.some(synced => synced.id === entry.id)
      );
      setOfflineEntries(newOfflineEntries);
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(newOfflineEntries));
      toast({ title: 'Sync successful!', description: `${syncedEntries.length} entries have been synced.` });
    }
    
    if (failedEntries.length > 0) {
      toast({ variant: 'destructive', title: 'Sync issues', description: `${failedEntries.length} entries failed to sync.` });
    }

    setIsSyncing(false);
  }, [isSyncing, offlineEntries, masterEntries, toast]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncAllOfflineEntries();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial sync check
    if(navigator.onLine && offlineEntries.length > 0){
        syncAllOfflineEntries();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncAllOfflineEntries, offlineEntries.length]);


  const saveEntry = async (entry: Omit<CoverageEntry, 'id' | 'submittedAt'>) => {
    const newEntry: CoverageEntry = {
      ...entry,
      id: crypto.randomUUID(),
      submittedAt: new Date().toISOString(),
    };
    
    const newOfflineEntries = [newEntry, ...offlineEntries];
    setOfflineEntries(newOfflineEntries);
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(newOfflineEntries));
    toast({ title: "Entry saved locally", description: "It will be synced when you're online." });

    if(isOnline) {
      syncAllOfflineEntries();
    }
  };

  return { offlineEntries, masterEntries, saveEntry, isSyncing, syncAllOfflineEntries, isOnline };
};
