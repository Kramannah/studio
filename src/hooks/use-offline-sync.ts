"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, setDoc, limit } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { format, parseISO, isValid } from 'date-fns';
import { getMonthRangeISO } from '@/lib/utils';

const OFFLINE_ENTRIES_KEY = 'sfe-offline-coverage-entries-v3';
const MASTER_ENTRIES_STORAGE_KEY = 'sfe-master-entries-v4';

const generateUniqueId = () => {
    return `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Data Sanitization Utility
 * Strip undefined values to prevent Firestore crashes.
 */
const sanitizePayload = (data: any): any => {
  const cleaned: any = {};
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

// [QUERY_ON_DEMAND_LOGIC] - Month filtering is now applied client-side to prevent Index Errors
export const useOfflineSync = (userId?: string, active: boolean = true, selectedMonth?: string) => {
  const { toast } = useToast();
  const [offlineEntries, setOfflineEntries] = useState<CoverageEntry[]>([]);
  const [masterEntries, setMasterEntries] = useState<CoverageEntry[]>([]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(false);
  
  const lastFetchedMonthRef = useRef<string | null>(null);

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
        lastFetchedMonthRef.current = null;
    }
  }, [userId, getOfflineKey, getMasterKey]);

  // [QUERY_ON_DEMAND_LOGIC] - Query uses only userId to avoid Index Error; Filtering happens in JS
  const fetchMasterEntries = useCallback(async (force = false) => {
    if (!userId || !isOnline || !db || !active) {
      if (!active) setLoading(false);
      return;
    }
    
    const targetMonth = selectedMonth || format(new Date(), 'yyyy-MM');

    if (!force && lastFetchedMonthRef.current === targetMonth && masterEntries.length > 0) {
        return;
    }

    setLoading(true);
    try {
      const q = query(
        collection(db!, "coverageEntries"), 
        where("userId", "==", userId),
        limit(500) // [RECENT_WINDOW_OPTIMIZATION] - Fetch only the 500 most recent records for speed
      );
      
      const querySnapshot = await getDocs(q);
      const allFetched: CoverageEntry[] = [];
      
      querySnapshot.forEach(docSnap => {
        allFetched.push({ id: docSnap.id, ...docSnap.data() as CoverageEntry });
      });
      
      // Perform month filtering client-side to prevent Index Error
      const filtered = allFetched.filter(e => {
          const dateStr = (e.coverageDate || e.submittedAt || "").toString();
          if (!dateStr) return false;
          const d = parseISO(dateStr);
          return d && format(d, 'yyyy-MM') === targetMonth;
      });

      filtered.sort((a, b) => (b.coverageDate || b.submittedAt || '').localeCompare(a.coverageDate || a.submittedAt || ''));
      
      setMasterEntries(filtered);
      lastFetchedMonthRef.current = targetMonth;
      
      try {
          const minimalEntries = filtered.slice(0, 100).map(entry => {
              const { photos, signature, jointCallSignature, dsmSignature, ...rest } = entry;
              return rest;
          });
          localStorage.setItem(getMasterKey(), JSON.stringify(minimalEntries));
      } catch (storageError) {
          console.warn("Local storage cache limited.");
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
  }, [userId, isOnline, active, selectedMonth, getMasterKey, masterEntries.length]);
  
  useEffect(() => {
    if (userId && active) {
        fetchMasterEntries();
    }
  }, [userId, active, fetchMasterEntries, selectedMonth]);

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
                return next.sort((a, b) => (b.coverageDate || b.submittedAt || '').localeCompare(a.coverageDate || a.submittedAt || ''));
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
        lastFetchedMonthRef.current = null;
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
    const sanitizedPayload = sanitizePayload(e);
    const docRef = doc(db!, "coverageEntries", e.id);
    updateDoc(docRef, { ...sanitizedPayload, userId: userId })
      .then(() => {
        setMasterEntries(prev => prev.map(item => item.id === e.id ? {...item, ...sanitizedPayload} : item));
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