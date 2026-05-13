
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, query, writeBatch, doc, where, getDocs } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { ADMIN_UIDS, ADMIN_EMAILS } from '@/lib/admins';

// Singleton session-level cache to survive component unmounts and protect quota
let globalAllocationsCache: Q4Allocation[] | null = null;
let globalUsedQuantitiesCache: Record<string, number> | null = null;
let globalCacheTimestamp: number = 0;
const CACHE_DURATION = 1800000; // 30 minutes for exhaustive historical aggregations
let globalFetchPromise: Promise<void> | null = null;

export const useQ4Allocation = () => {
  const { user, profile } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>(globalAllocationsCache || []);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>(globalUsedQuantitiesCache || {});
  const [loading, setLoading] = useState(!globalAllocationsCache);
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

  const performFetch = useCallback(async () => {
    if (!db || !user) return;
    
    try {
        // 1. Fetch Master Inventory from marketingSamples collection
        const snapshot = await getDocs(collection(db, "marketingSamples"));
        const fetched = snapshot.docs.map(doc => {
            const data = doc.data();
            if (!data) return null;
            // Map either field name variations to the consistent internal type
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
        // No limit() here to ensure 100% accuracy of all historical units
        const colRef = collection(db, "coverageEntries");
        const usageQuery = isAdminOrManager
            ? query(colRef) // Org-wide audit for Admin/Manager
            : query(colRef, where("userId", "==", user.uid)); // Personal ledger for PMR

        const usageSnap = await getDocs(usageQuery);
        const usage: Record<string, number> = {};
        
        usageSnap.docs.forEach(docSnap => {
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

            // ACCURACY: Strictly take from primaryProductQty and secondaryProductQty as requested
            processItem(entry.primarySampleName, entry.primaryProductQty);
            processItem(entry.secondarySampleName, entry.secondaryProductQty);
        });
        
        // Update Singleton Cache
        globalAllocationsCache = fetched;
        globalUsedQuantitiesCache = usage;
        globalCacheTimestamp = Date.now();
        
        setAllocations(fetched);
        setUsedQuantities(usage);
    } catch (error) {
        console.warn("Inventory fetch failed or limited:", error);
    }
  }, [user, isAdminOrManager]);

  const initData = useCallback(async (force = false) => {
    if (!user) return;
    
    const now = Date.now();
    const isCacheFresh = (now - globalCacheTimestamp < CACHE_DURATION);

    if (!force && isCacheFresh && globalAllocationsCache) {
        setAllocations(globalAllocationsCache);
        setUsedQuantities(globalUsedQuantitiesCache || {});
        setLoading(false);
        return;
    }

    if (globalFetchPromise && !force) return globalFetchPromise;

    setLoading(true);
    globalFetchPromise = performFetch();
    
    try {
        await globalFetchPromise;
    } finally {
        globalFetchPromise = null;
        setLoading(false);
    }
  }, [user, performFetch]);

  useEffect(() => {
    if (mounted) initData();
  }, [mounted, initData]);

  return { 
    allocations, 
    usedQuantities, 
    loading, 
    refetch: () => initData(true),
    addAllocationsBulk: async (data: Omit<Q4Allocation, 'id'>[]) => {
        if (!db) return false;
        try {
          const batch = writeBatch(db);
          data.forEach(item => {
            const name = (item.displayMaterialName ?? "").toString().trim();
            if (!name) return;
            // Generate deterministic ID from name to prevent duplicates
            const cleanId = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const docRef = doc(db, "marketingSamples", `sample_${cleanId}`);
            batch.set(docRef, { ...item }, { merge: true });
          });
          await batch.commit();
          await initData(true);
          return true;
        } catch (err) { return false; }
    },
    deleteAllocationsBulk: async (ids: string[]) => {
        if (!db) return false;
        const batch = writeBatch(db);
        ids.forEach(id => { if (id) batch.delete(doc(db, "marketingSamples", id)); });
        try { 
            await batch.commit(); 
            await initData(true); 
            return true; 
        } catch (err) { return false; }
    }
  };
};
