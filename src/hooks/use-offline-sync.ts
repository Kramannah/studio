"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, limit } from 'firebase/firestore';
import { safeStorageSet, getMonthRangeISO } from '@/lib/utils';
import { uploadBase64ToStorage, compressImage } from '@/lib/storage-utils';

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
 * Helper to offload all Base64 fields in a document to Firebase Storage.
 */
const uploadEntryImages = async (entry: any, uid: string) => {
    const ts = Date.now();
    const result = { ...entry };
    
    if (result.photos && result.photos.length > 0) {
        result.photos = await Promise.all(result.photos.map(async (p: string, i: number) => {
            if (p.startsWith('data:image')) {
                return await uploadBase64ToStorage(p, `coverage/${uid}/${ts}_photo_${i}.jpg`);
            }
            return p;
        }));
    }
    
    if (result.signature && result.signature.startsWith('data:image')) {
        result.signature = await uploadBase64ToStorage(result.signature, `coverage/${uid}/${ts}_sig.jpg`);
    }

    if (result.jointCallSignature && result.jointCallSignature.startsWith('data:image')) {
        result.jointCallSignature = await uploadBase64ToStorage(result.jointCallSignature, `coverage/${uid}/${ts}_joint_sig.jpg`);
    }
    
    return result;
};

/**
 * OFFLINE SYNC HOOK (V6.0)
 * FUTURE-ONLY DIRECT-TO-STORAGE PILLARS:
 * 1. Pillar A: Binary Pivot (Online uploads go to Storage).
 * 2. Pillar B: Aggressive Downsampling (Offline images are shrunk to prevent LocalStorage crashes).
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
        fetchMasterEntries();
    }
  }, [userId, active, selectedMonth, fetchMasterEntries]);

  const saveEntry = async (entry: Omit<CoverageEntry, 'id' | 'submittedAt' | 'userId'>): Promise<boolean> => {
    if (!userId || !db) return false;
    
    // PILLAR B: Aggressive Downsampling (Pre-Save)
    // We ALWAYS compress immediately to keep local storage tiny and minimize cloud egress
    const compressedData = { ...entry };
    if (compressedData.photos && compressedData.photos.length > 0) {
        compressedData.photos = await Promise.all(compressedData.photos.map(p => compressImage(p, 1024, 0.5)));
    }
    if (compressedData.signature) {
        compressedData.signature = await compressImage(compressedData.signature, 300, 0.5);
    }
    if (compressedData.jointCallSignature) {
        compressedData.jointCallSignature = await compressImage(compressedData.jointCallSignature, 300, 0.5);
    }

    let rawPayload: any = {
      ...compressedData,
      userId: userId,
      submittedAt: new Date().toISOString(),
    };

    if (isOnline) {
        try {
            // PILLAR A: Direct-to-Storage (Binary Pivot)
            const storagePayload = await uploadEntryImages(rawPayload, userId);
            const sanitizedPayload = sanitizePayload(storagePayload);
            const docRef = await addDoc(collection(db!, "coverageEntries"), sanitizedPayload);
            setMasterEntries(prev => [{ id: docRef.id, ...sanitizedPayload } as CoverageEntry, ...prev]);
            toast({ title: "Report Saved Online" });
            return true;
        } catch (error) {
            console.warn("Online storage save failed, falling back to local cache", error);
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
    toast({ title: "Saved to Device (Offline)" });
  }

  const syncAllOfflineEntries = useCallback(async () => {
    if (!isOnline || !userId || !db || offlineEntries.length === 0) return;
    setIsSyncing(true);

    try {
        const batch = writeBatch(db!);
        for (const entry of offlineEntries) {
            const { id, ...dataToSync } = entry;
            // PILLAR A: Binary Pivot (Offload cached Base64 to Storage on sync)
            const storagePayload = await uploadEntryImages({ ...dataToSync, userId: userId }, userId);
            const sanitized = sanitizePayload(storagePayload);
            const docRef = doc(collection(db!, "coverageEntries"));
            batch.set(docRef, sanitized);
        }

        await batch.commit();
        setOfflineEntries([]);
        safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify([]));
        fetchMasterEntries(true);
        toast({ title: 'Offline Data Synced' });
    } catch (error) {
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
    if (!db || !userId) return;
    // Compress updates too
    const updatedEntry = { ...e };
    if (updatedEntry.photos && updatedEntry.photos.length > 0) {
        updatedEntry.photos = await Promise.all(updatedEntry.photos.map(p => compressImage(p, 1024, 0.5)));
    }
    if (updatedEntry.signature) {
        updatedEntry.signature = await compressImage(updatedEntry.signature, 300, 0.5);
    }
    const storagePayload = await uploadEntryImages(updatedEntry, userId);
    const sanitized = sanitizePayload(storagePayload);
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
