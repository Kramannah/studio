
"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, limit, FirestoreError, orderBy, startAt, endAt } from 'firebase/firestore';
import { safeStorageSet, getMonthRangeISO, parseAnyDate } from '@/lib/utils';
import { format, subMonths, startOfMonth, endOfMonth, isValid, parseISO, isWithinInterval } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { compressImage } from '@/lib/storage-utils';

const OFFLINE_ENTRIES_KEY = 'sfe-offline-coverage-entries-v3';
const MASTER_ENTRIES_STORAGE_KEY = 'sfe-master-entries-v6';
const CACHE_TTL = 15 * 60 * 1000; // 15 Minutes cache TTL

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
  const lastFetchTimeRef = useRef<number>(0);
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
            try {
                const { data, timestamp } = JSON.parse(localMaster);
                setMasterEntries(data || []);
                lastFetchTimeRef.current = timestamp || 0;
            } catch (e) {
                setMasterEntries([]);
            }
        } else {
            setMasterEntries([]);
        }
    }
  }, [userId, selectedMonth]);

  const fetchMasterEntries = useCallback(async (force = false) => {
    if (!userId || !db || (!active && !force) || !navigator.onLine) return;
    
    const fetchKey = `${userId}_${selectedMonth || 'current'}`;
    const now = Date.now();
    
    if (!force && lastFetchedKeyRef.current === fetchKey && (now - lastFetchTimeRef.current < CACHE_TTL) && masterEntries.length > 0) {
        return;
    }

    setLoading(true);
    const { start, end } = getMonthRangeISO(selectedMonth);
    
    try {
      // RESILIENT FETCH: Handles missing indexes by falling back to client-side filtering
      let snapDocs: any[] = [];
      try {
        const q = query(
          collection(db!, "coverageEntries"), 
          where("userId", "==", userId),
          where("coverageDate", ">=", start),
          where("coverageDate", "<=", end),
          limit(1000)
        );
        const querySnapshot = await getDocs(q);
        snapDocs = querySnapshot.docs;
      } catch (err: any) {
        if (err.code === 'failed-precondition' || err.message?.toLowerCase().includes('index')) {
          const fallbackQ = query(collection(db!, "coverageEntries"), where("userId", "==", userId), limit(1000));
          const snap = await getDocs(fallbackQ);
          snapDocs = snap.docs.filter(d => {
            const dateVal = String(d.data().coverageDate || "");
            return dateVal >= start && dateVal <= end;
          });
        } else {
          throw err;
        }
      }
      
      const allFetched = snapDocs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as CoverageEntry));
      allFetched.sort((a, b) => (b.coverageDate || b.submittedAt || "").localeCompare(a.coverageDate || a.submittedAt || ""));
      
      setMasterEntries(allFetched);
      lastFetchedKeyRef.current = fetchKey;
      lastFetchTimeRef.current = now;
      
      const cacheData = { data: allFetched, timestamp: now };
      safeStorageSet(`${MASTER_ENTRIES_STORAGE_KEY}_${userId}_${selectedMonth || 'current'}`, JSON.stringify(cacheData));
    } catch (error: any) {
        console.error("Fetch coverage failed:", error);
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
    if (active && userId) {
        fetchMasterEntries();
    }
  }, [fetchMasterEntries, active, userId]);

  const saveEntry = async (entry: Omit<CoverageEntry, 'id' | 'submittedAt' | 'userId'>): Promise<boolean> => {
    if (!userId || !db) return false;
    
    let processedPhotos = entry.photos;
    if (entry.photos && entry.photos.length > 0) {
        try {
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
    
    let currentOfflineQueue = [...offlineEntries];
    if (currentOfflineQueue.length === 0) return;
    
    isSyncInProgress.current = true;
    setIsSyncing(true);
    
    let successCount = 0;

    for (const entry of currentOfflineQueue) {
        try {
            const { id, isOffline, migrationStatus, ...dataToSync } = entry as any;
            const sanitized = sanitizePayload(dataToSync);
            
            await addDoc(collection(db!, "coverageEntries"), sanitized);
            
            successCount++;
            setOfflineEntries(prev => {
                const next = prev.filter(item => item.id !== entry.id);
                safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify(next));
                return next;
            });

        } catch (error: any) {
            console.error(`Sync failed for report ${entry.id}:`, error);
            if (error.code === 'permission-denied') {
                 errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'coverageEntries',
                    operation: 'create'
                }));
            }
        }
    }

    if (successCount > 0) {
        await fetchMasterEntries(true);
        if (onSyncSuccess) onSyncSuccess();
        toast({ title: successCount === currentOfflineQueue.length ? "Sync Complete" : `Synced ${successCount} reports.` });
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
