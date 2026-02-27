
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, limit, setDoc } from 'firebase/firestore';
import { isSameDay, parseISO } from 'date-fns';

const OFFLINE_ENTRIES_KEY = 'sfe-offline-coverage-entries-v2';

// Simple and compatible unique ID generator
const generateUniqueId = () => {
    return `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const useOfflineSync = (userId?: string) => {
  const { toast } = useToast();
  const [offlineEntries, setOfflineEntries] = useState<CoverageEntry[]>([]);
  const [masterEntries, setMasterEntries] = useState<CoverageEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true); // Default to true, will be corrected by useEffect on client
  const [loading, setLoading] = useState(true);


  const getOfflineKey = useCallback(() => `${OFFLINE_ENTRIES_KEY}_${userId}`, [userId]);

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
    if (!userId || !isOnline) {
      setLoading(false);
      return;
    }
    try {
      // Fetch all user entries to ensure summaries (Call Concentration, Reach, etc.) are accurate.
      // Removed limit(100) to ensure "syncing" to summary is complete.
      const q = query(
        collection(db, "coverageEntries"), 
        where("userId", "==", userId)
      );
      const querySnapshot = await getDocs(q);
      const entries: CoverageEntry[] = [];
      querySnapshot.forEach(doc => {
        entries.push({ id: doc.id, ...doc.data() } as CoverageEntry);
      });
      
      // Sort in memory to avoid index requirements and ensure latest entries are shown first.
      entries.sort((a, b) => {
          const dateA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
          const dateB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
          return dateB - dateA;
      });

      setMasterEntries(entries);
    } catch (error) {
      console.error("Error fetching master entries:", error);
      toast({ variant: "destructive", title: "Sync Error", description: "Could not fetch submitted entries from the server." });
    } finally {
        setLoading(false);
    }
  }, [userId, isOnline, toast]);
  
  useEffect(() => {
    if (userId) {
        // Load offline entries from local storage immediately
        try {
            const localData = localStorage.getItem(getOfflineKey());
            if (localData) {
                setOfflineEntries(JSON.parse(localData));
            }
        } catch (error) {
            console.error("Failed to parse offline entries from local storage:", error);
        }
        
        // Then fetch master entries from Firestore
        setLoading(true);
        fetchMasterEntries();
    } else {
      setOfflineEntries([]);
      setMasterEntries([]);
      setLoading(false);
    }
  }, [userId, getOfflineKey, fetchMasterEntries]);


  const updateOfflineInStorage = (updatedEntries: CoverageEntry[]) => {
      setOfflineEntries(updatedEntries);
      localStorage.setItem(getOfflineKey(), JSON.stringify(updatedEntries));
  }

  const saveEntry = async (entry: Omit<CoverageEntry, 'id' | 'submittedAt' | 'userId'>): Promise<boolean> => {
    if (!userId) {
        toast({ variant: 'destructive', title: 'Not logged in', description: 'You must be logged in to save entries.'});
        return false;
    }
    
    const entryId = generateUniqueId();
    const newEntryPayload = {
      ...entry,
      id: entryId,
      userId: userId,
      submittedAt: new Date().toISOString(),
    };

    if (isOnline) {
        try {
            const entryRef = doc(db, "coverageEntries", entryId);
            // Non-blocking write for instant speed
            setDoc(entryRef, newEntryPayload).catch(err => console.error("Sync error:", err));
            
            setMasterEntries(prev => [newEntryPayload as CoverageEntry, ...prev]);
            toast({ title: "Entry Saved", description: "Your coverage report has been saved to the server." });
            return true;
        } catch(error) {
            console.error("Error saving entry online, saving locally instead:", error);
            saveEntryOffline(newEntryPayload);
            return false;
        }
    } else {
        saveEntryOffline(newEntryPayload);
        return false;
    }
  };

  const saveEntryOffline = (newEntry: Omit<CoverageEntry, 'id'>) => {
    const entryWithId = {
        ...newEntry,
        id: generateUniqueId(),
    }
    const currentOfflineEntries = offlineEntries;
    const updatedEntries = [...currentOfflineEntries, entryWithId];
    updateOfflineInStorage(updatedEntries);
    toast({ title: "Entry Saved Locally", description: "You are offline. Report will sync when you're back online." });
  }

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

  const deleteMasterEntriesBulk = useCallback(async (ids: string[]) => {
    if (!userId) {
      toast({ variant: 'destructive', title: 'Not logged in', description: 'You must be logged in to delete entries.'});
      return;
    }
    if (ids.length === 0) return;

    try {
        const batch = writeBatch(db);
        ids.forEach(id => {
            const docRef = doc(db, "coverageEntries", id);
            batch.delete(docRef);
        });

        await batch.commit();

        setMasterEntries(prev => prev.filter(e => !ids.includes(e.id)));

        toast({
            variant: "destructive",
            title: "Entries Deleted",
            description: `${ids.length} coverage report(s) have been removed.`,
        });
    } catch (error) {
        console.error("Error bulk deleting entries:", error);
        toast({
            variant: "destructive",
            title: "Bulk Delete Failed",
            description: "Could not remove the selected entries.",
        });
    }
  }, [userId, toast]);

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
    if (!isOnline || !userId || offlineEntries.length === 0) {
      if (offlineEntries.length > 0 && !isOnline && !isSyncing) {
        toast({ title: "Cannot Sync", description: "You are currently offline." });
      }
      return;
    }
    if (isSyncing) return;

    setIsSyncing(true);
    toast({ title: 'Syncing...', description: `Uploading ${offlineEntries.length} offline report(s).`});

    const entriesToSync = [...offlineEntries];
    const chunks: CoverageEntry[][] = [];
    
    for (let i = 0; i < entriesToSync.length; i += 500) {
        chunks.push(entriesToSync.slice(i, i + 500));
    }

    let allSyncedIds: string[] = [];
    let hasErrors = false;

    await Promise.all(chunks.map(async (chunk) => {
        try {
            const batch = writeBatch(db);
            const chunkIds: string[] = [];
            
            for (const entry of chunk) {
                const { id, isOffline, ...dataToSync } = entry;
                const docRef = doc(collection(db, "coverageEntries")); 
                batch.set(docRef, dataToSync);
                chunkIds.push(id);
            }

            await batch.commit();
            allSyncedIds = [...allSyncedIds, ...chunkIds];
        } catch (error) {
            console.error("A batch commit failed during sync:", error);
            hasErrors = true;
        }
    }));

    if (allSyncedIds.length > 0) {
        const remainingOfflineEntries = offlineEntries.filter(entry => !allSyncedIds.includes(entry.id));
        updateOfflineInStorage(remainingOfflineEntries);
        await fetchMasterEntries();
    }
    
    if (hasErrors) {
        toast({
            variant: 'destructive',
            title: 'Partial Sync Failed',
            description: `Could not sync all entries. The remaining entries will be synced later.`,
        });
    } else if (allSyncedIds.length > 0) {
        toast({
            title: 'Sync Complete',
            description: `${allSyncedIds.length} entries synced successfully.`,
        });
    }

    setIsSyncing(false);
  }, [isOnline, userId, offlineEntries, toast, fetchMasterEntries, isSyncing, getOfflineKey]);

  useEffect(() => {
    if (isOnline && offlineEntries.length > 0 && !isSyncing) {
        syncAllOfflineEntries();
    }
  }, [isOnline, offlineEntries.length, syncAllOfflineEntries, isSyncing]);

  return { offlineEntries, masterEntries, saveEntry, deleteMasterEntry, deleteMasterEntriesBulk, isSyncing, syncAllOfflineEntries, isOnline, updateMasterEntry, updateOfflineEntry, loading };
};
