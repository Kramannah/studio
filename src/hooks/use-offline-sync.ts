
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, writeBatch, deleteDoc, doc, updateDoc, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
import { useAuth } from './use-auth';

const OFFLINE_KEY_PREFIX = 'sfe-offline-coverage-offline';

export const useOfflineSync = (updateSampleUsage?: (productName: string, quantity: number) => void, userId?: string) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [offlineEntries, setOfflineEntries] = useState<CoverageEntry[]>([]);
  const [masterEntries, setMasterEntries] = useState<CoverageEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const getOfflineKey = useCallback(() => `${OFFLINE_KEY_PREFIX}_${user?.uid}`, [user]);

  const fetchMasterEntries = useCallback(async () => {
    if (!db || !user) {
      setMasterEntries([]);
      return;
    };
    try {
        const q = query(collection(db, 'coverageEntries'), where("userId", "==", user.uid), orderBy('submittedAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const entries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoverageEntry));
        setMasterEntries(entries);
    } catch (error) {
        console.error("Error fetching master entries:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Could not fetch submitted entries from Firestore."
        });
    }
  }, [toast, user]);

  useEffect(() => {
    const handleOnlineStatusChange = () => {
      setIsOnline(navigator.onLine);
    };

    window.addEventListener('online', handleOnlineStatusChange);
    window.addEventListener('offline', handleOnlineStatusChange);

    return () => {
      window.removeEventListener('online', handleOnlineStatusChange);
      window.removeEventListener('offline', handleOnlineStatusChange);
    };
  }, []);


  useEffect(() => {
    if (user) {
        const offlineData = localStorage.getItem(getOfflineKey());
        if (offlineData) {
            try {
              setOfflineEntries(JSON.parse(offlineData));
            } catch (error) {
              console.error("Failed to parse offline data:", error);
            }
        } else {
            setOfflineEntries([]);
        }
        fetchMasterEntries();
    } else {
        // Clear data if no user
        setOfflineEntries([]);
        setMasterEntries([]);
    }
  }, [user, fetchMasterEntries, getOfflineKey]);

  const syncAllOfflineEntries = useCallback(async () => {
    if (!isOnline) {
        toast({ variant: 'destructive', title: 'You are offline', description: 'Please connect to the internet to sync.' });
        return;
    }
    if (!db) {
        toast({ variant: 'destructive', title: 'Database not connected', description: 'Cannot sync at this moment.' });
        return;
    }

    const entriesToSync = JSON.parse(localStorage.getItem(getOfflineKey()) || '[]');
    if (entriesToSync.length === 0) {
        return;
    }

    if (isSyncing) {
      toast({ title: 'Sync in progress.', description: 'Please wait.' });
      return;
    }

    setIsSyncing(true);
    toast({ title: 'Syncing started...', description: `${entriesToSync.length} entries to sync.` });
    
    try {
        const batch = writeBatch(db);
        entriesToSync.forEach((entry: CoverageEntry) => {
            // Firestore will auto-generate an ID, so we don't pass our local one
            const { id, isOffline, ...entryData } = entry;
            const docRef = doc(collection(db, 'coverageEntries'));
            batch.set(docRef, entryData);
        });
        await batch.commit();

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
        localStorage.setItem(getOfflineKey(), JSON.stringify([]));

        toast({ title: 'Sync successful!', description: `${entriesToSync.length} entries have been synced.` });
        await fetchMasterEntries(); // Refresh master list
    } catch(error) {
        console.error("Error during sync:", error);
        toast({ variant: 'destructive', title: 'Sync Failed', description: 'There was an error syncing your data.' });
    } finally {
        setIsSyncing(false);
    }
    
  }, [isSyncing, toast, updateSampleUsage, fetchMasterEntries, getOfflineKey, isOnline]);

  useEffect(() => {
    if (isOnline) {
      const offlineData = localStorage.getItem(getOfflineKey());
      if (offlineData && JSON.parse(offlineData).length > 0) {
        syncAllOfflineEntries();
      }
    }
  }, [isOnline, getOfflineKey, syncAllOfflineEntries]);


  const saveEntry = async (entry: Omit<CoverageEntry, 'id' | 'submittedAt' | 'userId'>) => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Not logged in', description: 'You must be logged in to save entries.'});
        return;
    }

    const newEntry: Omit<CoverageEntry, 'id'> & { submittedAt: any } = {
      ...entry,
      userId: user.uid,
      submittedAt: serverTimestamp(),
    };
    
    if (isOnline && db) {
        setIsSyncing(true);
        toast({ title: "Submitting...", description: "Saving your entry directly." });
        
        try {
            const { submittedAt, ...rest } = newEntry;
            const dataToSave = { ...rest, submittedAt: new Date().toISOString() };
            await addDoc(collection(db, "coverageEntries"), dataToSave);
            
            if (updateSampleUsage) {
                if (newEntry.primarySampleName && newEntry.primaryProductQty) {
                    updateSampleUsage(newEntry.primarySampleName, newEntry.primaryProductQty);
                }
                if (newEntry.secondarySampleName && newEntry.secondaryProductQty) {
                    updateSampleUsage(newEntry.secondarySampleName, newEntry.secondaryProductQty);
                }
            }
            toast({ title: "Entry Submitted", description: "Your coverage has been saved." });
            await fetchMasterEntries();
        } catch (error) {
            console.error("Error saving entry to Firestore:", error);
            toast({ variant: 'destructive', title: 'Save Failed', description: 'Could not save entry online, saving locally.' });
            saveEntryOffline(entry);
        } finally {
            setIsSyncing(false);
        }

    } else {
        saveEntryOffline(entry);
    }
  };

  const saveEntryOffline = (entry: Omit<CoverageEntry, 'id' | 'submittedAt' | 'userId'>) => {
    if(!user) return;
    const newEntry: CoverageEntry = {
        ...entry,
        id: crypto.randomUUID(),
        userId: user.uid,
        submittedAt: new Date().toISOString(),
      };
    const newOfflineEntries = [...offlineEntries, newEntry];
    setOfflineEntries(newOfflineEntries);
    localStorage.setItem(getOfflineKey(), JSON.stringify(newOfflineEntries));
    toast({ title: "Entry saved locally", description: "It will be synced when you're online." });
  }

  const deleteMasterEntry = useCallback(async (id: string) => {
    if (!db) return;
    const entryToDelete = masterEntries.find(e => e.id === id);
    try {
        await deleteDoc(doc(db, "coverageEntries", id));
        if (entryToDelete) {
            toast({ variant: 'destructive', title: "Entry Deleted", description: `Coverage for ${entryToDelete.firstName} ${entryToDelete.lastName} has been removed.` });
        }
        await fetchMasterEntries();
    } catch (error) {
        console.error("Error deleting document:", error);
        toast({ variant: 'destructive', title: 'Delete Failed', description: 'Could not delete entry.' });
    }
  }, [masterEntries, toast, fetchMasterEntries]);

  const updateMasterEntry = useCallback(async (entryToUpdate: Omit<CoverageEntry, 'submittedAt'>) => {
    if (!db || !entryToUpdate.id) return;
    const { id, isOffline, ...dataToUpdate} = entryToUpdate;

    try {
        const docRef = doc(db, "coverageEntries", id);
        await updateDoc(docRef, dataToUpdate);
        toast({ title: "Entry Updated", description: `Coverage for ${entryToUpdate.firstName} ${entryToUpdate.lastName} has been updated.` });
        await fetchMasterEntries();
    } catch (error) {
        console.error("Error updating document:", error);
        toast({ variant: 'destructive', title: 'Update Failed', description: 'Could not update entry.' });
    }
  }, [toast, fetchMasterEntries]);

  const updateOfflineEntry = useCallback((entryToUpdate: Omit<CoverageEntry, 'submittedAt'>) => {
    const updatedEntries = offlineEntries.map(e => e.id === entryToUpdate.id ? { ...e, ...entryToUpdate } : e);
    setOfflineEntries(updatedEntries);
    localStorage.setItem(getOfflineKey(), JSON.stringify(updatedEntries));
    toast({ title: "Offline Entry Updated", description: `Changes for ${entryToUpdate.firstName} ${entryToUpdate.lastName} have been saved locally.` });
  }, [offlineEntries, toast, getOfflineKey]);


  return { offlineEntries, masterEntries, saveEntry, deleteMasterEntry, isSyncing, syncAllOfflineEntries, isOnline, updateMasterEntry, updateOfflineEntry };
};
