"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc, limit, orderBy, startAfter, getCountFromServer, QueryDocumentSnapshot, DocumentData, getDoc } from 'firebase/firestore';
import { safeStorageSet, parseAnyDate, getWeekFridayDeadline } from '@/lib/utils';
import { format, subMonths, startOfMonth, endOfMonth, isValid, parseISO, isAfter } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { compressImage, uploadBase64ToStorage, deleteStorageFile } from '@/lib/storage-utils';

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
  const [masterEntries, setMasterEntries] = useState<CoverageEntry[]>([]); 
  const [summaryEntries, setSummaryEntries] = useState<CoverageEntry[]>([]); 
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
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
        console.warn("Count fetch failed:", e);
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
        console.warn("Summary fetch failed:", e);
    }
  }, [userId]);

  const fetchMasterEntries = useCallback(async (force = false, pageNumber = 1) => {
    if (!userId || !db || (!active && !force) || !navigator.onLine) return;
    
    const fetchKey = `${userId}_${selectedMonth || 'current'}`;
    const refDate = selectedMonth ? parseISO(selectedMonth + "-01") : new Date();
    const start = startOfMonth(subMonths(refDate, 1)).toISOString();
    const end = endOfMonth(refDate).toISOString();

    if (force || lastFetchedKeyRef.current !== fetchKey) {
        pageHistoryRef.current = [null];
        setCurrentPage(1);
        await Promise.all([
            fetchTotalCount(start, end),
            fetchSummaryEntries(start, end)
        ]);
    } else if (pageNumber === 1) {
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
    
    // COMPRESSION
    let processedPhotos = entry.photos;
    if (entry.photos && entry.photos.length > 0) {
        try {
            processedPhotos = await Promise.all(entry.photos.map(p => compressImage(p, 800, 0.5)));
        } catch (e) { console.warn("Compression failed, using raw", e); }
    }

    let processedSig = entry.signature;
    if (processedSig && processedSig.startsWith('data:image')) {
        try { processedSig = await compressImage(processedSig, 400, 0.4); } catch(e) {}
    }

    let processedJointSig = entry.jointCallSignature;
    if (processedJointSig && processedJointSig.startsWith('data:image')) {
        try { processedJointSig = await compressImage(processedJointSig, 400, 0.4); } catch(e) {}
    }

    const basePayload: any = {
      ...entry,
      photos: processedPhotos,
      signature: processedSig,
      jointCallSignature: processedJointSig,
      userId: userId,
      submittedAt: new Date().toISOString(),
    };

    if (isOnline) {
        try {
            // AUTH GATE: Verify valid session before storage upload
            if (!auth?.currentUser) throw new Error("AUTH_EXPIRED");

            if (processedPhotos && processedPhotos.length > 0) {
                basePayload.photos = await Promise.all(processedPhotos.map((p, i) => {
                    if (p.startsWith('data:image')) {
                        const path = `coverage/${userId}/${Date.now()}_photo_${i}.jpg`;
                        return uploadBase64ToStorage(p, path);
                    }
                    return p;
                }));
            }

            if (processedSig && processedSig.startsWith('data:image')) {
                const path = `signatures/${userId}/${Date.now()}_md_sig.jpg`;
                basePayload.signature = await uploadBase64ToStorage(processedSig, path);
            }

            if (processedJointSig && processedJointSig.startsWith('data:image')) {
                const path = `signatures/${userId}/${Date.now()}_joint_sig.jpg`;
                basePayload.jointCallSignature = await uploadBase64ToStorage(processedJointSig, path);
            }

            const sanitized = sanitizePayload(basePayload);
            await addDoc(collection(db!, "coverageEntries"), sanitized);
            
            await fetchMasterEntries(true);
            toast({ title: "Report Saved Successfully" });
            if (onSyncSuccess) onSyncSuccess();
            return true;
        } catch (error: any) {
            console.warn("Submission failed, rerouting to offline queue:", error);
            // SURFACE DETAILED ERROR
            toast({ 
              variant: 'destructive', 
              title: "Sync Redirected", 
              description: `Submission failed (${error.code || error.message || 'Permission denied'}). Your report is safe in the 'Offline Calls' tab.` 
            });
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
    
    // AUTH GATE: Pause sync if session is lost
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

            // SAFETY: Double-check auth inside the loop
            if (!auth.currentUser) break;

            const { id, isOffline, migrationStatus, ...dataToSync } = entry as any;
            
            if (dataToSync.photos && dataToSync.photos.length > 0) {
                dataToSync.photos = await Promise.all(dataToSync.photos.map((p: string, i: number) => {
                    if (p.startsWith('data:image')) {
                        const path = `coverage/${userId}/${Date.now()}_sync_photo_${i}.jpg`;
                        return uploadBase64ToStorage(p, path);
                    }
                    return p;
                }));
            }

            if (dataToSync.signature && dataToSync.signature.startsWith('data:image')) {
                const path = `signatures/${userId}/${Date.now()}_sync_sig.jpg`;
                dataToSync.signature = await uploadBase64ToStorage(dataToSync.signature, path);
            }

            if (dataToSync.jointCallSignature && dataToSync.jointCallSignature.startsWith('data:image')) {
                const path = `signatures/${userId}/${Date.now()}_sync_joint_sig.jpg`;
                dataToSync.jointCallSignature = await uploadBase64ToStorage(dataToSync.jointCallSignature, path);
            }

            const sanitized = sanitizePayload(dataToSync);
            
            let finalSubmittedAt = sanitized.submittedAt || entry.submittedAt || new Date().toISOString();
            if (!parseAnyDate(finalSubmittedAt)) {
                finalSubmittedAt = new Date().toISOString();
            }
            
            const finalData = { ...sanitized, submittedAt: finalSubmittedAt };
            await addDoc(collection(db!, "coverageEntries"), finalData);
            
            successCount++;
            setOfflineEntries(prev => {
                const next = prev.filter(item => item.id === entry.id ? false : true);
                safeStorageSet(`${OFFLINE_ENTRIES_KEY}_${userId}`, JSON.stringify(next));
                return next;
            });

        } catch (error: any) {
            console.warn(`Individual report sync failed (id: ${entry.id}). Retrying later.`, error);
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
    
    try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = snap.data() as CoverageEntry;
            if (data.photos) await Promise.all(data.photos.map(p => deleteStorageFile(p)));
            if (data.signature) await deleteStorageFile(data.signature);
            if (data.jointCallSignature) await deleteStorageFile(data.jointCallSignature);
        }

        await deleteDoc(docRef);
        fetchMasterEntries(true);
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

    let processedPhotos = e.photos;
    if (e.photos && e.photos.length > 0) {
        processedPhotos = await Promise.all(e.photos.map(async (p: string, i: number) => {
            if (p.startsWith('data:image')) {
                const compressed = await compressImage(p, 800, 0.5);
                const path = `coverage/${userId}/${Date.now()}_upd_photo_${i}.jpg`;
                return uploadBase64ToStorage(compressed, path);
            }
            return p;
        }));
    }

    let processedSig = e.signature;
    if (processedSig && processedSig.startsWith('data:image')) {
        const compressed = await compressImage(processedSig, 400, 0.4);
        const path = `signatures/${userId}/${Date.now()}_upd_sig.jpg`;
        processedSig = await uploadBase64ToStorage(compressed, path);
    }

    let processedJointSig = e.jointCallSignature;
    if (processedJointSig && processedJointSig.startsWith('data:image')) {
        const compressed = await compressImage(processedJointSig, 400, 0.4);
        const path = `signatures/${userId}/${Date.now()}_upd_joint_sig.jpg`;
        processedJointSig = await uploadBase64ToStorage(compressed, path);
    }

    const payload = { 
        ...e, 
        photos: processedPhotos, 
        signature: processedSig, 
        jointCallSignature: processedJointSig 
    };
    
    const sanitized = sanitizePayload(payload);
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
