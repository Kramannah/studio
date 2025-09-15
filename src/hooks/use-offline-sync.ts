
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from './use-auth';

const OFFLINE_ENTRIES_KEY = 'sfe-offline-coverage-entries-v2';

export const useOfflineSync = (updateSampleUsage?: (productName: string, quantity: number) => void) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [offlineEntries, setOfflineEntries] = useState<CoverageEntry[]>([]);
  const [masterEntries, setMasterEntries] = useState<CoverageEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true); // Default to true, will be corrected by useEffect on client
  const [loading, setLoading] = useState(true);


  const getOfflineKey = useCallback(() => `${OFFLINE_ENTRIES_KEY}_${user?.uid}`, [user]);

  useEffect(() => {
    // This code now runs only on the client
    setIsOnline(navigator.onLine);
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchMasterEntries = useCallback(async () => {
    if (!user || !isOnline) {
      if(user) setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = query(collection(db, "coverageEntries"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const entries: CoverageEntry[] = [];
      querySnapshot.forEach(doc => {
        entries.push({ id: doc.id, ...doc.data() } as CoverageEntry);
      });
      setMasterEntries(entries.sort((a,b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()));
    } catch (error) {
      console.error("Error fetching master entries:", error);
      toast({ variant: "destructive", title: "Sync Error", description: "Could not fetch submitted entries from the server." });
    } finally {
        setLoading(false);
    }
  }, [user, isOnline, toast]);
  
  useEffect(() => {
    if (user) {
        setLoading(true);
        // Load offline entries from local storage
        try {
            const localData = localStorage.getItem(getOfflineKey());
            if (localData) {
                setOfflineEntries(JSON.parse(localData));
            }
        } catch (error) {
            console.error("Failed to parse offline entries from local storage:", error);
        }
        // Fetch master entries from Firestore
        fetchMasterEntries();
    } else {
      setOfflineEntries([]);
      setMasterEntries([]);
      setLoading(false);
    }
  }, [user, getOfflineKey, fetchMasterEntries]);


  const updateOfflineInStorage = (updatedEntries: CoverageEntry[]) => {
      setOfflineEntries(updatedEntries);
      localStorage.setItem(getOfflineKey(), JSON.stringify(updatedEntries));
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

    updateOfflineInStorage([...offlineEntries, newEntry]);

    if (updateSampleUsage) {
        if (newEntry.primarySampleName && newEntry.primaryProductQty) {
            updateSampleUsage(newEntry.primarySampleName, newEntry.primaryProductQty);
        }
        if (newEntry.secondarySampleName && newEntry.secondaryProductQty) {
            updateSampleUsage(newEntry.secondarySampleName, newEntry.secondaryProductQty);
        }
    }
    
    toast({ title: "Entry Saved Locally", description: "Will sync with the server when online." });
  };

  const deleteMasterEntry = async (id: string) => {
    try {
        const entryToDelete = masterEntries.find(e => e.id === id);
        await deleteDoc(doc(db, "coverageEntries", id));
        setMasterEntries(prev => prev.filter(e => e.id !== id));
        if(entryToDelete) {
            toast({ variant: 'destructive', title: "Entry Deleted", description: `Coverage for ${entryToDelete.firstName} ${entryToDelete.lastName} has been removed.` });
        }
    } catch (error) {
        toast({ variant: 'destructive', title: "Delete Failed", description: "Could not delete entry from server." });
    }
  };

  const updateMasterEntry = async (entryToUpdate: Omit<CoverageEntry, 'submittedAt'>) => {
    try {
        const entryRef = doc(db, "coverageEntries", entryToUpdate.id);
        await updateDoc(entryRef, { ...entryToUpdate });
        setMasterEntries(prev => prev.map(e => e.id === entryToUpdate.id ? { ...e, ...entryToUpdate } : e));
        toast({ title: "Entry Updated", description: `Changes for ${entryToUpdate.firstName} ${entryToUpdate.lastName} have been saved.` });
    } catch (error) {
        toast({ variant: 'destructive', title: "Update Failed", description: "Could not update entry on server." });
    }
  };

  const updateOfflineEntry = (entryToUpdate: CoverageEntry) => {
    const updatedEntries = offlineEntries.map(e => e.id === entryToUpdate.id ? entryToUpdate : e);
    updateOfflineInStorage(updatedEntries);
    toast({ title: "Offline Entry Updated", description: `Changes for ${entryToUpdate.firstName} ${entryToUpdate.lastName} have been saved locally.` });
  };

  const syncAllOfflineEntries = useCallback(async () => {
    if (!isOnline || !user || offlineEntries.length === 0) {
      if(offlineEntries.length === 0) toast({title: "No Entries to Sync"});
      if(!isOnline) toast({title: "Cannot Sync", description: "You are currently offline."});
      return;
    }

    setIsSyncing(true);
    let successCount = 0;
    const remainingEntries = [...offlineEntries];

    for (const entry of offlineEntries) {
      try {
        const { id, ...dataToSync } = entry; // Don't sync the temporary UUID
        await addDoc(collection(db, 'coverageEntries'), dataToSync);
        remainingEntries.shift();
        successCount++;
      } catch (error) {
        console.error('Failed to sync entry:', error);
        toast({ variant: 'destructive', title: 'Sync Error', description: `Failed to sync report for ${entry.firstName} ${entry.lastName}.` });
        break; // Stop on first error to prevent data loss or ordering issues
      }
    }

    updateOfflineInStorage(remainingEntries);
    if(successCount > 0){
        toast({ title: 'Sync Complete', description: `${successCount} entries synced successfully.` });
        fetchMasterEntries();
    }
    setIsSyncing(false);
  }, [isOnline, user, offlineEntries, toast, fetchMasterEntries, getOfflineKey]);

  return { offlineEntries, masterEntries, saveEntry, deleteMasterEntry, isSyncing, syncAllOfflineEntries, isOnline, updateMasterEntry, updateOfflineEntry, loading };
};
