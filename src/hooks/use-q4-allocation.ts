
"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, limit, query, where, writeBatch, doc, orderBy } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { ADMIN_UIDS, ADMIN_EMAILS } from '@/lib/admins';
import { getStartOfYearISO } from '@/lib/utils';

let cachedAllocations: Q4Allocation[] | null = null;
let lastAllocationFetch: number = 0;
const ALLOCATION_CACHE_TTL = 30 * 60 * 1000;
const ALLOCATIONS_STORAGE_KEY = 'sfe-allocations-v4';
const USED_QUANTITIES_STORAGE_KEY = 'sfe-used-quantities-v4';

/**
 * [LOW_COST_UPDATE] 
 * Optimized to reduce reads by caching allocations and capping usage scans to the current year.
 * [INDEX_FIX] Removed server-side date filtering when combined with userId to avoid composite index requirement.
 */
export const useQ4Allocation = (active: boolean = true, includeUsage: boolean = false) => {
  const { user, profile } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>(cachedAllocations || []);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(!cachedAllocations && active);
  
  const usageFetchedRef = useRef(false);

  const getStoreKey = (base: string) => `${base}_${user?.uid}`;

  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    const email = (user.email ?? "").toLowerCase();
    return ADMIN_UIDS.includes(user.uid) || 
           ADMIN_EMAILS.some(e => (e ?? "").toLowerCase() === email) ||
           profile?.role === 'Admin';
  }, [user, profile]);

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

    // Use singleton cache for the material list (shared across app)
    if (!force && cachedAllocations && (now - lastAllocationFetch < ALLOCATION_CACHE_TTL)) {
        setAllocations(cachedAllocations);
        if (!includeUsage || usageFetchedRef.current) {
            setLoading(false);
            return;
        }
    }

    if (!isOnline) {
        setLoading(false);
        return;
    }

    if (allocations.length === 0) setLoading(true);

    try {
        const samplesSnapshot = await getDocs(query(collection(db!, "marketingSamples"), limit(5000)));

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

        if (includeUsage && !usageFetchedRef.current) {
            const used: Record<string, number> = {};
            const canDoGlobalFetch = isUserAdmin || (profile?.role && ['Manager', 'Admin', 'Marketing'].includes(profile.role));

            // [LOW_COST_UPDATE] Cap usage scan to current year only
            const startOfYear = getStartOfYearISO();
            
            let entriesSnap;
            if (canDoGlobalFetch) {
                // [INDEX_SAFE] Querying only by date works with a single-field index
                entriesSnap = await getDocs(query(
                    collection(db!, "coverageEntries"), 
                    where("coverageDate", ">=", startOfYear),
                    limit(5000) 
                ));
            } else {
                // [INDEX_FIX] To avoid composite index error, query by userId only and filter by date in memory
                entriesSnap = await getDocs(query(
                    collection(db!, "coverageEntries"), 
                    where("userId", "==", user.uid),
                    limit(2000)
                ));
            }

            entriesSnap.docs.forEach(d => {
                const data = d.data() as CoverageEntry;
                
                // [CLIENT_SIDE_FILTER] Ensure we only count current year usage if we fetched by userId only
                if (!canDoGlobalFetch) {
                    const coverageDate = data.coverageDate || data.submittedAt;
                    if (!coverageDate || coverageDate < startOfYear) return;
                }

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
                if (data.reminderProducts) {
                    data.reminderProducts.forEach(rp => rp?.sampleName && process(rp.sampleName, rp.quantity));
                }
            });
            setUsedQuantities(used);
            usageFetchedRef.current = true;
            try {
                localStorage.setItem(getStoreKey(USED_QUANTITIES_STORAGE_KEY), JSON.stringify(used));
            } catch (e) {}
        }

    } catch (error) {
        // [INDEX_FIX] Silent reporting to the global emitter
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'marketingSamples-usage',
            operation: 'list',
        }));
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
    data.forEach(item => batch.set(doc(collection(db!, "marketingSamples")), item));
    try {
        await batch.commit();
        await performFetch(true);
        return true;
    } catch (e) { return false; }
  };

  const deleteAllocationsBulk = async (ids: string[]) => {
    if (!db) return false;
    const batch = writeBatch(db!);
    ids.forEach(id => batch.delete(doc(db!, "marketingSamples", id)));
    try {
        await batch.commit();
        await performFetch(true);
        return true;
    } catch (e) { return false; }
  };

  return { 
    allocations, 
    usedQuantities, 
    loading, 
    refetch: () => {
        usageFetchedRef.current = false;
        performFetch(true);
    },
    addAllocationsBulk,
    deleteAllocationsBulk
  };
};
