
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, limit, query, where, writeBatch, doc } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from '@/lib/admins';
import { getStartOfYearISO } from '@/lib/utils';

// GLOBAL SESSION CACHE
let globalAllocationsCache: Q4Allocation[] | null = null;
let globalUsedCache: { data: Record<string, number>, timestamp: number } | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 Minutes

/**
 * Hook for managing Marketing Samples (Allocation and Usage).
 * @param active - Whether the hook should perform initial data fetch.
 * @param isAuditMode - If true, fetches global data (Admin/Manager only). If false, fetches personal data for the current user.
 */
export const useQ4Allocation = (active: boolean = true, isAuditMode: boolean = false) => {
  const { user, profile } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>(globalAllocationsCache || []);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>(globalUsedCache?.data || {});
  const [loading, setLoading] = useState(!globalAllocationsCache && active);

  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    const email = (user.email ?? "").toLowerCase();
    return ADMIN_UIDS.includes(user.uid) || 
           email === 'mbustamante@hovidinc.com' || 
           ADMIN_EMAILS.some(e => (e ?? "").toLowerCase() === email) ||
           profile?.role === 'Admin';
  }, [user, profile]);

  const isUserManager = useMemo(() => {
    if (!user) return false;
    return Object.keys(MANAGER_TEAMS).includes(user.uid) || profile?.role === 'Manager' || isUserAdmin;
  }, [user, profile, isUserAdmin]);

  const performFetch = useCallback(async (forceRefresh = false) => {
    if (!db || !user || (!active && !forceRefresh)) {
        setLoading(false);
        return;
    }

    const now = Date.now();
    // Cache is only valid for the same mode (Personal vs Audit)
    const useCache = !forceRefresh && globalAllocationsCache && (now - lastFetchTime < CACHE_DURATION);
    
    if (useCache) {
        setAllocations(globalAllocationsCache!);
        if (globalUsedCache) setUsedQuantities(globalUsedCache.data);
        setLoading(false);
        return;
    }

    setLoading(true);
    try {
        // 1. Fetch Master List (Marketing Samples)
        const samplesSnapshot = await getDocs(query(collection(db!, "marketingSamples"), limit(1000)))
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

        // 2. Aggregate Usage from Coverage Entries
        const currentYearStart = getStartOfYearISO();
        let entriesSnap;

        try {
            // CRITICAL: representatives MUST fetch by their UID to comply with Security Rules.
            // Only use global query if explicitly in Audit Mode and the user has permissions.
            const shouldDoGlobalFetch = isAuditMode && (isUserAdmin || isUserManager);
            
            const entriesQuery = shouldDoGlobalFetch
                ? query(collection(db!, "coverageEntries"), limit(10000))
                : query(collection(db!, "coverageEntries"), where("userId", "==", user.uid));
            
            entriesSnap = await getDocs(entriesQuery);
        } catch (e: any) {
            // Permission Fallback: if global fetch fails, try personal fetch
            console.warn("Global oversight fetch failed, falling back to personal UID query.", e);
            const personalQuery = query(collection(db!, "coverageEntries"), where("userId", "==", user.uid));
            entriesSnap = await getDocs(personalQuery);
        }

        const used: Record<string, number> = {};

        entriesSnap.docs.forEach(d => {
            const data = d.data() as CoverageEntry;
            const subDate = data.submittedAt || data.coverageDate || "";
            // Only aggregate samples from the current calendar year
            if (subDate < currentYearStart) return;

            const process = (name?: string, qty?: number) => {
                const key = String(name ?? "").toLowerCase().trim();
                if (!key) return;
                const q = Math.round(Number(qty || 0));
                if (!isNaN(q) && q !== 0) {
                    used[key] = (used[key] || 0) + q;
                }
            };

            // Aggregate from all potential sample fields
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

        globalAllocationsCache = fetchedAllocations;
        globalUsedCache = { data: used, timestamp: now };
        lastFetchTime = now;

        setAllocations(fetchedAllocations);
        setUsedQuantities(used);
    } catch (error) {
        console.error("Critical error in inventory aggregation:", error);
    } finally {
        setLoading(false);
    }
  }, [user, isUserAdmin, isUserManager, active, isAuditMode]);

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
