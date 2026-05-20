"use client"

import { useState, useEffect, useCallback } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, setDoc, limit, orderBy } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const OFFLINE_ENTRIES_KEY = 'sfe-offline-coverage-entries-v3';

const generateUniqueId = () => {
    return `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const useOfflineSync = (userId?: string, active: boolean = true) => {
  const { toast } = useToast();
  const [offlineEntries, setOfflineEntries] = useState<CoverageEntry[]>([]);
  const [masterEntries, setMasterEntries] = useState<CoverageEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(false);

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
    if (!userId || !isOnline || !db || !active) {
      if (!active) setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Increased limit to 20,000 to ensure all calls for active users are retrieved
      const q = query(
        collection(db!, "coverageEntries"), 
        where("userId", "==", userId),
        limit(20000)
      );
      
      const querySnapshot = await getDocs(q);
      const allEntries: CoverageEntry[] = [];
      
      querySnapshot.forEach(doc => {
        allEntries.push({ id: doc.id, ...doc.data() as CoverageEntry });
      });
      
      allEntries.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
      setMasterEntries(allEntries);
    } catch (serverError: any) {
        const permissionError = new FirestorePermissionError({
          path: 'coverageEntries',
          operation: 'list',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    } finally {
        setLoading(false);
    }
  }, [userId, isOnline, active]);
  
  useEffect(() => {
    if (userId) {
        try {
            const localData = localStorage.getItem(getOfflineKey());
            if (localData) setOfflineEntries(JSON.parse(localData));
        } catch (error) {}
        
        if (active) {
            fetchMasterEntries();
        }
    } else {
      setOfflineEntries([]);
      setMasterEntries([]);
      setLoading(false);
    }
  }, [userId, getOfflineKey, fetchMasterEntries, active]);

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
        const docRef = doc(db!, "coverageEntries", entryId);
        setDoc(docRef, newEntryPayload)
          .then(() => {
            setMasterEntries(prev => [newEntryPayload as CoverageEntry, ...prev]);
            toast({ title: "Entry Saved", description: "Report saved to server." });
          })
          .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: docRef.path,
                operation: 'create',
                requestResourceData: newEntryPayload,
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
            saveEntryOffline(newEntryPayload);
          });
        return true;
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
    const batch = writeBatch(db!);

    for (const entry of entriesToSync) {
        const { id, isOffline, ...dataToSync } = entry;
        const docRef = doc(collection(db!, "coverageEntries")); 
        batch.set(docRef, { ...dataToSync, userId: userId, submittedAt: new Date().toISOString() });
    }

    batch.commit()
      .then(async () => {
        updateOfflineInStorage([]);
        await fetchMasterEntries();
        toast({ title: 'Sync Complete', description: `${entriesToSync.length} entries synced.` });
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: 'coverageEntries',
          operation: 'create',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      })
      .finally(() => {
        setIsSyncing(false);
      });
  }, [isOnline, userId, offlineEntries, toast, fetchMasterEntries, isSyncing]);

  useEffect(() => {
    if (isOnline && offlineEntries.length > 0) {
        syncAllOfflineEntries();
    }
  }, [isOnline, offlineEntries.length, syncAllOfflineEntries]);

  const deleteMasterEntry = async (id: string) => {
    if (!db) return;
    const docRef = doc(db!, "coverageEntries", id);
    deleteDoc(docRef)
      .then(() => {
        setMasterEntries(prev => prev.filter(e => e.id !== id));
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const updateMasterEntry = async (e: any) => {
    if (!db) return;
    const docRef = doc(db!, "coverageEntries", e.id);
    updateDoc(docRef, { ...e, userId: userId })
      .then(() => {
        setMasterEntries(prev => prev.map(item => item.id === e.id ? {...item, ...e} : item));
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'update',
          requestResourceData: e,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  return { 
    offlineEntries, 
    masterEntries, 
    saveEntry, 
    deleteMasterEntry, 
    isSyncing, 
    syncAllOfflineEntries, 
    isOnline, 
    updateMasterEntry, 
    updateOfflineEntry: (e: any) => {
        const updated = offlineEntries.map(item => item.id === e.id ? e : item);
        updateOfflineInStorage(updated);
    },
    loading,
    refetch: () => fetchMasterEntries()
  };
};
