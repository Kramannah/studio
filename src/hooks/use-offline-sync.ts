
"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, limit, FirestoreError } from 'firebase/firestore';
import { safeStorageSet, getMonthRangeISO, parseAnyDate } from '@/lib/utils';
import { format, subMonths, startOfMonth, endOfMonth, isValid, parseISO, isWithinInterval } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { compressImage } from '@/lib/storage-utils';

const OFFLINE_ENTRIES_KEY = 'sfe-offline-coverage-entries-v3';
const MASTER_ENTRIES_STORAGE_KEY = 'sfe-master-entries-v5';

const generateUniqueId = () => {
    return `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

const sanitizePayload = (data: any): any => {
  const cleaned: any = {};
  if (!data || typeof data !== 'object') return cleaned;
  
  Object.keys(data).forEach(key => {
    const val = data[key];
    if (val === undefined || val === "") return;
    if (val === null && (key === 'id' || key === 'isOffline')) return;
    
    if (Array.isArray(val)) {
      if (val.length === 0) return;
      if (key === 'reminderProducts') {
        cleaned[key] = val.map(p => sanitizePayload(p)).filter(p => Object.keys(p).length > 0);
        if (cleaned[key].length === 0) delete cleaned[key];
        return;
      }
      cleaned[key] = val;
      return;
    }
    
    if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
        const sub = sanitizePayload(val);
        if (Object.keys(sub).length > 0) cleaned[key] = sub;
        return;
    }

    cleaned[key] = val;
  });
  return cleaned;
};

export const useOfflineSync = (userId?: string, active: boolean = true, selectedMonth?: string, onSyncSuccess?: () => void) => {
  const { toast } = useToast();
  const [offlineEntries, setOfflineEntries] = useState<CoverageEntry[]>([]);
  const [masterEntries, setMasterEntries] = useState<CoverageEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(false);
  
  const lastFetchedKeyRef = useRef<string | null>(null);
  const isSyncInProgress = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
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
        const localOffline = localStorage.getItem(`${OFFLINE_ENTRIES_KEY}_${userId}`);
        if (localOffline) setOfflineEntries(JSON.parse(localOffline));
        
        const cacheKey = `${MASTER_ENTRIES_STORAGE_KEY}_${userId}_${selectedMonth || 'current'}`;
        const localMaster = localStorage.getItem(cacheKey);
        if (localMaster) {
            setMasterEntries(JSON.parse(localMaster));
        } else {
            setMasterEntries([]);
        }
    }
  }, [userId, selectedMonth]);

  const fetchMasterEntries = useCallback(async (force = false) => {
    if (!userId || !db || (!active && !force) || !navigator.onLine) return;
    
    const fetchKey = `${userId}_${selectedMonth || 'current'}`;
    if (!force && lastFetchedKeyRef.current === fetchKey && masterEntries.length > 0) return;

    setLoading(true);
    
    // BROAD SCAN: Fetch several months of data to ensure all synced reports are visible
    const refDate = selectedMonth ? parseISO(selectedMonth + "-01") : new Date();
    const scanStart = startOfMonth(subMonths(refDate, 3)).toISOString();
    const { end: monthEnd } = getMonthRangeISO(selectedMonth);
    
    try {
      const q = query(
        collection(db!, "coverageEntries"), 
        where("userId", "==", userId),
        where("coverageDate", ">=", scanStart),
        limit(3000)
      );
      
      const querySnapshot = await getDocs(q);
      const allFetched: CoverageEntry[] = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as CoverageEntry));
      
      const selectedMonthStart = startOfMonth(refDate);
      const selectedMonthEnd = endOfMonth(refDate);
      const trendStart = startOfMonth(subMonths(refDate, 2));

      // In-memory filter handles both coverageDate and submittedAt, catching Anne Alberto's "lost" reports
      const filtered = allFetched.filter(e => {
          const d = parseAnyDate(e.coverageDate) || parseAnyDate(e.submittedAt);
          return d && isValid(d) && isWithinInterval(d, { start: trendStart, end: selectedMonthEnd });
      });

      filtered.sort((a, b) => (b.coverageDate || b.submittedAt || "").localeCompare(a.coverageDate || a.submittedAt || ""));
      setMasterEntries(filtered);
      lastFetchedKeyRef.current = fetchKey;
      
      safeStorageSet(`${MASTER_ENTRIES_STORAGE_KEY}_${userId}_${selectedMonth || 'current'}`, JSON.stringify(filtered));
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'coverageEntries',
                operation: 'list'
            }));
        }
    } finally {
        setLoading(false);
    }
  }, [userId, active, selectedMonth, masterEntries.length]);

  useEffect(() => {
    fetchMasterEntries();
  }, [fetchMasterEntries]);

  const saveEntry = async (entry: Omit<CoverageEntry, 'id' | 'submittedAt' | 'userId'>): Promise<boolean> => {
    if (!userId || !db) return false;
    
    let processedPhotos = entry.photos;
    if (entry.photos && entry.photos.length > 0) {
        try {
            // PROACTIVE COMPRESSION: Compress before any storage action (online or offline)
            processedPhotos = await Promise.all(entry.photos.map(p => compressImage(p, 800, 0.5)));
        } catch (e) { console.warn("Compression failed, using raw", e); }
    }

    const rawPayload: any = {
      ...entry,
      photos: processedPhotos,
      userId: userId,
      submittedAt: new Date().toISOString(),
    };

    const sanitized = sanitizePayload(rawPayload);

    if (isOnline) {
        const colRef = collection(db!, "coverageEntries");
        addDoc(colRef, sanitized)
          .then((docRef) => {
            const newEntry = { id: docRef.id, ...sanitized } as CoverageEntry;
            setMasterEntries(prev => [newEntry, ...prev]);
            toast({ title: "Report Saved" });
            if (onSyncSuccess) onSyncSuccess();
          })
          .catch(async (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'coverageEntries',
                operation: 'create',
                requestResourceData: sanitized,
            }));
            saveEntryOffline(rawPayload);
          });
        return true;
    } else {
        saveEntryOffline(rawPayload);
        return false;
    }
  };

  const saveEntryOffline = (newEntry: Omit<CoverageEntry, 'id'>) => {
    const entryWithId = { ...newEntry, id: generateUniqueId() };
    setOfflineEntries(prev => {
        const next = [entryWithId, ...prev];
        safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify(next));
        return next;
    });
    toast({ title: "Saved Locally" });
  }

  const syncAllOfflineEntries = useCallback(async () => {
    if (!isOnline || !userId || !db || isSyncInProgress.current) return;
    
    const entriesToSync = [...offlineEntries];
    if (entriesToSync.length === 0) {
        await fetchMasterEntries(true);
        return;
    }
    
    isSyncInProgress.current = true;
    setIsSyncing(true);
    
    let successCount = 0;
    let failedEntries: CoverageEntry[] = [];

    // INDIVIDUAL PROCESSING: Process reports one-by-one to prevent batch blocking
    for (const entry of entriesToSync) {
        try {
            const { id, isOffline, migrationStatus, ...dataToSync } = entry as any;
            const sanitized = sanitizePayload(dataToSync);
            await addDoc(collection(db!, "coverageEntries"), sanitized);
            successCount++;
        } catch (error: any) {
            console.error("Single report sync failed:", error);
            failedEntries.push(entry);
            
            if (error.code === 'permission-denied') {
                 errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'coverageEntries',
                    operation: 'create'
                }));
            }
        }
    }

    if (successCount > 0) {
        setOfflineEntries(failedEntries);
        safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify(failedEntries));
        await fetchMasterEntries(true);
        if (onSyncSuccess) onSyncSuccess();
    }

    if (failedEntries.length > 0) {
        toast({ 
            variant: 'destructive', 
            title: 'Sync Partial', 
            description: `${failedEntries.length} reports could not be uploaded. Retrying...` 
        });
    } else {
        toast({ title: "Sync Complete" });
    }

    setIsSyncing(false);
    isSyncInProgress.current = false;
  }, [isOnline, userId, offlineEntries, toast, fetchMasterEntries, onSyncSuccess]);

  useEffect(() => {
    if (isOnline && offlineEntries.length > 0 && !isSyncInProgress.current) {
        const timer = setTimeout(() => {
            syncAllOfflineEntries();
        }, 5000);
        return () => clearTimeout(timer);
    }
  }, [isOnline, offlineEntries.length, syncAllOfflineEntries]);

  const deleteMasterEntry = async (id: string) => {
    if (!db) return;
    const docRef = doc(db!, "coverageEntries", id);
    deleteDoc(docRef)
      .then(() => {
        setMasterEntries(prev => prev.filter(e => e.id !== id));
        toast({ title: "Report Deleted" });
        if (onSyncSuccess) onSyncSuccess();
      })
      .catch(async (e: any) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete'
        }));
      });
  };

  const updateMasterEntry = async (e: any) => {
    if (!db) return;
    const sanitized = sanitizePayload(e);
    const { id, ...data } = sanitized;
    const docRef = doc(db!, "coverageEntries", id);
    
    updateDoc(docRef, data)
      .then(() => {
        setMasterEntries(prev => prev.map(item => item.id === id ? {...item, ...data} : item));
        toast({ title: "Report Updated" });
        if (onSyncSuccess) onSyncSuccess();
      })
      .catch(async (err: any) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: data
        }));
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
    loading,
    fetchMasterEntries,
    updateOfflineEntry: (e: any) => {
        const updated = offlineEntries.map(item => item.id === e.id ? e : item);
        setOfflineEntries(updated);
        safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify(updated));
    }
  };
};
