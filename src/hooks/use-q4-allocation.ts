
'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  doc, 
  setDoc, 
  writeBatch, 
  limit
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './use-auth';
import { getStartOfYearISO, safeStorageSet, parseAnyDate } from '@/lib/utils';
import { parseISO, isAfter } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import type { Q4Allocation, CoverageEntry, IndividualAllocation } from '@/lib/types';

// SINGLETON CACHE: Shared across all instances of the hook to prevent redundant master list downloads
let cachedGlobalSamples: Q4Allocation[] | null = null;
let lastGlobalFetch = 0;
const GLOBAL_CACHE_TTL = 30 * 60 * 1000; // 30 Minutes

// USAGE CACHE: Stores calculated balances per user to prevent heavy re-scans of coverageEntries
const USAGE_CACHE: Record<string, { used: Record<string, number>, timestamp: number }> = {};
const USAGE_CACHE_TTL = 5 * 60 * 1000; // 5 Minutes

/**
 * Hook for managing inventory allocations.
 * Supports Global Template and Individual PMR Overrides with optimized caching.
 */
export const useQ4Allocation = (active: boolean = true, includeUsage: boolean = false, targetUserId?: string) => {
  const { user } = useAuth();
  const effectiveUserId = targetUserId || user?.uid;
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(active);
  
  const performFetch = useCallback(async (force = false) => {
    if (!db || !active || !navigator.onLine) {
        setLoading(false);
        return;
    }

    setLoading(true);

    try {
        const now = Date.now();
        
        // 1. Resolve Global Template (with Cache)
        let masterList: Q4Allocation[] = [];
        if (!force && cachedGlobalSamples && (now - lastGlobalFetch < GLOBAL_CACHE_TTL)) {
            masterList = cachedGlobalSamples;
        } else {
            const samplesSnapshot = await getDocs(query(collection(db!, "marketingSamples"), limit(1000)))
                .catch(async (error) => {
                    const permissionError = new FirestorePermissionError({
                        path: 'marketingSamples',
                        operation: 'list',
                    } satisfies SecurityRuleContext);
                    errorEmitter.emit('permission-error', permissionError);
                    throw error;
                });

            masterList = samplesSnapshot.docs.map(docSnap => {
                const data = docSnap.data();
                return { 
                    id: docSnap.id, 
                    prodGroupProdSubGroup: (data.prodGroupProdSubGroup || data.productGroup || "Uncategorized").toString().trim(), 
                    displayMaterialName: (data.displayMaterialName || data.materialName || "Unknown Item").toString().trim(), 
                    allocationQuantity: Number(data.allocationQuantity || 0) 
                } as Q4Allocation;
            });
            
            cachedGlobalSamples = masterList;
            lastGlobalFetch = now;
        }

        // 2. Parallel Resolve: Individual Overrides and Usage
        const fetchPromises: Promise<any>[] = [];

        // Individual Overrides Promise
        if (effectiveUserId) {
            fetchPromises.push(
                getDocs(query(collection(db!, "individualAllocations"), where("userId", "==", effectiveUserId)))
                    .then(snap => {
                        const overrides = new Map<string, number>();
                        snap.docs.forEach(d => {
                            const data = d.data() as IndividualAllocation;
                            if (data.sampleId) overrides.set(data.sampleId, data.quantity);
                        });
                        return overrides;
                    })
                    .catch(() => new Map<string, number>())
            );
        } else {
            fetchPromises.push(Promise.resolve(new Map<string, number>()));
        }

        // Usage Promise (with Cache)
        const usageCacheKey = effectiveUserId || 'anonymous';
        if (includeUsage && effectiveUserId) {
            const cachedUsage = USAGE_CACHE[usageCacheKey];
            if (!force && cachedUsage && (now - cachedUsage.timestamp < USAGE_CACHE_TTL)) {
                fetchPromises.push(Promise.resolve(cachedUsage.used));
            } else {
                const startOfYear = getStartOfYearISO();
                const startOfYearDate = parseISO(startOfYear);
                
                fetchPromises.push(
                    getDocs(query(collection(db!, "coverageEntries"), where("userId", "==", effectiveUserId), where("coverageDate", ">=", startOfYear), limit(3000)))
                        .then(entriesSnap => {
                            const used: Record<string, number> = {};
                            entriesSnap.docs.forEach(d => {
                                const data = d.data() as CoverageEntry;
                                const cDate = parseAnyDate(data.coverageDate || data.submittedAt);
                                if (!cDate || !isAfter(cDate, startOfYearDate)) return;

                                const process = (name?: string, qty?: number) => {
                                    const key = String(name ?? "").toLowerCase().trim();
                                    if (!key) return;
                                    const qVal = Math.round(Number(qty || 0));
                                    if (!isNaN(qVal) && qVal !== 0) {
                                        used[key] = (used[key] || 0) + qVal;
                                    }
                                };
                                process(data.primarySampleName, data.primaryProductQty);
                                process(data.secondarySampleName, data.secondaryProductQty);
                                if (data.reminderProducts) {
                                    data.reminderProducts.forEach(rp => rp?.sampleName && process(rp.sampleName, rp.quantity));
                                }
                            });
                            USAGE_CACHE[usageCacheKey] = { used, timestamp: Date.now() };
                            return used;
                        })
                        .catch(() => ({}))
                );
            }
        } else {
            fetchPromises.push(Promise.resolve({}));
        }

        const [overrides, used] = await Promise.all(fetchPromises);

        // 3. Merge and Sort
        const finalAllocations = masterList.map(sample => ({
            ...sample,
            allocationQuantity: overrides.has(sample.id) ? overrides.get(sample.id)! : sample.allocationQuantity,
            isOverridden: overrides.has(sample.id)
        })).sort((a, b) => a.displayMaterialName.toLowerCase().localeCompare(b.displayMaterialName.toLowerCase()));

        setAllocations(finalAllocations);
        setUsedQuantities(used);

    } catch (error) {
        console.error("Allocation fetch error:", error);
    } finally {
        setLoading(false);
    }
  }, [effectiveUserId, active, includeUsage]);

  useEffect(() => {
    if (active) performFetch();
  }, [performFetch, active]);

  const saveAllocation = async (data: Omit<Q4Allocation, 'id'> & { id?: string }) => {
    if (!db) return false;
    const { id, ...rest } = data;
    const docRef = id ? doc(db!, "marketingSamples", id) : doc(collection(db!, "marketingSamples"));
    
    setDoc(docRef, rest, { merge: true })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'write',
          requestResourceData: rest,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
    
    // Invalidate master cache on write
    lastGlobalFetch = 0;
    performFetch(true);
    return true;
  };

  const saveIndividualAllocation = async (userId: string, sampleId: string, quantity: number) => {
    if (!db) return false;
    const docId = `${userId}_${sampleId}`;
    const docRef = doc(db!, "individualAllocations", docId);
    const payload = {
        userId,
        sampleId,
        quantity,
        updatedAt: new Date().toISOString()
    };

    setDoc(docRef, payload, { merge: true })
        .catch(async (error) => {
            const permissionError = new FirestorePermissionError({
                path: docRef.path,
                operation: 'write',
                requestResourceData: payload,
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        });

    performFetch(true);
    return true;
  };

  const addAllocationsBulk = async (data: Omit<Q4Allocation, 'id'>[]) => {
    if (!db) return false;
    const batch = writeBatch(db!);
    data.forEach(item => batch.set(doc(collection(db!, "marketingSamples")), item));
    
    batch.commit()
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
            path: 'marketingSamples',
            operation: 'write',
            requestResourceData: data,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });

    lastGlobalFetch = 0;
    performFetch(true);
    return true;
  };

  const deleteAllocationsBulk = async (ids: string[]) => {
    if (!db) return false;
    const batch = writeBatch(db!);
    ids.forEach(id => batch.delete(doc(db!, "marketingSamples", id)));
    
    batch.commit()
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
            path: 'marketingSamples',
            operation: 'delete',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });

    lastGlobalFetch = 0;
    performFetch(true);
    return true;
  };

  return { 
    allocations, 
    usedQuantities, 
    loading, 
    refetch: () => performFetch(true),
    saveAllocation,
    saveIndividualAllocation,
    addAllocationsBulk,
    deleteAllocationsBulk
  };
};
