"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, limit, FirestoreError } from 'firebase/firestore';
import { safeStorageSet, getMonthRangeISO } from '@/lib/utils';
import { format } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const OFFLINE_ENTRIES_KEY = 'sfe-offline-coverage-entries-v3';
const MASTER_ENTRIES_STORAGE_KEY = 'sfe-master-entries-v5';

const generateUniqueId = () => {
    return `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Deep sanitization to ensure Firestore compatibility.
 * Removes undefined, empty strings, and empty arrays to prevent batch failures.
 */
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

export const useOfflineSync = (userId?: string, active: boolean = true, selectedMonth?: string) => {
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
    // LOW-COST FIX: Allow manual sync (force=true) to bypass the 'active' view guard
    if (!userId || !db || (!active && !force) || !navigator.onLine) return;
    
    const fetchKey = `${userId}_${selectedMonth || 'current'}`;
    if (!force && lastFetchedKeyRef.current === fetchKey && masterEntries.length > 0) return;

    setLoading(true);
    const { start, end } = getMonthRangeISO(selectedMonth);
    
    try {
      const q = query(
        collection(db!, "coverageEntries"), 
        where("userId", "==", userId),
        where("coverageDate", ">=", start),
        where("coverageDate", "<=", end),
        limit(1500)
      );
      
      const querySnapshot = await getDocs(q);
      const fetched: CoverageEntry[] = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as CoverageEntry));
      
      fetched.sort((a, b) => (b.coverageDate || b.submittedAt || "").localeCompare(a.coverageDate || a.submittedAt || ""));
      setMasterEntries(fetched);
      lastFetchedKeyRef.current = fetchKey;
      
      safeStorageSet(`${MASTER_ENTRIES_STORAGE_KEY}_${userId}_${selectedMonth || 'current'}`, JSON.stringify(fetched));
    } catch (error: any) {
        console.warn("PMR fetch failure:", error.message);
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
    const currentMonth = format(new Date(), 'yyyy-MM');
    const isCurrentMonth = !selectedMonth || selectedMonth === currentMonth;

    if (userId && active && isCurrentMonth) {
        fetchMasterEntries();
    }
  }, [userId, active, selectedMonth, fetchMasterEntries]);

  const saveEntry = async (entry: Omit<CoverageEntry, 'id' | 'submittedAt' | 'userId'>): Promise<boolean> => {
    if (!userId || !db) return false;
    
    const rawPayload: any = {
      ...entry,
      userId: userId,
      submittedAt: new Date().toISOString(),
    };

    const sanitized = sanitizePayload(rawPayload);

    if (isOnline) {
        try {
            const docRef = await addDoc(collection(db!, "coverageEntries"), sanitized);
            const newEntry = { id: docRef.id, ...sanitized } as CoverageEntry;
            
            // UI Update: Only add to current list if month matches
            const entryDate = sanitized.coverageDate ? sanitized.coverageDate.substring(0, 7) : format(new Date(), 'yyyy-MM');
            if (!selectedMonth || entryDate === selectedMonth) {
                setMasterEntries(prev => [newEntry, ...prev]);
            }
            
            toast({ title: "Report Saved" });
            return true;
        } catch (error) {
            console.error("Direct save failed, falling back to offline:", error);
            saveEntryOffline(rawPayload);
            return false;
        }
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
    
    if (offlineEntries.length === 0) {
        await fetchMasterEntries(true);
        return;
    }
    
    isSyncInProgress.current = true;
    setIsSyncing(true);
    
    try {
        const batch = writeBatch(db!);
        const currentOffline = [...offlineEntries];
        
        currentOffline.forEach(entry => {
            const { id, isOffline, migrationStatus, ...dataToSync } = entry as any;
            const docRef = doc(collection(db!, "coverageEntries"));
            batch.set(docRef, sanitizePayload(dataToSync));
        });

        await batch.commit();
        
        // Success: Clear state and cache
        setOfflineEntries([]);
        safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify([]));
        
        // Refresh master list for selected month
        await fetchMasterEntries(true);
        toast({ title: "Offline Data Synced" });
    } catch (error: any) {
        console.error("Batch sync failed:", error);
        toast({ variant: 'destructive', title: 'Sync Failed', description: "Retrying in background..." });
        
        if (error.code === 'permission-denied') {
             errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'coverageEntries',
                operation: 'create'
            }));
        }
    } finally {
        setIsSyncing(false);
        isSyncInProgress.current = false;
    }
  }, [isOnline, userId, offlineEntries, toast, fetchMasterEntries]);

  // Automatic background sync when online
  useEffect(() => {
    if (isOnline && offlineEntries.length > 0 && !isSyncInProgress.current) {
        const timer = setTimeout(() => {
            syncAllOfflineEntries();
        }, 1000);
        return () => clearTimeout(timer);
    }
  }, [isOnline, offlineEntries.length, syncAllOfflineEntries]);

  const deleteMasterEntry = async (id: string) => {
    if (!db) return;
    try {
        await deleteDoc(doc(db!, "coverageEntries", id));
        setMasterEntries(prev => prev.filter(e => e.id !== id));
        toast({ title: "Report Deleted" });
    } catch (e: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: `coverageEntries/${id}`,
            operation: 'delete'
        }));
    }
  };

  const updateMasterEntry = async (e: any) => {
    if (!db) return;
    const sanitized = sanitizePayload(e);
    const { id, ...data } = sanitized;
    try {
        await updateDoc(doc(db!, "coverageEntries", id), data);
        setMasterEntries(prev => prev.map(item => item.id === id ? {...item, ...data} : item));
        toast({ title: "Report Updated" });
    } catch (err: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: `coverageEntries/${id}`,
            operation: 'update',
            requestResourceData: data
        }));
    }
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
