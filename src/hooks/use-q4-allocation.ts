
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, query, writeBatch, doc, getDocs, limit, startAfter, orderBy, where } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { ADMIN_UIDS, ADMIN_EMAILS } from '@/lib/admins';
import { startOfYear } from 'date-fns';

/**
 * Hook for managing inventory/allocations.
 * Fetches the master list from 'marketingSamples'.
 * Calculates usage from 'coverageEntries' for the CURRENT YEAR ONLY.
 */
export const useQ4Allocation = () => {
  const { user, profile } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    const email = (user.email ?? "").toLowerCase();
    return ADMIN_UIDS.includes(user.uid) || 
           email === 'mbustamante@hovidinc.com' || 
           ADMIN_EMAILS.some(e => (e ?? "").toLowerCase() === email) ||
           profile?.role === 'Admin' ||
           profile?.role === 'Manager';
  }, [user, profile]);

  const performFetch = useCallback(async () => {
    if (!db || !user) {
        setLoading(false);
        return;
    }

    setLoading(true);

    try {
        // 1. Fetch Master Inventory List
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

        // 2. Fetch Usage (Current Year Only)
        const currentYearStart = startOfYear(new Date()).toISOString();
        const usage: Record<string, number> = {};
        const entriesCol = collection(db, "coverageEntries");
        let lastVisible = null;
        let hasMore = true;

        while (hasMore) {
            let baseQuery;
            
            // To avoid "Index Required" errors, we only combine multiple filters if they are equalities.
            // For range filters on time, we either use it alone (Admin) or filter in memory (User).
            if (isUserAdmin) {
                // Admin: Range query on date only (Does not require composite index)
                if (lastVisible) {
                    baseQuery = query(
                        entriesCol, 
                        where("submittedAt", ">=", currentYearStart),
                        orderBy("submittedAt"), 
                        startAfter(lastVisible), 
                        limit(1000)
                    );
                } else {
                    baseQuery = query(
                        entriesCol, 
                        where("submittedAt", ">=", currentYearStart),
                        orderBy("submittedAt"), 
                        limit(1000)
                    );
                }
            } else {
                // User: Fetch by User ID only (Does not require composite index)
                // We will filter by the Current Year in memory below
                if (lastVisible) {
                    baseQuery = query(
                        entriesCol, 
                        where("userId", "==", user.uid), 
                        startAfter(lastVisible), 
                        limit(1000)
                    );
                } else {
                    baseQuery = query(
                        entriesCol, 
                        where("userId", "==", user.uid), 
                        limit(1000)
                    );
                }
            }
            
            const snap = await getDocs(baseQuery);
            
            if (snap.empty) {
                hasMore = false;
            } else {
                snap.docs.forEach(docSnap => {
                    const entry = docSnap.data() as CoverageEntry;
                    if (!entry) return;

                    // Memory Filtering for Users to bypass Index Requirement
                    if (!isUserAdmin) {
                        const subAt = entry.submittedAt || entry.coverageDate || "";
                        if (subAt < currentYearStart) return;
                    }

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
        console.error("2026 Inventory Aggregation Error:", error);
    } finally {
        setLoading(false);
    }
  }, [user, isUserAdmin]);

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
