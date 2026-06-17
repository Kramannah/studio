
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, limit, orderBy } from 'firebase/firestore';
import { safeStorageSet } from '@/lib/utils';

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
    if (val === undefined) return;
    if (Array.isArray(val) && key === 'reminderProducts') {
      cleaned[key] = val.map(p => sanitizePayload(p)).filter(p => Object.keys(p).length > 0);
      return;
    }
    cleaned[key] = val;
  });
  return cleaned;
};

/**
 * LOW-COST V2.1: Optimized for minimum reads with high-volume fallback.
 * Limits are set to 5,000 to ensure veteran accounts see recent data even without indexes.
 */
export const useOfflineSync = (userId?: string, active: boolean = true) => {
  const { toast } = useToast();
  const [offlineEntries, setOfflineEntries] = useState<CoverageEntry[]>([]);
  const [masterEntries, setMasterEntries] = useState<CoverageEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(false);

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
        
        const localMaster = localStorage.getItem(`${MASTER_ENTRIES_STORAGE_KEY}_${userId}`);
        if (localMaster) setMasterEntries(JSON.parse(localMaster));
    }
  }, [userId]);

  const fetchMasterEntries = useCallback(async () => {
    if (!userId || !db || !active || !navigator.onLine) return;
    setLoading(true);
    try {
      // Primary targeted query (Requires Index: userId + submittedAt DESC)
      const q = query(
        collection(db!, "coverageEntries"), 
        where("userId", "==", userId),
        orderBy("submittedAt", "desc"),
        limit(1000)
      );
      
      const querySnapshot = await getDocs(q);
      const fetched: CoverageEntry[] = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as CoverageEntry));
      
      setMasterEntries(fetched);
      
      // Cache metadata-only version (no heavy images) to save LocalStorage space
      const lightEntries = fetched.map(({ photos, signature, jointCallSignature, dsmSignature, ...rest }) => rest);
      safeStorageSet(`${MASTER_ENTRIES_STORAGE_KEY}_${userId}`, JSON.stringify(lightEntries));
    } catch (error) {
        console.warn("Coverage fetch fallback triggered (Index likely missing):", error);
        // Robust Fallback: Fetch a larger batch without server-side sorting (No Index Required)
        // limit(5000) ensures recent entries are retrieved even for veteran accounts
        const fallbackQ = query(collection(db!, "coverageEntries"), where("userId", "==", userId), limit(5000));
        const snap = await getDocs(fallbackQ);
        const fetched = snap.docs.map(d => ({id: d.id, ...d.data()} as CoverageEntry));
        
        // Sort in memory to ensure UI displays recent items first
        fetched.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
        setMasterEntries(fetched);
    } finally {
        setLoading(false);
    }
  }, [userId, active]);

  useEffect(() => {
    if (userId && active) {
        fetchMasterEntries();
    }
  }, [userId, active, fetchMasterEntries]);

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
        batch.set(docRef, { ...dataToSync, userId: userId });
    }

    try {
        await batch.commit();
        setOfflineEntries([]);
        safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify([]));
        fetchMasterEntries();
        toast({ title: 'Sync Complete' });
    } catch (error) {
        console.error("Sync failed:", error);
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
    updateOfflineEntry: (e: any) => {
        const updated = offlineEntries.map(item => item.id === e.id ? e : item);
        setOfflineEntries(updated);
        safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify(updated));
    }
  };
};
