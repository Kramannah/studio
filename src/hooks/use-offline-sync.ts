"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc, limit, orderBy, startAfter, getCountFromServer, QueryDocumentSnapshot, DocumentData, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { safeStorageSet, parseAnyDate, getWeekFridayDeadline } from '@/lib/utils';
import { format, subMonths, startOfMonth, endOfMonth, isValid, parseISO, isAfter } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const OFFLINE_ENTRIES_KEY = 'sfe-offline-coverage-entries-v3';
const PAGE_SIZE = 10;

const generateUniqueId = () => {
    return `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

const sanitizePayload = (data: any): any => {
  const cleaned: any = {};
  if (!data || typeof data !== 'object') return cleaned;
  
  const proofFields = ['photos', 'signature', 'jointCallSignature'];

  Object.keys(data).forEach(key => {
    const val = data[key];
    const isProofField = proofFields.includes(key);

    if (val === undefined || val === "") return;
    
    if (val === null) {
        if (isProofField) {
            cleaned[key] = null;
        }
        return;
    }
    
    if (Array.isArray(val)) {
      if (val.length === 0) {
          if (isProofField) {
              cleaned[key] = [];
          }
          return;
      }
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

export const useOfflineSync = (
    userId?: string, 
    active: boolean = true, 
    selectedMonth?: string, 
    onSyncSuccess?: () => void,
    includeSummary: boolean = false
) => {
  const { toast } = useToast();
  const [offlineEntries, setOfflineEntries] = useState<CoverageEntry[]>([]);
  const [masterEntries, setMasterEntries] = useState<CoverageEntry[]>([]); 
  const [summaryEntries, setSummaryEntries] = useState<CoverageEntry[]>([]); 
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(false);
  const [syncSource, setSyncSource] = useState<'cache' | 'server' | null>(null);
  const [loadTrend, setLoadTrend] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  const pageHistoryRef = useRef<(QueryDocumentSnapshot<DocumentData> | null)[]>([null]);
  
  const isSyncInProgress = useRef(false);
  const lastFetchedKeyRef = useRef<string | null>(null);
  const lastSummaryKeyRef = useRef<string | null>(null);

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
    }
  }, [userId]);

  const fetchTotalCount = useCallback(async (start: string, end: string) => {
    if (!userId || !db) return;
    try {
        const q = query(
            collection(db!, "coverageEntries"),
            where("userId", "==", userId),
            where("coverageDate", ">=", start),
            where("coverageDate", "<=", end)
        );
        const snapshot = await getCountFromServer(q);
        setTotalCount(snapshot.data().count);
    } catch (e) {
        console.warn("Count fetch failed:", e);
    }
  }, [userId]);

  const fetchSummaryEntries = useCallback(async (start: string, end: string, force = false) => {
    if (!userId || !db) return;
    
    const summaryKey = `${userId}_${selectedMonth}_${loadTrend}`;
    if (!force && lastSummaryKeyRef.current === summaryKey && summaryEntries.length > 0) return;

    try {
        const q = query(
            collection(db!, "coverageEntries"),
            where("userId", "==", userId),
            where("coverageDate", ">=", start),
            where("coverageDate", "<=", end),
            orderBy("coverageDate", "desc"),
            limit(1000)
        );
        
        let snap;
        try {
            snap = await getDocs(q);
        } catch (err: any) {
            console.warn("Summary optimized fetch failed, trying resilient fallback...", err.message);
            // FALLBACK: Simpler query without orderBy to bypass missing index errors
            const fallbackQ = query(
                collection(db!, "coverageEntries"),
                where("userId", "==", userId),
                limit(1000)
            );
            const fallbackSnap = await getDocs(fallbackQ);
            const filteredDocs = fallbackSnap.docs.filter(doc => {
                const val = String(doc.data().coverageDate || "");
                return val >= start && val <= end;
            });
            snap = { docs: filteredDocs, metadata: fallbackSnap.metadata };
        }

        const fetched = (snap.docs || []).map((d: any) => ({ id: d.id, ...d.data() } as CoverageEntry));
        
        // Ensure chronological sorting for UI components if fallback was used
        fetched.sort((a, b) => (b.coverageDate || b.submittedAt || "").localeCompare(a.coverageDate || a.submittedAt || ""));
        
        setSummaryEntries(fetched);
        setSyncSource(snap.metadata?.fromCache ? 'cache' : 'server');
        lastSummaryKeyRef.current = summaryKey;
    } catch (e) {
        console.warn("Summary fetch failed entirely:", e);
    }
  }, [userId, summaryEntries.length, selectedMonth, loadTrend]);

  useEffect(() => {
    if (includeSummary && userId && active) {
        const refDate = selectedMonth ? parseISO(selectedMonth + "-01") : new Date();
        const mEnd = endOfMonth(refDate).toISOString();
        const sStart = (loadTrend ? startOfMonth(subMonths(refDate, 2)) : startOfMonth(refDate)).toISOString();
        fetchSummaryEntries(sStart, mEnd);
    }
  }, [includeSummary, userId, active, selectedMonth, loadTrend, fetchSummaryEntries]);

  const fetchMasterEntries = useCallback(async (force = false, pageNumber = 1) => {
    if (!userId || !db || (!active && !force) || !navigator.onLine) return;
    
    const fetchKey = `${userId}_${selectedMonth || 'current'}`;
    const refDate = selectedMonth ? parseISO(selectedMonth + "-01") : new Date();
    
    const mStart = startOfMonth(refDate).toISOString();
    const mEnd = endOfMonth(refDate).toISOString();

    if (force || lastFetchedKeyRef.current !== fetchKey) {
        pageHistoryRef.current = [null];
        setCurrentPage(1);
        await fetchTotalCount(mStart, mEnd);
    } else if (pageNumber === 1) {
        await fetchTotalCount(mStart, mEnd);
    }

    setLoading(true);
    
    try {
        const qBase = query(
          collection(db!, "coverageEntries"), 
          where("userId", "==", userId),
          where("coverageDate", ">=", mStart),
          where("coverageDate", "<=", mEnd)
        );

        let q = query(qBase, orderBy("coverageDate", "desc"), limit(PAGE_SIZE));
        
        const cursor = pageHistoryRef.current[pageNumber - 1];
        if (cursor) {
            q = query(q, startAfter(cursor));
        }
        
        let querySnapshot;
        try {
            querySnapshot = await getDocs(q);
        } catch (err: any) {
            console.warn("Resilient fetch for master entries triggered...");
            const fallbackQ = query(collection(db!, "coverageEntries"), where("userId", "==", userId), limit(300));
            const fullSnap = await getDocs(fallbackQ);
            const filtered = fullSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as CoverageEntry))
                .filter(d => {
                    const v = String(d.coverageDate || "");
                    return v >= mStart && v <= mEnd;
                })
                .sort((a, b) => (b.coverageDate || "").localeCompare(a.coverageDate || ""));
            
            setMasterEntries(filtered.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE));
            setSyncSource(fullSnap.metadata.fromCache ? 'cache' : 'server');
            setLoading(false);
            return;
        }

        const fetched = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as CoverageEntry));
        
        setMasterEntries(fetched);
        setSyncSource(querySnapshot.metadata.fromCache ? 'cache' : 'server');
        
        if (querySnapshot.docs.length === PAGE_SIZE) {
            const nextCursor = querySnapshot.docs[querySnapshot.docs.length - 1];
            pageHistoryRef.current[pageNumber] = nextCursor;
        }
        
        setCurrentPage(pageNumber);
        lastFetchedKeyRef.current = fetchKey;
    } catch (error: any) {
        console.warn("Fetch reports failed:", error);
    } finally {
        setLoading(false);
    }
  }, [userId, active, selectedMonth, fetchTotalCount]);

  const goToNextPage = () => {
      if (currentPage * PAGE_SIZE < totalCount) {
          fetchMasterEntries(false, currentPage + 1);
      }
  };

  const goToPreviousPage = () => {
      if (currentPage > 1) {
          fetchMasterEntries(false, currentPage - 1);
      }
  };

  useEffect(() => {
    if (active && userId) {
        fetchMasterEntries();
    }
  }, [fetchMasterEntries, active, userId]);

  const refreshAllData = async () => {
    const refDate = selectedMonth ? parseISO(selectedMonth + "-01") : new Date();
    const mEnd = endOfMonth(refDate).toISOString();
    const sStart = (loadTrend ? startOfMonth(subMonths(refDate, 2)) : startOfMonth(refDate)).toISOString();
    
    await Promise.all([
        fetchMasterEntries(true),
        fetchSummaryEntries(sStart, mEnd, true)
    ]);
  };

  const saveEntry = async (entry: Omit<CoverageEntry, 'id' | 'submittedAt' | 'userId'>): Promise<boolean> => {
    if (!userId || !db) return false;
    
    const basePayload: any = {
      ...entry,
      userId: userId,
      submittedAt: new Date().toISOString(),
    };

    if (isOnline) {
        try {
            if (!auth?.currentUser) throw new Error("AUTH_EXPIRED");

            const { photos, signature, jointCallSignature, ...textData } = basePayload;
            const proofData = { photos, signature, jointCallSignature };
            
            const sanitizedText = sanitizePayload(textData);
            sanitizedText.migrationStatus = 'optimized';
            
            const mainDocRef = doc(collection(db!, "coverageEntries"));
            const batch = writeBatch(db!);
            batch.set(mainDocRef, sanitizedText);
            
            const proofDocRef = doc(db!, "coverageEntries", mainDocRef.id, "proofs", "data");
            batch.set(proofDocRef, sanitizePayload(proofData));
            
            await batch.commit();
            
            await refreshAllData();
            toast({ title: "Report Saved Successfully" });
            if (onSyncSuccess) onSyncSuccess();
            return true;
        } catch (error: any) {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'coverageEntries',
                operation: 'create',
                requestResourceData: basePayload,
            }));

            saveEntryOffline(basePayload);
            return false;
        }
    } else {
        saveEntryOffline(basePayload);
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
  }

  const syncAllOfflineEntries = useCallback(async () => {
    if (!isOnline || !userId || !db || isSyncInProgress.current) return;
    
    let currentOfflineQueue = [...offlineEntries];
    if (currentOfflineQueue.length === 0) return;
    
    if (!auth?.currentUser) return;

    isSyncInProgress.current = true;
    setIsSyncing(true);
    
    let successCount = 0;
    let expiredCount = 0;

    for (const entry of currentOfflineQueue) {
        try {
            const coverageDate = parseAnyDate(entry.coverageDate);
            if (coverageDate) {
                const deadline = getWeekFridayDeadline(coverageDate);
                if (isAfter(new Date(), deadline)) {
                    expiredCount++;
                    continue;
                }
            }

            if (!auth.currentUser) break;

            const { id, isOffline, ...rawData } = entry as any;
            const { photos, signature, jointCallSignature, ...textData } = rawData;
            const proofData = { photos, signature, jointCallSignature };
            
            const sanitizedText = sanitizePayload(textData);
            sanitizedText.migrationStatus = 'optimized';
            
            let finalSubmittedAt = sanitizedText.submittedAt || entry.submittedAt || new Date().toISOString();
            if (!parseAnyDate(finalSubmittedAt)) {
                finalSubmittedAt = new Date().toISOString();
            }
            sanitizedText.submittedAt = finalSubmittedAt;

            const mainDocRef = doc(collection(db!, "coverageEntries"));
            const batch = writeBatch(db!);
            batch.set(mainDocRef, sanitizedText);
            
            const proofDocRef = doc(db!, "coverageEntries", mainDocRef.id, "proofs", "data");
            batch.set(proofDocRef, sanitizePayload(proofData));
            
            await batch.commit();
            
            successCount++;
            setOfflineEntries(prev => {
                const next = prev.filter(item => item.id === entry.id ? false : true);
                safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify(next));
                return next;
            });

        } catch (error: any) {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'coverageEntries',
                operation: 'create',
                requestResourceData: entry,
            }));
        }
    }

    if (successCount > 0 || expiredCount > 0) {
        await refreshAllData();
        if (onSyncSuccess) onSyncSuccess();
        
        if (expiredCount > 0) {
            toast({ 
                variant: "destructive",
                title: "Sync Partial", 
                description: `${successCount} synced. ${expiredCount} reports blocked (Friday deadline).` 
            });
        } else {
            toast({ title: successCount === currentOfflineQueue.length ? "Sync Complete" : `Synced ${successCount} reports.` });
        }
    }

    setIsSyncing(false);
    isSyncInProgress.current = false;
  }, [isOnline, userId, offlineEntries, toast, onSyncSuccess, selectedMonth, loadTrend]);

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
    const proofDocRef = doc(db!, "coverageEntries", id, "proofs", "data");
    
    try {
        const batch = writeBatch(db!);
        batch.delete(docRef);
        batch.delete(proofDocRef);
        
        await batch.commit();
        
        await refreshAllData();
        toast({ title: "Report Deleted" });
        if (onSyncSuccess) onSyncSuccess();
    } catch (e: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete'
        }));
    }
  };

  const deleteOfflineEntry = (id: string) => {
    const updated = offlineEntries.filter(e => e.id !== id);
    setOfflineEntries(updated);
    safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.parse(JSON.stringify(updated)));
    toast({ title: "Offline report removed" });
  };

  const updateMasterEntry = async (e: any) => {
    if (!db) return;

    const sanitized = sanitizePayload(e);
    const { id, photos, signature, jointCallSignature, ...data } = sanitized;
    const docRef = doc(db!, "coverageEntries", id);
    
    if (data.submittedAt && !parseAnyDate(data.submittedAt)) {
        data.submittedAt = new Date().toISOString();
    }
    
    try {
        const batch = writeBatch(db!);
        batch.update(docRef, { ...data, migrationStatus: 'optimized' });
        
        const proofDocRef = doc(db!, "coverageEntries", id, "proofs", "data");
        batch.set(proofDocRef, { photos, signature, jointCallSignature }, { merge: true });
        
        await batch.commit();
        
        await refreshAllData();
        toast({ title: "Report Updated" });
        if (onSyncSuccess) onSyncSuccess();
    } catch (err: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: data
        }));
    }
  };

  return { 
    offlineEntries, 
    masterEntries, 
    summaryEntries,
    saveEntry, 
    deleteMasterEntry, 
    deleteOfflineEntry,
    isSyncing, 
    syncAllOfflineEntries, 
    isOnline, 
    updateMasterEntry, 
    loading,
    currentPage,
    totalCount,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
    goToNextPage,
    goToPreviousPage,
    fetchMasterEntries,
    syncSource,
    loadTrend,
    setLoadTrend,
    updateOfflineEntry: (e: any) => {
        const finalUpdate = { ...e };
        if (finalUpdate.submittedAt && !parseAnyDate(finalUpdate.submittedAt)) {
            finalUpdate.submittedAt = new Date().toISOString();
        }
        
        const updated = offlineEntries.map(item => item.id === e.id ? { ...item, ...finalUpdate } : item);
        setOfflineEntries(updated);
        safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify(updated));
    }
  };
};
