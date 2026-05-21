"use client"

import { useState, useEffect, useCallback } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, setDoc, limit, orderBy } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { getQueryStartDateISO } from '@/lib/utils';

const OFFLINE_ENTRIES_KEY = 'sfe-offline-coverage-entries-v3';
const MASTER_ENTRIES_STORAGE_KEY = 'sfe-master-entries-v4';

const generateUniqueId = () => {
    return `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const useOfflineSync = (userId?: string, active: boolean = true, fullHistory: boolean = false) => {
  const { toast } = useToast();
  const [offlineEntries, setOfflineEntries] = useState<CoverageEntry[]>([]);
  const [masterEntries, setMasterEntries] = useState<CoverageEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(false);
  const [hasFullHistory, setHasFullHistory] = useState(false);

  const getOfflineKey = useCallback(() => `${OFFLINE_ENTRIES_KEY}_${userId}`, [userId]);
  const getMasterKey = useCallback(() => `${MASTER_ENTRIES_STORAGE_KEY}_${userId}`, [userId]);

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

    // If we are currently in a view that only needs current month data (planning/coverage)
    // but we have already loaded the full history in this session, we don't need to fetch again.
    if (!fullHistory && hasFullHistory) return;

    setLoading(true);
    try {
      let q;
      if (fullHistory) {
        // Full history fetch (for Submitted List and Summary Analytics)
        q = query(
          collection(db!, "coverageEntries"), 
          where("userId", "==", userId),
          limit(10000)
        );
      } else {
        // Lightweight fetch (Current Month only) to support "Covered" checkmarks on startup
        const startDate = getQueryStartDateISO();
        q = query(
          collection(db!, "coverageEntries"), 
          where("userId", "==", userId),
          where("coverageDate", ">=", startDate),
          limit(1000)
        );
      }
      
      const querySnapshot = await getDocs(q);
      const fetchedEntries: CoverageEntry[] = [];
      
      querySnapshot.forEach(docSnap => {
        fetchedEntries.push({ id: docSnap.id, ...docSnap.data() as CoverageEntry });
      });
      
      fetchedEntries.sort((a, b) => (b.coverageDate || b.submittedAt || '').localeCompare(a.coverageDate || a.submittedAt || ''));
      setMasterEntries(fetchedEntries);
      
      if (fullHistory) {
          setHasFullHistory(true);
      }
      
      // Update local storage for offline access
      try {
          // Limit to 1000 items and strip heavy base64 strings to stay within quota
          const minimalEntries = fetchedEntries.slice(0, 1000).map(entry => {
              const { photos, signature, jointCallSignature, dsmSignature, ...rest } = entry;
              return rest;
          });
          localStorage.setItem(getMasterKey(), JSON.stringify(minimalEntries));
      } catch (storageError) {
          console.warn("Local storage cache limited due to size.");
      }
    } catch (serverError: any) {
        console.error("Fetch coverage entries failed:", serverError);
        
        const permissionError = new FirestorePermissionError({
          path: 'coverageEntries',
          operation: 'list',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    } finally {
        setLoading(false);
    }
  }, [userId, isOnline, active, getMasterKey, fullHistory, hasFullHistory]);
  
  useEffect(() => {
    if (userId) {
        try {
            const localOffline = localStorage.getItem(getOfflineKey());
            if (localOffline) setOfflineEntries(JSON.parse(localOffline));
            
            const localMaster = localStorage.getItem(getMasterKey());
            if (localMaster) setMasterEntries(JSON.parse(localMaster));
        } catch (error) {}
        
        if (active) {
            fetchMasterEntries();
        }
    } else {
      setOfflineEntries([]);
      setMasterEntries([]);
      setLoading(false);
    }
  }, [userId, getOfflineKey, getMasterKey, fetchMasterEntries, active]);

  const updateOfflineInStorage = (updatedEntries: CoverageEntry[]) => {
      setOfflineEntries(updatedEntries);
      try {
          localStorage.setItem(getOfflineKey(), JSON.stringify(updatedEntries));
      } catch (e) {
          console.error("Failed to save offline entry to storage:", e);
      }
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
            setMasterEntries(prev => {
                const next = [newEntryPayload as CoverageEntry, ...prev];
                const sorted = next.sort((a, b) => (b.coverageDate || b.submittedAt || '').localeCompare(a.coverageDate || a.submittedAt || ''));
                try {
                    const minimalNext = sorted.slice(0, 1000).map(e => {
                        const { photos, signature, jointCallSignature, dsmSignature, ...rest } = e;
                        return rest;
                    });
                    localStorage.setItem(getMasterKey(), JSON.stringify(minimalNext));
                } catch (e) {}
                return sorted;
            });
            toast({ title: "Entry Saved", description: "Report saved to server." });
          })
          .catch(async (serverError) => {
            console.error("Save entry failed:", serverError);
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
    const updatedEntries = [entryWithId, ...offlineEntries];
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
        console.error("Sync failed:", serverError);
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
        setMasterEntries(prev => {
            const filtered = prev.filter(e => e.id !== id);
            try {
                const minimalFiltered = filtered.slice(0, 1000).map(e => {
                    const { photos, signature, jointCallSignature, dsmSignature, ...rest } = e;
                    return rest;
                });
                localStorage.setItem(getMasterKey(), JSON.stringify(minimalFiltered));
            } catch (e) {}
            return filtered;
        });
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
        setMasterEntries(prev => {
            const updated = prev.map(item => item.id === e.id ? {...item, ...e} : item);
            try {
                const minimalUpdated = updated.slice(0, 1000).map(item => {
                    const { photos, signature, jointCallSignature, dsmSignature, ...rest } = item;
                    return rest;
                });
                localStorage.setItem(getMasterKey(), JSON.stringify(minimalUpdated));
            } catch (err) {}
            return updated;
        });
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