"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, limit, query, where, writeBatch, doc } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { ADMIN_UIDS, ADMIN_EMAILS } from '@/lib/admins';

// SINGLETON CACHE
let cachedAllocations: Q4Allocation[] | null = null;
let lastAllocationFetch: number = 0;
const ALLOCATION_CACHE_TTL = 30 * 60 * 1000; // 30 Minutes
const ALLOCATIONS_STORAGE_KEY = 'sfe-allocations-v4';
const USED_QUANTITIES_STORAGE_KEY = 'sfe-used-quantities-v4';

export const useQ4Allocation = (active: boolean = true, includeUsage: boolean = false) => {
  const { user, profile } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>(cachedAllocations || []);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(!cachedAllocations && active);

  const getStoreKey = (base: string) => `${base}_${user?.uid}`;

  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    const email = (user.email ?? "").toLowerCase();
    return ADMIN_UIDS.includes(user.uid) || 
           ADMIN_EMAILS.some(e => (e ?? "").toLowerCase() === email) ||
           profile?.role === 'Admin';
  }, [user, profile]);

  // Load from local storage on mount
  useEffect(() => {
      if (user?.uid) {
          try {
              const localAlloc = localStorage.getItem(getStoreKey(ALLOCATIONS_STORAGE_KEY));
              const localUsed = localStorage.getItem(getStoreKey(USED_QUANTITIES_STORAGE_KEY));
              if (localAlloc) setAllocations(JSON.parse(localAlloc));
              if (localUsed) setUsedQuantities(JSON.parse(localUsed));
          } catch (e) {}
      }
  }, [user?.uid]);

  const performFetch = useCallback(async (force = false) => {
    if (!db || !user || !active) {
        setLoading(false);
        return;
    }

    const now = Date.now();
    const isOnline = navigator.onLine;

    if (!force && cachedAllocations && (now - lastAllocationFetch < ALLOCATION_CACHE_TTL)) {
        setAllocations(cachedAllocations);
        setLoading(false);
        if (!includeUsage) return;
    }

    if (!isOnline) {
        setLoading(false);
        return;
    }

    // [SILENT_REFRESH_LOGIC] - Only show loader if allocations list is empty
    if (allocations.length === 0) {
        setLoading(true);
    }

    try {
        const samplesSnapshot = await getDocs(query(collection(db!, "marketingSamples"), limit(10000)))
            .catch(async (e) => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: 'marketingSamples',
                    operation: 'list'
                }));
                throw e;
            });

        const fetchedAllocations = samplesSnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            const materialName = (data.displayMaterialName || data.materialName || "Unknown Item").toString().trim();
            const group = (data.prodGroupProdSubGroup || data.productGroup || "Uncategorized").toString().trim();
            const qty = Number(data.allocationQuantity || 0);
            return { 
                id: docSnap.id, 
                prodGroupProdSubGroup: group, 
                displayMaterialName: materialName, 
                allocationQuantity: isNaN(qty) ? 0 : qty 
            } as Q4Allocation;
        });
        
        fetchedAllocations.sort((a, b) => a.displayMaterialName.toLowerCase().localeCompare(b.displayMaterialName.toLowerCase()));

        cachedAllocations = fetchedAllocations;
        lastAllocationFetch = now;
        setAllocations(fetchedAllocations);
        
        try {
            localStorage.setItem(getStoreKey(ALLOCATIONS_STORAGE_KEY), JSON.stringify(fetchedAllocations));
        } catch (e) {}

        if (includeUsage) {
            const used: Record<string, number> = {};
            let entriesSnap;
            const canDoGlobalFetch = isUserAdmin || (profile?.role && ['Manager', 'Admin'].includes(profile.role));

            const baseQuery = collection(db!, "coverageEntries");
            if (canDoGlobalFetch) {
                entriesSnap = await getDocs(query(baseQuery, limit(10000)));
            } else {
                entriesSnap = await getDocs(query(baseQuery, where("userId", "==", user.uid), limit(10000)));
            }

            entriesSnap.docs.forEach(d => {
                const data = d.data() as CoverageEntry;
                const process = (name?: string, qty?: number) => {
                    const key = String(name ?? "").toLowerCase().trim();
                    if (!key) return;
                    const q = Math.round(Number(qty || 0));
                    if (!isNaN(q) && q !== 0) {
                        used[key] = (used[key] || 0) + q;
                    }
                };

                process(data.primarySampleName, data.primaryProductQty);
                process(data.secondarySampleName, data.secondaryProductQty);
                
                if (data.reminderProducts && Array.isArray(data.reminderProducts)) {
                    data.reminderProducts.forEach(rp => {
                        if (rp && rp.sampleName) {
                            process(rp.sampleName, rp.quantity);
                        }
                    });
                }
            });
            setUsedQuantities(used);
            try {
                localStorage.setItem(getStoreKey(USED_QUANTITIES_STORAGE_KEY), JSON.stringify(used));
            } catch (e) {}
        }

    } catch (error) {
        console.error("Inventory fetch failed:", error);
    } finally {
        setLoading(false);
    }
  }, [user, isUserAdmin, profile, active, includeUsage, allocations.length]);

  useEffect(() => {
    if (active) {
        performFetch();
    }
  }, [performFetch, active]);

  const addAllocationsBulk = async (data: Omit<Q4Allocation, 'id'>[]) => {
    if (!db) return false;
    const batch = writeBatch(db!);
    data.forEach(item => {
        const ref = doc(collection(db!, "marketingSamples"));
        batch.set(ref, item);
    });
    try {
        await batch.commit();
        await performFetch(true);
        return true;
    } catch (serverError: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'marketingSamples',
            operation: 'write'
        }));
        return false;
    }
  };

  const deleteAllocationsBulk = async (ids: string[]) => {
    if (!db) return false;
    const batch = writeBatch(db!);
    ids.forEach(id => batch.delete(doc(db!, "marketingSamples", id)));
    try {
        await batch.commit();
        await performFetch(true);
        return true;
    } catch (serverError: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'marketingSamples',
            operation: 'delete'
        }));
        return false;
    }
  };

  return { 
    allocations, 
    usedQuantities, 
    loading, 
    refetch: () => performFetch(true),
    addAllocationsBulk,
    deleteAllocationsBulk
  };
};
