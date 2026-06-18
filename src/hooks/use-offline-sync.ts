"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, limit, orderBy } from 'firebase/firestore';
import { safeStorageSet, getMonthRangeISO, parseAnyDate } from '@/lib/utils';
import { isValid, isWithinInterval, parseISO } from 'date-fns';
import { uploadBase64ToStorage, deleteStorageFile, isBase64Image } from '@/lib/storage-utils';

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

/**
 * OFFLINE SYNC HOOK (V8.0 - Self-Healing Disabled)
 * Handles local storage for offline use and syncing when online.
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
      const q = query(
        collection(db!, "coverageEntries"), 
        where("userId", "==", userId),
        where("coverageDate", ">=", start),
        where("coverageDate", "<=", end),
        limit(3000)
      );
      
      const querySnapshot = await getDocs(q);
      const fetched: CoverageEntry[] = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as CoverageEntry));
      
      if (fetched.length === 0) {
          const qLegacy = query(
              collection(db!, "coverageEntries"),
              where("userId", "==", userId),
              where("submittedAt", ">=", start),
              where("submittedAt", "<=", end),
              limit(3000)
          );
          const snapLegacy = await getDocs(qLegacy);
          fetched.push(...snapLegacy.docs.map(d => ({ id: d.id, ...d.data() } as CoverageEntry)));
      }

      fetched.sort((a, b) => (b.coverageDate || b.submittedAt || "").localeCompare(a.coverageDate || a.submittedAt || ""));
      setMasterEntries(fetched);
      lastFetchedKeyRef.current = fetchKey;
      
      // Save light metadata to local cache
      const lightEntries = fetched.map(({ photos, signature, ...rest }) => ({
          ...rest,
          photos: (photos || []).map(p => p.startsWith('http') ? p : p.substring(0, 100)),
          signature: signature?.startsWith('http') ? signature : signature?.substring(0, 100)
      }));
      safeStorageSet(`${MASTER_ENTRIES_STORAGE_KEY}_${userId}_${selectedMonth || 'current'}`, JSON.stringify(lightEntries));
    } catch (error: any) {
        console.warn("PMR fetch failure:", error.message);
    } finally {
        setLoading(false);
    }
  }, [userId, active, selectedMonth, masterEntries.length]);

  useEffect(() => {
    if (userId && active) {
        fetchMasterEntries();
    }
  }, [userId, active, selectedMonth, fetchMasterEntries]);

  const processImagesForStorage = async (entry: Partial<CoverageEntry>, uid: string) => {
    const timestamp = Date.now();
    const processed = { ...entry };

    if (isBase64Image(entry.signature)) {
        processed.signature = await uploadBase64ToStorage(entry.signature!, `coverage/${uid}/${timestamp}_signature.jpg`);
    }

    if (isBase64Image(entry.jointCallSignature)) {
        processed.jointCallSignature = await uploadBase64ToStorage(entry.jointCallSignature!, `coverage/${uid}/${timestamp}_joint_sig.jpg`);
    }

    if (entry.photos && entry.photos.length > 0) {
        const photoUrls = await Promise.all(entry.photos.map((p, i) => 
            isBase64Image(p) ? uploadBase64ToStorage(p, `coverage/${uid}/${timestamp}_photo_${i}.jpg`) : Promise.resolve(p)
        ));
        processed.photos = photoUrls;
    }

    return processed;
  };

  const saveEntry = async (entry: Omit<CoverageEntry, 'id' | 'submittedAt' | 'userId'>): Promise<boolean> => {
    if (!userId || !db) return false;
    
    let rawPayload: any = {
      ...entry,
      userId: userId,
      submittedAt: new Date().toISOString(),
    };

    if (isOnline) {
        try {
            const storagePayload = await processImagesForStorage(rawPayload, userId);
            const sanitizedPayload = sanitizePayload({ ...storagePayload, migrationStatus: 'optimized' });
            const docRef = await addDoc(collection(db!, "coverageEntries"), sanitizedPayload);
            setMasterEntries(prev => [{ id: docRef.id, ...sanitizedPayload } as CoverageEntry, ...prev]);
            toast({ title: "Report Synced" });
            return true;
        } catch (error) {
            console.warn("Storage upload failed, fallback to local", error);
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
    toast({ title: "Saved to Device" });
  }

  const syncAllOfflineEntries = useCallback(async () => {
    if (!isOnline || !userId || !db || offlineEntries.length === 0) return;
    setIsSyncing(true);

    try {
        const batch = writeBatch(db!);
        for (const entry of offlineEntries) {
            const { id, ...dataToSync } = entry;
            const storagePayload = await processImagesForStorage(dataToSync, userId);
            const sanitized = sanitizePayload({ ...storagePayload, userId: userId, migrationStatus: 'optimized' });
            const docRef = doc(collection(db!, "coverageEntries"));
            batch.set(docRef, sanitized);
        }

        await batch.commit();
        setOfflineEntries([]);
        safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify([]));
        fetchMasterEntries(true);
        toast({ title: 'Sync Successful' });
    } catch (error) {
        console.error("Batch sync failed:", error);
        toast({ variant: 'destructive', title: 'Sync Error' });
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
    const entry = masterEntries.find(e => e.id === id);
    if (entry) {
        await deleteStorageFile(entry.signature);
        await deleteStorageFile(entry.jointCallSignature);
        if (entry.photos) {
            await Promise.all(entry.photos.map(p => deleteStorageFile(p)));
        }
    }
    await deleteDoc(doc(db!, "coverageEntries", id));
    setMasterEntries(prev => prev.filter(e => e.id !== id));
  };

  const updateMasterEntry = async (e: any) => {
    if (!db || !userId) return;
    const storagePayload = await processImagesForStorage(e, userId);
    const sanitized = sanitizePayload({ ...storagePayload, migrationStatus: 'optimized' });
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