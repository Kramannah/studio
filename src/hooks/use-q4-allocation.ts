
"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, query, writeBatch, doc, where, getDocs, orderBy } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { ADMIN_UIDS, ADMIN_EMAILS } from '@/lib/admins';

// Session-level global cache to prevent redundant heavy aggregations
let globalAllocationsCache: Q4Allocation[] | null = null;
let globalUsedQuantitiesCache: Record<string, number> | null = null;
let globalCacheTimestamp: number = 0;
const CACHE_DURATION = 300000; // 5 minutes fresh duration

export const useQ4Allocation = () => {
  const { user, profile } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>(globalAllocationsCache || []);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>(globalUsedQuantitiesCache || {});
  const [loading, setLoading] = useState(!globalAllocationsCache);
  const lastFetchTime = useRef<number>(globalCacheTimestamp);
  const isFetching = useRef<boolean>(false);

  const isAdminOrManager = useMemo(() => {
    if (!user) return false;
    const email = (user.email ?? "").toString().toLowerCase().trim();
    if (!email) return false;
    
    return ADMIN_UIDS.includes(user.uid) || 
           ADMIN_EMAILS.some(e => (e ?? "").toString().toLowerCase().trim() === email) ||
           profile?.role === 'Admin' ||
           profile?.role === 'Manager';
  }, [user, profile]);

  const fetchAllocations = useCallback(async () => {
    if (!db || !user) return;
    try {
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
        
        fetched.sort((a, b) => {
            const nameA = (a.displayMaterialName || "").toLowerCase();
            const nameB = (b.displayMaterialName || "").toLowerCase();
            return nameA.localeCompare(nameB);
        });
        
        globalAllocationsCache = fetched;
        setAllocations(fetched);
    } catch (error) {
        console.warn("Inventory Catalog Fetch Warning:", error);
    }
  }, [user]);

  const fetchUsage = useCallback(async () => {
    if (!db || !user) return;
    try {
      const colRef = collection(db, "coverageEntries");
      
      // For absolute accuracy of "Used" samples, we must scan the entire relevant history
      // We removed the limit to ensure every primary and secondary qty is counted
      const usageQuery = isAdminOrManager
        ? query(colRef, orderBy("submittedAt", "desc")) 
        : query(colRef, where("userId", "==", user.uid), orderBy("submittedAt", "desc"));

      const snapshot = await getDocs(usageQuery);
      const usage: Record<string, number> = {};
      
      snapshot.docs.forEach(docSnap => {
        const entry = docSnap.data();
        if (!entry) return;

        const processItem = (name?: any, qty?: any) => {
            const safeName = String(name ?? "").toLowerCase().trim();
            if (!safeName) return;
            const safeQty = Math.round(Number(qty || 0));
            if (!isNaN(safeQty) && safeQty !== 0) {
                usage[safeName] = (usage[safeName] || 0) + safeQty;
            }
        };

        // ACCURACY: Explicitly fetch from primaryProductQty and secondaryProductQty
        processItem(entry.primarySampleName, entry.primaryProductQty);
        processItem(entry.secondarySampleName, entry.secondaryProductQty);
        
        // Also include reminder products for complete audit
        if (Array.isArray(entry.reminderProducts)) {
            entry.reminderProducts.forEach((p: any) => { 
                if (p) processItem(p.sampleName, p.quantity); 
            });
        }
      });
      
      globalUsedQuantitiesCache = usage;
      setUsedQuantities(usage);
    } catch (error) {
        console.warn("Usage Tracking Sync Delay:", error);
    }
  }, [user, isAdminOrManager]);

  useEffect(() => {
    const init = async () => {
        if (!user || isFetching.current) return;
        const now = Date.now();
        
        if (globalAllocationsCache && globalUsedQuantitiesCache && (now - lastFetchTime.current < CACHE_DURATION)) {
            setAllocations(globalAllocationsCache);
            setUsedQuantities(globalUsedQuantitiesCache);
            setLoading(false);
            return;
        }

        setLoading(true);
        isFetching.current = true;
        await Promise.allSettled([fetchAllocations(), fetchUsage()]);
        globalCacheTimestamp = Date.now();
        lastFetchTime.current = globalCacheTimestamp;
        setLoading(false);
        isFetching.current = false;
    };
    init();
  }, [user, fetchAllocations, fetchUsage]);

  const refetch = useCallback(async () => {
      if (isFetching.current) return;
      setLoading(true);
      isFetching.current = true;
      await Promise.allSettled([fetchAllocations(), fetchUsage()]);
      globalCacheTimestamp = Date.now();
      lastFetchTime.current = globalCacheTimestamp;
      setLoading(false);
      isFetching.current = false;
  }, [fetchAllocations, fetchUsage]);

  const addAllocationsBulk = async (data: Omit<Q4Allocation, 'id'>[]) => {
    if (!db) return false;
    try {
      const batch = writeBatch(db);
      data.forEach(item => {
        const name = (item.displayMaterialName ?? "").toString().trim();
        if (!name) return;
        const cleanId = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const docId = `sample_${cleanId}`;
        const docRef = doc(db, "marketingSamples", docId);
        batch.set(docRef, { ...item }, { merge: true });
      });
      await batch.commit();
      await refetch();
      return true;
    } catch (err) { 
        console.error("Bulk add error:", err);
        return false; 
    }
  };

  const deleteAllocationsBulk = async (ids: string[]) => {
      if (!db) return false;
      const batch = writeBatch(db);
      ids.forEach(id => { if (id) batch.delete(doc(db, "marketingSamples", id)); });
      try { 
          await batch.commit(); 
          await refetch(); 
          return true; 
      } catch (err) { 
          console.error("Bulk delete error:", err);
          return false; 
      }
  };

  return { allocations, usedQuantities, loading, refetch, addAllocationsBulk, deleteAllocationsBulk };
};
