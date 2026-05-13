
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, query, writeBatch, doc, getDocs, limit, startAfter, orderBy } from 'firebase/firestore';
import { useAuth } from './use-auth';

/**
 * Hook for managing inventory/allocations.
 * Fetches the master list from 'marketingSamples'.
 * Calculates global usage by scanning ALL historical 'coverageEntries' from ALL PMRs.
 */
export const useQ4Allocation = () => {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const performFetch = useCallback(async () => {
    if (!db || !user) {
        setLoading(false);
        return;
    }

    setLoading(true);

    try {
        // 1. Fetch Master Inventory List from 'marketingSamples'
        const samplesSnapshot = await getDocs(collection(db, "marketingSamples"));
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
        setAllocations(fetchedAllocations);

        // 2. Fetch Global Usage from ALL PMRs (Exhaustive Scan)
        // We use chunked fetching (1,000 at a time) to prevent timeouts and handle large datasets
        const usage: Record<string, number> = {};
        const entriesCol = collection(db, "coverageEntries");
        let lastVisible = null;
        let hasMore = true;

        while (hasMore) {
            let q = query(entriesCol, orderBy("__name__"), limit(1000));
            if (lastVisible) {
                q = query(entriesCol, orderBy("__name__"), startAfter(lastVisible), limit(1000));
            }
            
            const snap = await getDocs(q);
            
            if (snap.empty) {
                hasMore = false;
            } else {
                snap.docs.forEach(docSnap => {
                    const entry = docSnap.data() as CoverageEntry;
                    if (!entry) return;

                    // ACCURACY: Aggregate quantities ONLY from primary and secondary fields as requested
                    const processItem = (name?: string, qty?: number) => {
                        const safeName = String(name ?? "").toLowerCase().trim();
                        if (!safeName) return;
                        const safeQty = Math.round(Number(qty || 0));
                        if (!isNaN(safeQty) && safeQty !== 0) {
                            usage[safeName] = (usage[safeName] || 0) + safeQty;
                        }
                    };

                    processItem(entry.primarySampleName, entry.primaryProductQty);
                    processItem(entry.secondarySampleName, entry.secondaryProductQty);
                });

                lastVisible = snap.docs[snap.docs.length - 1];
                if (snap.docs.length < 1000) hasMore = false;
            }
        }

        setUsedQuantities(usage);
    } catch (error) {
        console.error("Exhaustive Inventory fetch failed:", error);
    } finally {
        setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (mounted) performFetch();
  }, [mounted, performFetch]);

  return { 
    allocations, 
    usedQuantities, 
    loading, 
    refetch: performFetch,
    addAllocationsBulk: async (data: Omit<Q4Allocation, 'id'>[]) => {
        if (!db) return false;
        try {
          const batch = writeBatch(db);
          data.forEach(item => {
            const name = (item.displayMaterialName ?? "").toString().trim();
            if (!name) return;
            // Create predictable IDs based on material name for easy updates/upserts
            const cleanId = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const docRef = doc(db, "marketingSamples", `sample_${cleanId}`);
            batch.set(docRef, { ...item }, { merge: true });
          });
          await batch.commit();
          await performFetch();
          return true;
        } catch (err) { return false; }
    },
    deleteAllocationsBulk: async (ids: string[]) => {
        if (!db) return false;
        const batch = writeBatch(db);
        ids.forEach(id => { if (id) batch.delete(doc(db, "marketingSamples", id)); });
        try { 
            await batch.commit(); 
            await performFetch(); 
            return true; 
        } catch (err) { return false; }
    }
  };
};
