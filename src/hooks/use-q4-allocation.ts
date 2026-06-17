"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, limit, query, where, writeBatch, doc, orderBy } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { ADMIN_UIDS, ADMIN_EMAILS } from '@/lib/admins';
import { getStartOfYearISO, safeStorageSet, parseAnyDate } from '@/lib/utils';
import { isValid, parseISO, isAfter } from 'date-fns';

let cachedAllocations: Q4Allocation[] | null = null;
let lastAllocationFetch: number = 0;
const ALLOCATION_CACHE_TTL = 30 * 60 * 1000;
const ALLOCATIONS_STORAGE_KEY = 'sfe-allocations-v5';
const USED_QUANTITIES_STORAGE_KEY = 'sfe-used-quantities-v5';

/**
 * LOW-COST V2.1: Optimized read logic with resilient fallback for usage scans.
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

        cachedAllocations = fetchedAllocations;
        lastAllocationFetch = now;
        setAllocations(fetchedAllocations);
        
        safeStorageSet(getStoreKey(ALLOCATIONS_STORAGE_KEY), JSON.stringify(fetchedAllocations));

        if (includeUsage && !usageFetchedRef.current) {
            const used: Record<string, number> = {};
            const isManagerial = profile?.role && ['Manager', 'Admin', 'Marketing'].includes(profile.role);
            const startOfYear = getStartOfYearISO();
            const startOfYearDate = parseISO(startOfYear);
            
            let entriesSnap;
            try {
                if (isManagerial) {
                    entriesSnap = await getDocs(query(
                        collection(db!, "coverageEntries"), 
                        where("coverageDate", ">=", startOfYear),
                        limit(3000) 
                    ));
                } else {
                    entriesSnap = await getDocs(query(
                        collection(db!, "coverageEntries"), 
                        where("userId", "==", user.uid),
                        where("coverageDate", ">=", startOfYear),
                        limit(3000)
                    ));
                }
            } catch (indexError) {
                console.warn("Usage scan fallback triggered. Scanning larger batch.");
                // Fallback: Broad UID scan with memory filter
                const q = isManagerial ? query(collection(db!, "coverageEntries"), limit(3000)) : query(collection(db!, "coverageEntries"), where("userId", "==", user.uid), limit(3000));
                entriesSnap = await getDocs(q);
            }

            entriesSnap.docs.forEach(d => {
                const data = d.data() as CoverageEntry;
                const cDate = parseAnyDate(data.coverageDate || data.submittedAt);
                if (!cDate || !isAfter(cDate, startOfYearDate)) return;

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
            safeStorageSet(getStoreKey(USED_QUANTITIES_STORAGE_KEY), JSON.stringify(used));
        }

    } catch (error) {
        console.warn("Allocation fetch error:", error);
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