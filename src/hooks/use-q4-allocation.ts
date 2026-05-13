
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, query, writeBatch, doc, getDocs, limit, startAfter, orderBy, where } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { ADMIN_UIDS, ADMIN_EMAILS } from '@/lib/admins';
import { getStartOfYearISO } from '@/lib/utils';

// GLOBAL SESSION CACHE: Shared across all components and instances of the hook
let globalAllocationsCache: Q4Allocation[] | null = null;
let globalUsedQuantitiesCache: Record<string, number> | null = null;
let lastFetchTime: number = 0;
let isFetchingInProgress: boolean = false;
let fetchPromise: Promise<void> | null = null;

const CACHE_DURATION = 15 * 60 * 1000; // 15 Minutes

/**
 * Hook for managing inventory/allocations.
 * Fetches the master list from 'marketingSamples'.
 * NOTE: Usage calculation from 'coverageEntries' is temporarily disabled for performance.
 */
export const useQ4Allocation = (active: boolean = true) => {
  const { user, profile } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>(globalAllocationsCache || []);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>(globalUsedQuantitiesCache || {});
  const [loading, setLoading] = useState(!globalAllocationsCache && active);

  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    const email = (user.email ?? "").toLowerCase();
    return ADMIN_UIDS.includes(user.uid) || 
           email === 'mbustamante@hovidinc.com' || 
           ADMIN_EMAILS.some(e => (e ?? "").toLowerCase() === email) ||
           profile?.role === 'Admin' ||
           profile?.role === 'Manager';
  }, [user, profile]);

  const performFetch = useCallback(async (forceRefresh = false) => {
    if (!db || !user || (!active && !forceRefresh)) {
        setLoading(false);
        return;
    }

    const now = Date.now();
    if (!forceRefresh && globalAllocationsCache && (now - lastFetchTime < CACHE_DURATION)) {
        setAllocations(globalAllocationsCache);
        setUsedQuantities(globalUsedQuantitiesCache || {});
        setLoading(false);
        return;
    }

    // Request Locking
    if (isFetchingInProgress && fetchPromise && !forceRefresh) {
        setLoading(true);
        await fetchPromise;
        setAllocations(globalAllocationsCache || []);
        setUsedQuantities(globalUsedQuantitiesCache || {});
        setLoading(false);
        return;
    }

    isFetchingInProgress = true;
    setLoading(true);

    fetchPromise = (async () => {
        try {
            // 1. Fetch Master Inventory List
            const samplesSnapshot = await getDocs(collection(db!, "marketingSamples"));
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

            // 2. Usage Calculation (TEMPORARILY DISABLED FOR PERFORMANCE)
            const usage: Record<string, number> = {};
            
            /* 
               The following section is disabled to prevent Quota Exceeded errors.
               Usage counts will reflect 0 until summary documents or optimized 
               aggregation logic is implemented.
            */

            // Update Global Persistence Cache
            globalAllocationsCache = fetchedAllocations;
            globalUsedQuantitiesCache = usage;
            lastFetchTime = Date.now();

            setAllocations(fetchedAllocations);
            setUsedQuantities(usage);
        } catch (error) {
            console.error("Inventory fetch failed:", error);
        } finally {
            isFetchingInProgress = false;
            fetchPromise = null;
        }
    })();

    await fetchPromise;
    setLoading(false);
  }, [user, active]);

  useEffect(() => {
    if (active) {
        performFetch();
    }
  }, [performFetch, active]);

  return { 
    allocations, 
    usedQuantities, 
    loading, 
    refetch: () => performFetch(true),
    addAllocationsBulk: async (data: Omit<Q4Allocation, 'id'>[]) => {
        if (!db) return false;
        try {
          const batch = writeBatch(db);
          data.forEach(item => {
            const name = (item.displayMaterialName ?? "").toString().trim();
            if (!name) return;
            const cleanId = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const docRef = doc(db!, "marketingSamples", `sample_${cleanId}`);
            batch.set(docRef, { ...item }, { merge: true });
          });
          await batch.commit();
          await performFetch(true);
          return true;
        } catch (err) { return false; }
    },
    deleteAllocationsBulk: async (ids: string[]) => {
        if (!db) return false;
        const batch = writeBatch(db);
        ids.forEach(id => { if (id) batch.delete(doc(db!, "marketingSamples", id)); });
        try { 
            await batch.commit(); 
            await performFetch(true); 
            return true; 
        } catch (err) { return false; }
    }
  };
};
