
"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, setDoc, limit, orderBy } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { format, parseISO, isValid, isWithinInterval } from 'date-fns';
import { getMonthRangeISO } from '@/lib/utils';

const OFFLINE_ENTRIES_KEY = 'sfe-offline-coverage-entries-v3';
const MASTER_ENTRIES_STORAGE_KEY = 'sfe-master-entries-v4';

const generateUniqueId = () => {
    return `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

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
  
  const lastFetchedKeyRef = useRef<string | null>(null);

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
        lastFetchedKeyRef.current = null;
    }
  }, [userId, getOfflineKey, getMasterKey]);

  const fetchMasterEntries = useCallback(async (force = false) => {
    if (!userId || !db || !active || !navigator.onLine) return;
    
    const fetchKey = `${userId}_${selectedMonth}`;
    if (!force && lastFetchedKeyRef.current === fetchKey && masterEntries.length > 0) return;

    setLoading(true);

    try {
      const { start, end } = getMonthRangeISO(selectedMonth);
      
      const q = query(
        collection(db!, "coverageEntries"), 
        where("userId", "==", userId),
        where("coverageDate", ">=", start),
        where("coverageDate", "<=", end),
        limit(1000)
      );
      
      const querySnapshot = await getDocs(q);

      const fetched: CoverageEntry[] = [];
      querySnapshot.forEach(docSnap => {
        const data = docSnap.data() as CoverageEntry;
        const d = parseISO(data.coverageDate || data.submittedAt);
        if (isValid(d) && isWithinInterval(d, { start: parseISO(start), end: parseISO(end) })) {
            fetched.push({ id: docSnap.id, ...data });
        }
      });

      const currentMonth = selectedMonth || format(new Date(), 'yyyy-MM');
      setAvailableMonths(prev => Array.from(new Set([...prev, currentMonth])).sort((a,b) => b.localeCompare(a)));
      
      fetched.sort((a, b) => (b.coverageDate || b.submittedAt || '').localeCompare(a.coverageDate || a.submittedAt || ''));
      
      setMasterEntries(fetched);
      lastFetchedKeyRef.current = fetchKey;
      
      try {
          const storageData = fetched.map(e => sanitizeForStorage(e));
          localStorage.setItem(getMasterKey(), JSON.stringify(storageData));
      } catch (storageError) {}
    } catch (serverError: any) {
        if (serverError?.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
              path: 'coverageEntries',
              operation: 'list',
            } satisfies SecurityRuleContext));
        } else {
            console.error("Master entries fetch error:", serverError);
        }
    } finally {
        setLoading(false);
    }
  }, [userId, active, getMasterKey, masterEntries.length, selectedMonth]);

  useEffect(() => {
    if (userId && active) {
        fetchMasterEntries();
    }
  }, [userId, active, fetchMasterEntries]);

  const updateOfflineInStorage = (updatedEntries: CoverageEntry[]) => {
      setOfflineEntries(updatedEntries);
      try {
          const storageData = updatedEntries.map(e => sanitizeForStorage(e));
          localStorage.setItem(getOfflineKey(), JSON.stringify(storageData));
      } catch (e) {}
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
            toast({ title: "Entry Saved" });
          })
          .catch(async (serverError) => {
            if (serverError?.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: docRef.path,
                    operation: 'create',
                    requestResourceData: sanitizedPayload,
                } satisfies SecurityRuleContext));
            }
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
    toast({ title: "Saved Locally" });
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
        lastFetchedKeyRef.current = null;
        fetchMasterEntries(true);
        toast({ title: 'Sync Complete', description: `${entriesToSync.length} entries synced.` });
      })
      .catch(async (serverError) => {
        if (serverError?.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
              path: 'coverageEntries',
              operation: 'create',
            } satisfies SecurityRuleContext));
        }
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
        if (serverError?.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
              path: docRef.path,
              operation: 'delete',
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        }
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
        if (serverError?.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
              path: docRef.path,
              operation: 'update',
              requestResourceData: sanitizedPayload,
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        }
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
    refetch: () => fetchMasterEntries(true)
  };
};
