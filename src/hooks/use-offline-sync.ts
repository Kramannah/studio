
"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, limit } from 'firebase/firestore';
import { safeStorageSet, getMonthRangeISO, parseAnyDate } from '@/lib/utils';
import { isValid, isWithinInterval, parseISO } from 'date-fns';

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
    if (val === undefined || val === null && key === 'id') return;
    if (Array.isArray(val) && key === 'reminderProducts') {
      cleaned[key] = val.map(p => sanitizePayload(p)).filter(p => Object.keys(p).length > 0);
      return;
    }
    if (val === undefined) return;
    cleaned[key] = val;
  });
  return cleaned;
};

/**
 * LOW-COST V2.2: Optimized for minimum reads with monthly synchronization and high-horizon fallbacks.
 * Ensures accounts like NL-02 (mdLCjhNVnYas96aW4IkrPWip7RS2) load their coverage correctly.
 */
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
      // Primary targeted query (requires composite index: userId + coverageDate)
      const q = query(
        collection(db!, "coverageEntries"), 
        where("userId", "==", userId),
        where("coverageDate", ">=", start),
        where("coverageDate", "<=", end),
        limit(5000)
      );
      
      const querySnapshot = await getDocs(q);
      const fetched: CoverageEntry[] = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as CoverageEntry));
      
      fetched.sort((a, b) => (b.coverageDate || b.submittedAt || "").localeCompare(a.coverageDate || a.submittedAt || ""));
      
      setMasterEntries(fetched);
      lastFetchedKeyRef.current = fetchKey;
      
      const lightEntries = fetched.map(({ photos, signature, jointCallSignature, ...rest }) => rest);
      safeStorageSet(`${MASTER_ENTRIES_STORAGE_KEY}_${userId}_${selectedMonth || 'current'}`, JSON.stringify(lightEntries));
    } catch (error) {
        console.warn("Coverage fetch fallback triggered for user:", userId);
        // High-horizon fallback for veteran accounts (like NL-02)
        const fallbackQ = query(collection(db!, "coverageEntries"), where("userId", "==", userId), limit(5000));
        const snap = await getDocs(fallbackQ);
        const interval = { start: parseISO(start), end: parseISO(end) };
        const fetched = snap.docs
            .map(d => ({id: d.id, ...d.data()} as CoverageEntry))
            .filter(e => {
                const d = parseAnyDate(e.coverageDate || e.submittedAt);
                return d && isValid(d) && isWithinInterval(d, interval);
            });
        
        fetched.sort((a, b) => (b.coverageDate || b.submittedAt || "").localeCompare(a.coverageDate || a.submittedAt || ""));
        setMasterEntries(fetched);
    } finally {
        setLoading(false);
    }
  }, [userId, active, selectedMonth, masterEntries.length]);

  useEffect(() => {
    if (userId && active) {
        fetchMasterEntries();
    }
  }, [userId, active, selectedMonth, fetchMasterEntries]);

  const saveEntry = async (entry: Omit<CoverageEntry, 'id' | 'submittedAt' | 'userId'>): Promise<boolean> => {
    if (!userId || !db) return false;
    
    const rawPayload = {
      ...entry,
      userId: userId,
      submittedAt: new Date().toISOString(),
    };

    const sanitizedPayload = sanitizePayload(rawPayload);

    if (isOnline) {
        try {
            const docRef = await addDoc(collection(db!, "coverageEntries"), sanitizedPayload);
            setMasterEntries(prev => [{ id: docRef.id, ...sanitizedPayload } as CoverageEntry, ...prev]);
            toast({ title: "Entry Saved" });
            return true;
        } catch (error) {
            saveEntryOffline(sanitizedPayload);
            return false;
        }
    } else {
        saveEntryOffline(sanitizedPayload);
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
    if (!isOnline || !userId || !db || offlineEntries.length === 0) return;
    setIsSyncing(true);

    const batch = writeBatch(db!);
    for (const entry of offlineEntries) {
        const { id, ...dataToSync } = entry;
        const docRef = doc(collection(db!, "coverageEntries"));
        const sanitized = sanitizePayload({ ...dataToSync, userId: userId });
        batch.set(docRef, sanitized);
    }

    try {
        await batch.commit();
        setOfflineEntries([]);
        safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify([]));
        fetchMasterEntries(true);
        toast({ title: 'Sync Complete' });
    } catch (error) {
        console.error("Sync failed:", error);
        toast({ variant: 'destructive', title: 'Sync Error', description: 'Could not upload offline data.' });
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
    updateOfflineEntry: (e: any) => {
        const updated = offlineEntries.map(item => item.id === e.id ? e : item);
        setOfflineEntries(updated);
        safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify(updated));
    }
  };
};
