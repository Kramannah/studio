
"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc, limit, orderBy, startAfter, getCountFromServer, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { safeStorageSet, parseAnyDate, getWeekFridayDeadline } from '@/lib/utils';
import { format, subMonths, startOfMonth, endOfMonth, isValid, parseISO, isAfter } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { compressImage } from '@/lib/storage-utils';

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

export const useOfflineSync = (userId?: string, active: boolean = true, selectedMonth?: string, onSyncSuccess?: () => void) => {
  const { toast } = useToast();
  const [offlineEntries, setOfflineEntries] = useState<CoverageEntry[]>([]);
  const [masterEntries, setMasterEntries] = useState<CoverageEntry[]>([]); // Paginated subset
  const [summaryEntries, setSummaryEntries] = useState<CoverageEntry[]>([]); // Full month for stats
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Use a ref for cursors to avoid infinite loops in useEffect
  const pageHistoryRef = useRef<(QueryDocumentSnapshot<DocumentData> | null)[]>([null]);
  
  const isSyncInProgress = useRef(false);
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
        console.error("Count fetch failed:", e);
    }
  }, [userId]);

  const fetchSummaryEntries = useCallback(async (start: string, end: string) => {
    if (!userId || !db) return;
    try {
        const q = query(
            collection(db!, "coverageEntries"),
            where("userId", "==", userId),
            where("coverageDate", ">=", start),
            where("coverageDate", "<=", end),
            orderBy("coverageDate", "desc"),
            limit(1000)
        );
        const snap = await getDocs(q);
        const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as CoverageEntry));
        setSummaryEntries(fetched);
    } catch (e) {
        console.error("Summary fetch failed:", e);
    }
  }, [userId]);

  const fetchMasterEntries = useCallback(async (force = false, pageNumber = 1) => {
    if (!userId || !db || (!active && !force) || !navigator.onLine) return;
    
    const fetchKey = `${userId}_${selectedMonth || 'current'}`;
    const refDate = selectedMonth ? parseISO(selectedMonth + "-01") : new Date();
    const start = startOfMonth(subMonths(refDate, 1)).toISOString();
    const end = endOfMonth(refDate).toISOString();

    // Reset history and counters if month changed or forced
    if (force || lastFetchedKeyRef.current !== fetchKey) {
        pageHistoryRef.current = [null];
        setCurrentPage(1);
        await Promise.all([
            fetchTotalCount(start, end),
            fetchSummaryEntries(start, end)
        ]);
    } else if (pageNumber === 1) {
        // Refresh counts on first page even if not forced
        await Promise.all([
            fetchTotalCount(start, end),
            fetchSummaryEntries(start, end)
        ]);
    }

    setLoading(true);
    
    try {
        let q = query(
          collection(db!, "coverageEntries"), 
          where("userId", "==", userId),
          where("coverageDate", ">=", start),
          where("coverageDate", "<=", end),
          orderBy("coverageDate", "desc"),
          limit(PAGE_SIZE)
        );
        
        const cursor = pageHistoryRef.current[pageNumber - 1];
        if (cursor) {
            q = query(q, startAfter(cursor));
        }
        
        const querySnapshot = await getDocs(q);
        const fetched = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as CoverageEntry));
        
        setMasterEntries(fetched);
        
        // Store next cursor for future pages
        if (querySnapshot.docs.length === PAGE_SIZE) {
            const nextCursor = querySnapshot.docs[querySnapshot.docs.length - 1];
            pageHistoryRef.current[pageNumber] = nextCursor;
        }
        
        setCurrentPage(pageNumber);
        lastFetchedKeyRef.current = fetchKey;
    } catch (error: any) {
        console.error("Fetch reports failed:", error);
    } finally {
        setLoading(false);
    }
  }, [userId, active, selectedMonth, fetchTotalCount, fetchSummaryEntries]);

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
            fetchMasterEntries(true);
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

            const { id, isOffline, migrationStatus, ...dataToSync } = entry as any;
            const sanitized = sanitizePayload(dataToSync);
            
            let finalSubmittedAt = sanitized.submittedAt || entry.submittedAt || new Date().toISOString();
            if (!parseAnyDate(finalSubmittedAt)) {
                finalSubmittedAt = new Date().toISOString();
            }
            
            const finalData = {
                ...sanitized,
                submittedAt: finalSubmittedAt
            };
            
            await addDoc(collection(db!, "coverageEntries"), finalData);
            
            successCount++;
            setOfflineEntries(prev => {
                const next = prev.filter(item => item.id !== entry.id);
                safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify(next));
                return next;
            });

        } catch (error: any) {
            console.error(`Sync failed for report ${entry.id}:`, error);
        }
    }

    if (successCount > 0 || expiredCount > 0) {
        fetchMasterEntries(true);
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
        fetchMasterEntries(true);
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

  const deleteOfflineEntry = (id: string) => {
    const updated = offlineEntries.filter(e => e.id !== id);
    setOfflineEntries(updated);
    safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify(updated));
    toast({ title: "Offline report removed" });
  };

  const updateMasterEntry = async (e: any) => {
    if (!db) return;

    let processedPhotos = e.photos;
    if (e.photos && e.photos.length > 0) {
        try {
            processedPhotos = await Promise.all(e.photos.map((p: string) => compressImage(p, 800, 0.5)));
        } catch (err) { console.warn("Update compression failed", err); }
    }

    const sanitized = sanitizePayload({ ...e, photos: processedPhotos });
    const { id, ...data } = sanitized;
    const docRef = doc(db!, "coverageEntries", id);
    
    if (data.submittedAt && !parseAnyDate(data.submittedAt)) {
        data.submittedAt = new Date().toISOString();
    }
    
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
