"use client"

import { useState, useEffect, useCallback } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, setDoc } from 'firebase/firestore';
import { getQueryStartDateISO } from '@/lib/utils';

const OFFLINE_ENTRIES_KEY = 'sfe-offline-coverage-entries-v3';

const generateUniqueId = () => {
    return `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const useOfflineSync = (userId?: string) => {
  const { toast } = useToast();
  const [offlineEntries, setOfflineEntries] = useState<CoverageEntry[]>([]);
  const [masterEntries, setMasterEntries] = useState<CoverageEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(true);

  const getOfflineKey = useCallback(() => `${OFFLINE_ENTRIES_KEY}_${userId}`, [userId]);

  useEffect(() => {
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
    if (!userId || !isOnline || !db) {
      setLoading(false);
      return;
    }
    try {
      const startDate = getQueryStartDateISO();
      
      const q = query(
        collection(db, "coverageEntries"), 
        where("userId", "==", userId),
        where("submittedAt", ">=", startDate)
      );
      
      const querySnapshot = await getDocs(q);
      const entries: CoverageEntry[] = [];
      querySnapshot.forEach(doc => {
        entries.push({ id: doc.id, ...doc.data() } as CoverageEntry);
      });
      
      entries.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
      
      setMasterEntries(entries);
    } catch (error) {
      console.error("Error fetching master entries:", error);
    } finally {
        setLoading(false);
    }
  }, [userId, isOnline]);
  
  useEffect(() => {
    if (userId) {
        try {
            const localData = localStorage.getItem(getOfflineKey());
            if (localData) setOfflineEntries(JSON.parse(localData));
        } catch (error) {}
        
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
    if (!userId || !db) return false;
    
    const entryId = generateUniqueId();
    const newEntryPayload = {
      ...entry,
      id: entryId,
      userId: userId,
      submittedAt: new Date().toISOString(),
    };

    if (isOnline) {
        try {
            await setDoc(doc(db, "coverageEntries", entryId), newEntryPayload);
            setMasterEntries(prev => [newEntryPayload as CoverageEntry, ...prev]);
            toast({ title: "Entry Saved", description: "Report saved to server." });
            return true;
        } catch (error) {
            console.error("Error saving online", error);
            saveEntryOffline(newEntryPayload);
            return false;
        }
    } else {
        saveEntryOffline(newEntryPayload);
        return false;
    }
  };

  const saveEntryOffline = (newEntry: Omit<CoverageEntry, 'id'>) => {
    const entryWithId = { ...newEntry, id: generateUniqueId() };
    const updatedEntries = [...offlineEntries, entryWithId];
    updateOfflineInStorage(updatedEntries);
    toast({ title: "Saved Locally", description: "Offline mode active." });
  }

  const syncAllOfflineEntries = useCallback(async () => {
    if (!isOnline || !userId || !db || offlineEntries.length === 0) return;
    
    if (isSyncing) return;
    setIsSyncing(true);

    const entriesToSync = [...offlineEntries];
    const batch = writeBatch(db);

    for (const entry of entriesToSync) {
        const { id, isOffline, ...dataToSync } = entry;
        const docRef = doc(collection(db, "coverageEntries")); 
        batch.set(docRef, { ...dataToSync, submittedAt: new Date().toISOString() });
    }

    try {
        await batch.commit();
        updateOfflineInStorage([]);
        await fetchMasterEntries();
        toast({ title: 'Sync Complete', description: `${entriesToSync.length} entries synced.` });
    } catch (error) {
        console.error("Sync failed", error);
    } finally {
        setIsSyncing(false);
    }
  }, [isOnline, userId, offlineEntries, toast, fetchMasterEntries, isSyncing]);

  useEffect(() => {
    if (isOnline && offlineEntries.length > 0) {
        syncAllOfflineEntries();
    }
  }, [isOnline, offlineEntries.length, syncAllOfflineEntries]);

  return { 
    offlineEntries, 
    masterEntries, 
    saveEntry, 
    deleteMasterEntry: async (id: string) => {
        if (!db) return;
        try {
            await deleteDoc(doc(db, "coverageEntries", id));
            setMasterEntries(prev => prev.filter(e => e.id !== id));
        } catch (error) {
            console.error("Delete from server failed", error);
        }
    }, 
    isSyncing, 
    syncAllOfflineEntries, 
    isOnline, 
    updateMasterEntry: async (e: any) => {
        if (!db) return;
        try {
            await updateDoc(doc(db, "coverageEntries", e.id), e);
            setMasterEntries(prev => prev.map(item => item.id === e.id ? {...item, ...e} : item));
        } catch (error) {
            console.error("Update server entry failed", error);
        }
    }, 
    updateOfflineEntry: (e: any) => {
        const updated = offlineEntries.map(item => item.id === e.id ? e : item);
        updateOfflineInStorage(updated);
    },
    loading 
  };
};