
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from './use-auth';

// This key is now used for ALL submitted entries, not just offline ones.
const MASTER_ENTRIES_KEY = 'sfe-offline-coverage-master-entries';

export const useOfflineSync = (updateSampleUsage?: (productName: string, quantity: number) => void) => {
  const { toast } = useToast();
  const { user } = useAuth();
  
  // offlineEntries is now deprecated as everything is "offline"
  const [offlineEntries, setOfflineEntries] = useState<CoverageEntry[]>([]); 
  const [masterEntries, setMasterEntries] = useState<CoverageEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false); // Kept for UI compatibility, but will not be used.
  const [isOnline, setIsOnline] = useState(true); // Assumed online, as there's no server to connect to.

  const getMasterKey = useCallback(() => `${MASTER_ENTRIES_KEY}_${user?.uid}`, [user]);

  useEffect(() => {
    const handleOnlineStatusChange = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnlineStatusChange);
    window.addEventListener('offline', handleOnlineStatusChange);
    return () => {
      window.removeEventListener('online', handleOnlineStatusChange);
      window.removeEventListener('offline', handleOnlineStatusChange);
    };
  }, []);

  useEffect(() => {
    if (user) {
      try {
        const localMasterData = localStorage.getItem(getMasterKey());
        if (localMasterData) {
          setMasterEntries(JSON.parse(localMasterData));
        } else {
          setMasterEntries([]);
        }
      } catch (error) {
        console.error("Failed to parse master entries from local storage:", error);
      }
    } else {
      setMasterEntries([]);
    }
  }, [user, getMasterKey]);
  
  const updateMasterInStorage = (updatedEntries: CoverageEntry[]) => {
      setMasterEntries(updatedEntries);
      localStorage.setItem(getMasterKey(), JSON.stringify(updatedEntries));
  }

  const saveEntry = (entry: Omit<CoverageEntry, 'id' | 'submittedAt' | 'userId'>) => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Not logged in', description: 'You must be logged in to save entries.'});
        return;
    }

    const newEntry: CoverageEntry = {
      ...entry,
      id: crypto.randomUUID(),
      userId: user.uid,
      submittedAt: new Date().toISOString(),
    };

    if (updateSampleUsage) {
        if (newEntry.primarySampleName && newEntry.primaryProductQty) {
            updateSampleUsage(newEntry.primarySampleName, newEntry.primaryProductQty);
        }
        if (newEntry.secondarySampleName && newEntry.secondaryProductQty) {
            updateSampleUsage(newEntry.secondarySampleName, newEntry.secondaryProductQty);
        }
    }
    
    const updatedMaster = [...masterEntries, newEntry].sort((a,b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    updateMasterInStorage(updatedMaster);
    toast({ title: "Entry Saved", description: "Your coverage report has been saved locally." });
  };

  const deleteMasterEntry = (id: string) => {
    const entryToDelete = masterEntries.find(e => e.id === id);
    const updatedEntries = masterEntries.filter(e => e.id !== id);
    updateMasterInStorage(updatedEntries);
    if(entryToDelete) {
        toast({ variant: 'destructive', title: "Entry Deleted", description: `Coverage for ${entryToDelete.firstName} ${entryToDelete.lastName} has been removed.` });
    }
  };

  const updateMasterEntry = (entryToUpdate: Omit<CoverageEntry, 'submittedAt'>) => {
    const updatedEntries = masterEntries.map(e => e.id === entryToUpdate.id ? { ...e, ...entryToUpdate } : e);
    updateMasterInStorage(updatedEntries);
    toast({ title: "Entry Updated", description: `Changes for ${entryToUpdate.firstName} ${entryToUpdate.lastName} have been saved.` });
  };
  
  // This function is now effectively a no-op but is kept for compatibility.
  const syncAllOfflineEntries = () => {
    toast({title: "Already Synced", description: "All data is stored locally on this device."})
  }

  // The concept of separate offline entries is removed. `updateOfflineEntry` now maps to `updateMasterEntry`.
  const updateOfflineEntry = updateMasterEntry;

  return { offlineEntries, masterEntries, saveEntry, deleteMasterEntry, isSyncing, syncAllOfflineEntries, isOnline, updateMasterEntry, updateOfflineEntry };
};
