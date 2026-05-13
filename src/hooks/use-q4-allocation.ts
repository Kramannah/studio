
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, query, writeBatch, doc, where, getDocs, limit, startAfter, orderBy } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { ADMIN_UIDS, ADMIN_EMAILS } from '@/lib/admins';

// GLOBAL SESSION CACHE (Survives tab switching and component remounts)
let globalInventoryCache: {
    allocations: Q4Allocation[];
    usedQuantities: Record<string, number>;
    lastFetch: number;
} | null = null;

let isGlobalFetching = false;

/**
 * Hook for managing inventory/allocations.
 * Strictly fetches from 'marketingSamples' collection.
 * Usage is calculated by scanning ALL historical 'coverageEntries'.
 */
export const useQ4Allocation = () => {
  const { user, profile } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>(globalInventoryCache?.allocations || []);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>(globalInventoryCache?.usedQuantities || {});
  const [loading, setLoading] = useState(!globalInventoryCache);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isAdminOrManager = useMemo(() => {
    if (!user) return false;
    const email = (user.email ?? "").toString().toLowerCase().trim();
    if (!email) return false;
    
    return ADMIN_UIDS.includes(user.uid) || 
           ADMIN_EMAILS.some(e => (e ?? "").toString().toLowerCase().trim() === email) ||
           profile?.role === 'Admin' ||
           profile?.role === 'Manager';
  }, [user, profile]);

  const performFetch = useCallback(async (force = false) => {
    if (!db || !user) {
        setLoading(false);
        return;
    }

    // Return cached data if it's fresh (within 5 minutes) and not forced
    const now = Date.now();
    if (!force && globalInventoryCache && (now - globalInventoryCache.lastFetch < 300000)) {
        setAllocations(globalInventoryCache.allocations);
        setUsedQuantities(globalInventoryCache.usedQuantities);
        setLoading(false);
        return;
    }

    if (isGlobalFetching) return;
    isGlobalFetching = true;
    setLoading(true);

    try {
        // 1. Fetch Master Inventory
        const snapshot = await getDocs(collection(db, "marketingSamples"));
        const fetched = snapshot.docs.map(doc => {
            const data = doc.data();
            if (!data) return null;
            const materialName = (data.displayMaterialName ?? data.materialName ?? "Unknown Item").toString().trim();
            const group = (data.prodGroupProdSubGroup ?? data.productGroup ?? "Uncategorized").toString().trim();
            const qty = Number(data.allocationQuantity || 0);
            return { 
                id: doc.id, 
                prodGroupProdSubGroup: group, 
                displayMaterialName: materialName, 
                allocationQuantity: isNaN(qty) ? 0 : qty 
            } as Q4Allocation;
        }).filter((item): item is Q4Allocation => item !== null);
        
        fetched.sort((a, b) => (a.displayMaterialName || "").toLowerCase().localeCompare((b.displayMaterialName || "").toLowerCase()));
        
        // 2. Fetch Exhaustive Usage from coverageEntries
        const colRef = collection(db, "coverageEntries");
        const usage: Record<string, number> = {};
        
        const processDocs = (docs: any[]) => {
            docs.forEach(docSnap => {
                const entry = docSnap.data() as CoverageEntry;
                if (!entry) return;

                const processItem = (name?: string, qty?: number) => {
                    const safeName = String(name ?? "").toLowerCase().trim();
                    if (!safeName) return;
                    const safeQty = Math.round(Number(qty || 0));
                    if (!isNaN(safeQty) && safeQty !== 0) {
                        usage[safeName] = (usage[safeName] || 0) + safeQty;
                    }
                };

                // ACCURACY: Aggregating from primary and secondary fields as requested
                processItem(entry.primarySampleName, entry.primaryProductQty);
                processItem(entry.secondarySampleName, entry.secondaryProductQty);
            });
        };

        if (isAdminOrManager) {
            // QUOTA PROTECTION: Chunked fetch for massive audits
            let lastVisible = null;
            let hasMore = true;
            
            while (hasMore) {
                let q = query(colRef, orderBy("__name__"), limit(1000));
                if (lastVisible) {
                    q = query(colRef, orderBy("__name__"), startAfter(lastVisible), limit(1000));
                }
                
                const snap = await getDocs(q);
                if (snap.empty) {
                    hasMore = false;
                } else {
                    processDocs(snap.docs);
                    lastVisible = snap.docs[snap.docs.length - 1];
                    if (snap.docs.length < 1000) hasMore = false;
                }
            }
        } else {
            // Individual PMR fetch (Exhaustive)
            const snap = await getDocs(query(colRef, where("userId", "==", user.uid)));
            processDocs(snap.docs);
        }
        
        // Update state and global cache
        const finalAllocations = fetched;
        const finalUsage = usage;

        globalInventoryCache = {
            allocations: finalAllocations,
            usedQuantities: finalUsage,
            lastFetch: Date.now()
        };

        setAllocations(finalAllocations);
        setUsedQuantities(finalUsage);
    } catch (error) {
        console.error("Critical Inventory fetch failed:", error);
    } finally {
        setLoading(false);
        isGlobalFetching = false;
    }
  }, [user, isAdminOrManager]);

  useEffect(() => {
    if (mounted) performFetch();
  }, [mounted, performFetch]);

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
            const docRef = doc(db, "marketingSamples", `sample_${cleanId}`);
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
        ids.forEach(id => { if (id) batch.delete(doc(db, "marketingSamples", id)); });
        try { 
            await batch.commit(); 
            await performFetch(true); 
            return true; 
        } catch (err) { return false; }
    }
  };
};
