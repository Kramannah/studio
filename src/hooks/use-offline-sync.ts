

"use client"

import { useState, useEffect, useCallback } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";

const OFFLINE_KEY = 'sfe-offline-coverage-offline';
const MASTER_KEY = 'sfe-offline-coverage-master';

export const useOfflineSync = (updateSampleUsage?: (productName: string, quantity: number) => void) => {
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
      
      const onlineStatus = navigator.onLine;
      setIsOnline(onlineStatus);
      if (onlineStatus && offlineData && JSON.parse(offlineData).length > 0) {
        syncAllOfflineEntries();
      }
    }
  }, []);

  const syncAllOfflineEntries = useCallback(async () => {
    if (!navigator.onLine) {
        toast({ variant: 'destructive', title: 'You are offline', description: 'Please connect to the internet to sync.' });
        return;
    }

    const entriesToSync = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]');
    if (entriesToSync.length === 0) {
        return;
    }

    if (isSyncing) {
      toast({ title: 'Sync in progress.', description: 'Please wait.' });
      return;
    }

    setIsSyncing(true);
    toast({ title: 'Syncing started...', description: `${entriesToSync.length} entries to sync.` });

    // Simulate API calls for each entry
    await new Promise(resolve => setTimeout(resolve, 100 * entriesToSync.length));

    // Move entries from offline to master
    const currentMasterEntries = JSON.parse(localStorage.getItem(MASTER_KEY) || '[]');
    const newMasterEntries = [...currentMasterEntries, ...entriesToSync];
    
    setMasterEntries(newMasterEntries);
    localStorage.setItem(MASTER_KEY, JSON.stringify(newMasterEntries));

    if (updateSampleUsage) {
        for (const entry of entriesToSync) {
            if (entry.primarySampleName && entry.primaryProductQty) {
                updateSampleUsage(entry.primarySampleName, entry.primaryProductQty);
            }
            if (entry.secondarySampleName && entry.secondaryProductQty) {
                updateSampleUsage(entry.secondarySampleName, entry.secondaryProductQty);
            }
        }
    }
    
    setOfflineEntries([]);
    localStorage.setItem(OFFLINE_KEY, JSON.stringify([]));

    toast({ title: 'Sync successful!', description: `${entriesToSync.length} entries have been synced.` });
    setIsSyncing(false);
    
  }, [isSyncing, toast, updateSampleUsage]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      const offlineData = localStorage.getItem(OFFLINE_KEY);
      if (offlineData && JSON.parse(offlineData).length > 0) {
        syncAllOfflineEntries();
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncAllOfflineEntries]);


  const saveEntry = async (entry: Omit<CoverageEntry, 'id' | 'submittedAt'>) => {
    const newEntry: CoverageEntry = {
      ...entry,
      id: crypto.randomUUID(),
      submittedAt: new Date().toISOString(),
    };
    
    if (isOnline) {
        // If online, sync immediately
        setIsSyncing(true);
        toast({ title: "Submitting...", description: "Saving your entry directly." });
        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network latency

        if (updateSampleUsage) {
            if (newEntry.primarySampleName && newEntry.primaryProductQty) {
                updateSampleUsage(newEntry.primarySampleName, newEntry.primaryProductQty);
            }
            if (newEntry.secondarySampleName && newEntry.secondaryProductQty) {
                updateSampleUsage(newEntry.secondarySampleName, newEntry.secondaryProductQty);
            }
        }

        const newMasterEntries = [...masterEntries, newEntry];
        setMasterEntries(newMasterEntries);
        localStorage.setItem(MASTER_KEY, JSON.stringify(newMasterEntries));

        toast({ title: "Entry Submitted", description: "Your coverage has been saved." });
        setIsSyncing(false);

    } else {
        // If offline, save to queue
        const newOfflineEntries = [newEntry, ...offlineEntries];
        setOfflineEntries(newOfflineEntries);
        localStorage.setItem(OFFLINE_KEY, JSON.stringify(newOfflineEntries));
        toast({ title: "Entry saved locally", description: "It will be synced when you're online." });
    }
  };

  const deleteMasterEntry = useCallback((id: string) => {
    const entryToDelete = masterEntries.find(e => e.id === id);
    const updatedEntries = masterEntries.filter(e => e.id !== id);
    setMasterEntries(updatedEntries);
    localStorage.setItem(MASTER_KEY, JSON.stringify(updatedEntries));
    if (entryToDelete) {
        // Here you might want to reverse the sample usage, but for now we just delete
        toast({ variant: 'destructive', title: "Entry Deleted", description: `Coverage for ${entryToDelete.firstName} ${entryToDelete.lastName} has been removed.` });
    }
  }, [masterEntries, toast]);

  const updateMasterEntry = useCallback((entryToUpdate: Omit<CoverageEntry, 'submittedAt'>) => {
    const originalEntry = masterEntries.find(e => e.id === entryToUpdate.id);
    if (!originalEntry) return;

    const updatedEntry: CoverageEntry = {
      ...originalEntry,
      ...entryToUpdate,
    };
    
    // Note: Reversing and reapplying sample usage on edit could be complex.
    // For now, we are just updating the entry.
    // A more robust solution might track the delta of sample quantities.

    const updatedEntries = masterEntries.map(e => e.id === updatedEntry.id ? updatedEntry : e);
    setMasterEntries(updatedEntries);
    localStorage.setItem(MASTER_KEY, JSON.stringify(updatedEntries));
    toast({ title: "Entry Updated", description: `Coverage for ${updatedEntry.firstName} ${updatedEntry.lastName} has been updated.` });
  }, [masterEntries, toast]);

  return { offlineEntries, masterEntries, saveEntry, deleteMasterEntry, isSyncing, syncAllOfflineEntries, isOnline, updateMasterEntry };
};
