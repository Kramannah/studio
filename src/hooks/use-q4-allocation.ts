
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Q4Allocation } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { useAuth } from './use-auth';

// GLOBAL SESSION CACHE: Shared across all instances to prevent redundant material list reads
let globalAllocationsCache: Q4Allocation[] | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 Minutes

/**
 * Hook for managing inventory/allocations.
 * Optimized to strictly display the catalog from 'marketingSamples'.
 * Historical usage calculations are disabled to preserve Firestore quota.
 */
export const useQ4Allocation = (active: boolean = true) => {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>(globalAllocationsCache || []);
  const [loading, setLoading] = useState(!globalAllocationsCache && active);

  const performFetch = useCallback(async (forceRefresh = false) => {
    if (!db || !user || (!active && !forceRefresh)) {
        setLoading(false);
        return;
    }

    const now = Date.now();
    if (!forceRefresh && globalAllocationsCache && (now - lastFetchTime < CACHE_DURATION)) {
        setAllocations(globalAllocationsCache);
        setLoading(false);
        return;
    }

    setLoading(true);
    try {
        // Simple fetch of the master catalog with a safe limit
        const samplesSnapshot = await getDocs(query(collection(db!, "marketingSamples"), limit(1000)));
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

        // Update Global Persistence Cache
        globalAllocationsCache = fetchedAllocations;
        lastFetchTime = Date.now();

        setAllocations(fetchedAllocations);
    } catch (error) {
        console.warn("Marketing samples catalog fetch limited");
    } finally {
        setLoading(false);
    }
  }, [user, active]);

  useEffect(() => {
    if (active) {
        performFetch();
    }
  }, [performFetch, active]);

  return { 
    allocations, 
    usedQuantities: {} as Record<string, number>, // Usage tracking disabled for performance
    loading, 
    refetch: () => performFetch(true)
  };
};
