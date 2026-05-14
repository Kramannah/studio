
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, limit, query, where, writeBatch, doc } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { getStartOfYearISO } from '@/lib/utils';
import { ADMIN_UIDS, ADMIN_EMAILS } from '@/lib/admins';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

// GLOBAL SESSION CACHE: Prevents redundant heavy scans during navigation
let globalAllocationsCache: Q4Allocation[] | null = null;
let globalUsedQuantitiesCache: Record<string, number> | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION = 15 * 60 * 1000; // 15 Minutes

/**
 * Hook for managing inventory and marketing samples.
 * Aggregates usage from 'coverageEntries' (primaryProductQty and secondaryProductQty) for the current year.
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
           profile?.role === 'Admin';
  }, [user, profile]);

  const performFetch = useCallback(async (forceRefresh = false) => {
    if (!db || !user || (!active && !forceRefresh)) {
        setLoading(false);
        return;
    }

    const now = Date.now();
    if (!forceRefresh && globalAllocationsCache && globalUsedQuantitiesCache && (now - lastFetchTime < CACHE_DURATION)) {
        setAllocations(globalAllocationsCache);
        setUsedQuantities(globalUsedQuantitiesCache);
        setLoading(false);
        return;
    }

    setLoading(true);
    try {
        // 1. Fetch the master marketing materials list
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

        // 2. Fetch and aggregate usage (Current Year Only)
        const currentYearStart = getStartOfYearISO();
        const used: Record<string, number> = {};

        const processEntry = (entry: CoverageEntry) => {
            const proc = (name?: string, qty?: number) => {
                const key = String(name ?? "").toLowerCase().trim();
                if (key) {
                    const val = Math.round(Number(qty || 0));
                    if (!isNaN(val)) used[key] = (used[key] || 0) + val;
                }
            };
            proc(entry.primarySampleName, entry.primaryProductQty);
            proc(entry.secondarySampleName, entry.secondaryProductQty);
        };

        if (isUserAdmin) {
            // Admin sees global usage for the year
            const q = query(collection(db!, "coverageEntries"), where("submittedAt", ">=", currentYearStart));
            const entriesSnap = await getDocs(q)
                .catch(async (e) => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({
                        path: 'coverageEntries',
                        operation: 'list'
                    }));
                    throw e;
                });
            entriesSnap.docs.forEach(d => processEntry(d.data() as CoverageEntry));
        } else {
            // PMR sees only their usage (filter by userId to avoid index requirements)
            const q = query(collection(db!, "coverageEntries"), where("userId", "==", user.uid));
            const entriesSnap = await getDocs(q)
                .catch(async (e) => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({
                        path: 'coverageEntries',
                        operation: 'list'
                    }));
                    throw e;
                });
            entriesSnap.docs.forEach(d => {
                const data = d.data() as CoverageEntry;
                // Memory filter for current year to avoid composite index requirements
                const entryDate = data.submittedAt || data.coverageDate || "";
                if (entryDate >= currentYearStart) {
                    processEntry(data);
                }
            });
        }

        // Update Persistence Cache
        globalAllocationsCache = fetchedAllocations;
        globalUsedQuantitiesCache = used;
        lastFetchTime = Date.now();

        setAllocations(fetchedAllocations);
        setUsedQuantities(used);
    } catch (error) {
        console.warn("Marketing samples audit limited for quota:", error);
    } finally {
        setLoading(false);
    }
  }, [user, active, isUserAdmin]);

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
