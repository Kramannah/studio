"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, limit } from 'firebase/firestore';
import { safeStorageSet, getMonthRangeISO } from '@/lib/utils';
import { format } from 'date-fns';

const OFFLINE_ENTRIES_KEY = 'sfe-offline-coverage-entries-v3';
const MASTER_ENTRIES_STORAGE_KEY = 'sfe-master-entries-v5';

const generateUniqueId = () => {
    return `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

const sanitizePayload = (data: any): any => {
  const cleaned: any = {};
  if (!data) return cleaned;
  Object.keys(data).forEach(key => {
    const val = data[key];
    if (val === undefined || (val === null && key === 'id')) return;
    if (Array.isArray(val) && key === 'reminderProducts') {
      cleaned[key] = val.map(p => sanitizePayload(p)).filter(p => Object.keys(p).length > 0);
      return;
    }
    if (val === undefined) return;
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
        if (localMaster) setMasterEntries(JSON.parse(localMaster));
    }
  }, [userId, selectedMonth]);

  const fetchMasterEntries = useCallback(async (force = false) => {
    if (!userId || !db || !active || !navigator.onLine) return;
    
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
    } finally {
        setLoading(false);
    }
  }, [userId, active, selectedMonth, masterEntries.length]);

  useEffect(() => {
    if (userId && active) {
        // LAZY LOADING: Only auto-fetch if it's the current month
        const currentMonth = format(new Date(), 'yyyy-MM');
        if (!selectedMonth || selectedMonth === currentMonth) {
            fetchMasterEntries();
        }
    }
  }, [userId, active, selectedMonth, fetchMasterEntries]);

  const saveEntry = async (entry: Omit<CoverageEntry, 'id' | 'submittedAt' | 'userId'>): Promise<boolean> => {
    if (!userId || !db) return false;
    
    const rawPayload: any = {
      ...entry,
      userId: userId,
      submittedAt: new Date().toISOString(),
    };

    if (isOnline) {
        try {
            const sanitizedPayload = sanitizePayload(rawPayload);
            const docRef = await addDoc(collection(db!, "coverageEntries"), sanitizedPayload);
            setMasterEntries(prev => [{ id: docRef.id, ...sanitizedPayload } as CoverageEntry, ...prev]);
            toast({ title: "Report Saved" });
            return true;
        } catch (error) {
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
    const updatedEntries = [entryWithId, ...offlineEntries];
    setOfflineEntries(updatedEntries);
    safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify(updatedEntries));
    toast({ title: "Saved Locally" });
  }

  const syncAllOfflineEntries = useCallback(async () => {
    if (!isOnline || !userId || !db) return;
    
    // If no offline entries, we still allow a "Force Refresh" from the DB
    if (offlineEntries.length === 0) {
        await fetchMasterEntries(true);
        return;
    }
    
    setIsSyncing(true);
    try {
        const batch = writeBatch(db!);
        offlineEntries.forEach(entry => {
            const { id, ...dataToSync } = entry;
            const docRef = doc(collection(db!, "coverageEntries"));
            batch.set(docRef, sanitizePayload(dataToSync));
        });

        await batch.commit();
        setOfflineEntries([]);
        safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify([]));
        await fetchMasterEntries(true);
        toast({ title: "Offline Data Synced" });
    } catch (error: any) {
        console.error("Batch sync failed:", error);
        toast({ variant: 'destructive', title: 'Sync Failed' });
    } finally {
        setIsSyncing(false);
    }
  }, [isOnline, userId, offlineEntries, toast, fetchMasterEntries]);

  useEffect(() => {
    if (isOnline && offlineEntries.length > 0) {
        syncAllOfflineEntries();
    }
  }, [isOnline, offlineEntries.length, syncAllOfflineEntries]);

  const deleteMasterEntry = async (id: string) => {
    if (!db) return;
    await deleteDoc(doc(db!, "coverageEntries", id));
    setMasterEntries(prev => prev.filter(e => e.id !== id));
  };

  const updateMasterEntry = async (e: any) => {
    if (!db) return;
    const sanitized = sanitizePayload(e);
    await updateDoc(doc(db!, "coverageEntries", e.id), sanitized);
    setMasterEntries(prev => prev.map(item => item.id === e.id ? {...item, ...sanitized} : item));
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