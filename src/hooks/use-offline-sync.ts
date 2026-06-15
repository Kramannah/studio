
"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, deleteDoc, updateDoc, writeBatch, setDoc, limit } from 'firebase/firestore';
import { format, parseISO, isValid, isWithinInterval } from 'date-fns';
import { getMonthRangeISO, parseAnyDate } from '@/lib/utils';

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
    if (!userId || !db || !active || !navigator.onLine) {
        if (!active) setLoading(false);
        return;
    }
    
    const fetchKey = `${userId}_${selectedMonth}`;
    if (!force && lastFetchedKeyRef.current === fetchKey && masterEntries.length > 0) {
        setLoading(false);
        return;
    }

    setLoading(true);

    try {
      const { start, end } = getMonthRangeISO(selectedMonth);
      const interval = { start: parseISO(start), end: parseISO(end) };
      
      const q = query(
        collection(db!, "coverageEntries"), 
        where("userId", "==", userId),
        limit(5000)
      );
      
      const querySnapshot = await getDocs(q);

      const fetched: CoverageEntry[] = [];
      const months = new Set<string>();

      querySnapshot.forEach(docSnap => {
        const data = docSnap.data() as CoverageEntry;
        const date = parseAnyDate(data.coverageDate) || parseAnyDate(data.submittedAt);
        
        if (date && isValid(date)) {
            const mKey = format(date, 'yyyy-MM');
            months.add(mKey);
            if (isWithinInterval(date, interval)) {
                fetched.push({ id: docSnap.id, ...data });
            }
        }
      });

      const currentMonth = selectedMonth || format(new Date(), 'yyyy-MM');
      months.add(currentMonth);
      setAvailableMonths(Array.from(months).sort((a,b) => b.localeCompare(a)));
      
      fetched.sort((a, b) => (b.coverageDate || b.submittedAt || '').localeCompare(a.coverageDate || a.submittedAt || ''));
      
      setMasterEntries(fetched);
      lastFetchedKeyRef.current = fetchKey;
      
      try {
          const storageData = fetched.map(e => sanitizeForStorage(e));
          localStorage.setItem(getMasterKey(), JSON.stringify(storageData));
      } catch (storageError) {}
    } catch (serverError: any) {
        console.error("Entries fetch error:", serverError);
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
        try {
            await setDoc(docRef, sanitizedPayload);
            setMasterEntries(prev => {
                const next = [sanitizedPayload as CoverageEntry, ...prev];
                return next.sort((a, b) => (b.coverageDate || b.submittedAt || '').localeCompare(a.coverageDate || a.submittedAt || ''));
            });
            toast({ title: "Entry Saved" });
            return true;
        } catch (serverError) {
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

    try {
        await batch.commit();
        updateOfflineInStorage([]);
        lastFetchedKeyRef.current = null;
        fetchMasterEntries(true);
        toast({ title: 'Sync Complete', description: `${entriesToSync.length} entries synced.` });
    } catch (serverError) {
        console.error("Sync failed:", serverError);
    } finally {
        setIsSyncing(false);
    }
  }, [isOnline, userId, offlineEntries, toast, isSyncing, fetchMasterEntries]);

  useEffect(() => {
    if (isOnline && offlineEntries.length > 0) {
        syncAllOfflineEntries();
    }
  }, [isOnline, offlineEntries.length, syncAllOfflineEntries]);

  const deleteMasterEntry = async (id: string) => {
    if (!db) return;
    try {
        await deleteDoc(doc(db!, "coverageEntries", id));
        setMasterEntries(prev => prev.filter(e => e.id !== id));
    } catch (e) {}
  };

  const updateMasterEntry = async (e: any) => {
    if (!db) return;
    const sanitizedPayload = sanitizePayload(e);
    try {
        await updateDoc(doc(db!, "coverageEntries", e.id), { ...sanitizedPayload, userId: userId });
        setMasterEntries(prev => prev.map(item => item.id === e.id ? {...item, ...sanitizedPayload} : item));
    } catch (error) {}
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
