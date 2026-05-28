"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, setDoc, limit } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { format, parseISO, isValid } from 'date-fns';

const OFFLINE_ENTRIES_KEY = 'sfe-offline-coverage-entries-v3';
const MASTER_ENTRIES_STORAGE_KEY = 'sfe-master-entries-v4';

const generateUniqueId = () => {
    return `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * [PERSISTENCE_OPTIMIZATION]
 * Removes heavy base64 strings (photos/signatures) before saving to localStorage.
 * This prevents the 5MB browser quota from being exceeded.
 */
const sanitizeForStorage = (entry: any): any => {
    if (!entry) return entry;
    const { photos, signature, jointCallSignature, dsmSignature, ...rest } = entry;
    return rest;
};

const sanitizePayload = (data: any): any => {
  const cleaned: any = {};
  if (!data) return cleaned;
  Object.keys(data).forEach(key => {
    const val = data[key];
    if (val === undefined) return;
    if (Array.isArray(val) && key === 'reminderProducts') {
      cleaned[key] = val.map(p => sanitizePayload(p)).filter(p => Object.keys(p).length > 0);
      return;
    }
    cleaned[key] = val;
  });
  return cleaned;
};

export const useOfflineSync = (userId?: string, active: boolean = true, selectedMonth?: string) => {
  const { toast } = useToast();
  const [offlineEntries, setOfflineEntries] = useState<CoverageEntry[]>([]);
  const [masterEntries, setMasterEntries] = useState<CoverageEntry[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(false);
  
  const lastFetchedUserIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (userId) {
        try {
            const localOffline = localStorage.getItem(getOfflineKey());
            if (localOffline) setOfflineEntries(JSON.parse(localOffline));
            
            const localMaster = localStorage.getItem(getMasterKey());
            if (localMaster) setMasterEntries(JSON.parse(localMaster));
        } catch (error) {
            console.warn("Could not load entries cache:", error);
        }
    } else {
        setOfflineEntries([]);
        setMasterEntries([]);
        setAvailableMonths([]);
        lastFetchedUserIdRef.current = null;
    }
  }, [userId, getOfflineKey, getMasterKey]);

  const fetchMasterEntries = useCallback(async (force = false) => {
    if (!userId || !isOnline || !db || !active) {
      if (!active) setLoading(false);
      return;
    }
    
    // [SILENT_REFRESH_LOGIC] - Only show loader if we have zero data in memory.
    if (masterEntries.length === 0 || force) {
        setLoading(true);
    }

    try {
      const q = query(
        collection(db!, "coverageEntries"), 
        where("userId", "==", userId),
        limit(2000) 
      );
      
      const querySnapshot = await getDocs(q);
      const allFetched: CoverageEntry[] = [];
      const foundMonths = new Set<string>();
      
      querySnapshot.forEach(docSnap => {
        const data = docSnap.data() as CoverageEntry;
        const entry = { id: docSnap.id, ...data };
        
        const dateStr = (data.coverageDate || data.submittedAt || "").toString();
        const d = parseISO(dateStr);
        const entryMonth = isValid(d) ? format(d, 'yyyy-MM') : null;

        if (entryMonth) foundMonths.add(entryMonth);
        allFetched.push(entry);
      });
      
      setAvailableMonths(Array.from(foundMonths).sort((a, b) => b.localeCompare(a)));
      allFetched.sort((a, b) => (b.coverageDate || b.submittedAt || '').localeCompare(a.coverageDate || a.submittedAt || ''));
      
      setMasterEntries(allFetched);
      lastFetchedUserIdRef.current = userId;
      
      try {
          // [PERSISTENCE_OPTIMIZATION] Cache without heavy photos
          const storageData = allFetched.map(e => sanitizeForStorage(e));
          localStorage.setItem(getMasterKey(), JSON.stringify(storageData));
      } catch (storageError) {
          console.warn("Local storage cache failed (Storage might be full).");
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
  }, [userId, isOnline, active, getMasterKey, masterEntries.length]);

  useEffect(() => {
    if (userId && active) {
        fetchMasterEntries();
    }
  }, [userId, active, fetchMasterEntries]);

  const updateOfflineInStorage = (updatedEntries: CoverageEntry[]) => {
      setOfflineEntries(updatedEntries);
      try {
          // [PERSISTENCE_OPTIMIZATION]
          const storageData = updatedEntries.map(e => sanitizeForStorage(e));
          localStorage.setItem(getOfflineKey(), JSON.stringify(storageData));
      } catch (e) {
          console.error("Failed to save offline entry to storage:", e);
      }
  }

  const saveEntry = async (entry: Omit<CoverageEntry, 'id' | 'submittedAt' | 'userId'>): Promise<boolean> => {
    if (!userId || !db) return false;
    
    const entryId = generateUniqueId();
    const rawPayload = {
      ...entry,
      id: entryId,
      userId: userId,
      submittedAt: new Date().toISOString(),
    };

    const sanitizedPayload = sanitizePayload(rawPayload);

    if (isOnline) {
        const docRef = doc(db!, "coverageEntries", entryId);
        setDoc(docRef, sanitizedPayload)
          .then(() => {
            setMasterEntries(prev => {
                const next = [sanitizedPayload as CoverageEntry, ...prev];
                const sorted = next.sort((a, b) => (b.coverageDate || b.submittedAt || '').localeCompare(a.coverageDate || a.submittedAt || ''));
                
                // [DATA_ACCURACY_FIX] Update localStorage immediately to prevent disappearing reports
                try {
                    const storageData = sorted.map(e => sanitizeForStorage(e));
                    localStorage.setItem(getMasterKey(), JSON.stringify(storageData));
                } catch(e) {}
                
                return sorted;
            });
            toast({ title: "Entry Saved", description: "Report saved to server." });
          })
          .catch(async (serverError) => {
            console.error("Save entry failed:", serverError);
            const permissionError = new FirestorePermissionError({
                path: docRef.path,
                operation: 'create',
                requestResourceData: sanitizedPayload,
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
            saveEntryOffline(sanitizedPayload);
          });
        return true;
    } else {
        saveEntryOffline(sanitizedPayload);
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
        const sanitizedData = sanitizePayload(dataToSync);
        const docRef = doc(collection(db!, "coverageEntries")); 
        batch.set(docRef, { ...sanitizedData, userId: userId, submittedAt: new Date().toISOString() });
    }

    batch.commit()
      .then(async () => {
        updateOfflineInStorage([]);
        lastFetchedUserIdRef.current = null;
        fetchMasterEntries(true);
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
  }, [isOnline, userId, offlineEntries, toast, isSyncing, fetchMasterEntries]);

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
            const next = prev.filter(e => e.id !== id);
            try {
                const storageData = next.map(e => sanitizeForStorage(e));
                localStorage.setItem(getMasterKey(), JSON.stringify(storageData));
            } catch(e) {}
            return next;
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
    const sanitizedPayload = sanitizePayload(e);
    const docRef = doc(db!, "coverageEntries", e.id);
    updateDoc(docRef, { ...sanitizedPayload, userId: userId })
      .then(() => {
        setMasterEntries(prev => {
            const next = prev.map(item => item.id === e.id ? {...item, ...sanitizedPayload} : item);
            try {
                const storageData = next.map(e => sanitizeForStorage(e));
                localStorage.setItem(getMasterKey(), JSON.stringify(storageData));
            } catch(e) {}
            return next;
        });
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'update',
          requestResourceData: sanitizedPayload,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  return { 
    offlineEntries, 
    masterEntries, 
    availableMonths,
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
    refetch: () => {
        fetchMasterEntries(true);
    }
  };
};
