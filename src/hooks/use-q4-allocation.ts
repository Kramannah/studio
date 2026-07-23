
"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, limit, query, where, writeBatch, doc, setDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { ADMIN_UIDS, ADMIN_EMAILS } from '@/lib/admins';
import { getStartOfYearISO, safeStorageSet, parseAnyDate } from '@/lib/utils';
import { isValid, parseISO, isAfter } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

let cachedAllocations: Q4Allocation[] | null = null;
let lastAllocationFetch: number = 0;
const ALLOCATION_CACHE_TTL = 30 * 60 * 1000;
const ALLOCATIONS_STORAGE_KEY = 'sfe-allocations-v5';
const USED_QUANTITIES_STORAGE_KEY = 'sfe-used-quantities-v5';

/**
 * Hook for managing inventory allocations.
 * Implements standard error reporting for both reads and writes.
 */
export const useQ4Allocation = (active: boolean = true, includeUsage: boolean = false, targetUserId?: string) => {
  const { user, profile } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>(cachedAllocations || []);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(!cachedAllocations && active);
  
  const usageFetchedRef = useRef(false);

  const getStoreKey = (base: string) => `${base}_${targetUserId || user?.uid}`;

  useEffect(() => {
      if (user?.uid) {
          try {
              const localAlloc = localStorage.getItem(getStoreKey(ALLOCATIONS_STORAGE_KEY));
              const localUsed = localStorage.getItem(getStoreKey(USED_QUANTITIES_STORAGE_KEY));
              if (localAlloc) setAllocations(JSON.parse(localAlloc));
              if (localUsed) setUsedQuantities(JSON.parse(localUsed));
          } catch (e) {}
      }
  }, [user?.uid, targetUserId]);

  const performFetch = useCallback(async (force = false) => {
    if (!db || !user || !active) {
        setLoading(false);
        return;
    }

    const now = Date.now();
    if (!force && cachedAllocations && (now - lastAllocationFetch < ALLOCATION_CACHE_TTL)) {
        setAllocations(cachedAllocations);
        if (!includeUsage || usageFetchedRef.current) {
            setLoading(false);
            return;
        }
    }

    if (!navigator.onLine) {
        setLoading(false);
        return;
    }

    if (allocations.length === 0) setLoading(true);

    try {
        const samplesSnapshot = await getDocs(query(collection(db!, "marketingSamples"), limit(1000)))
            .catch(async (error) => {
                if (error.code === 'permission-denied') {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({
                        path: 'marketingSamples',
                        operation: 'list',
                    } satisfies SecurityRuleContext));
                }
                throw error;
            });

        const globalAllocations = samplesSnapshot.docs.map(docSnap => {
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
        
        const effectiveUserId = targetUserId || (profile?.role === 'PMR' ? user?.uid : undefined);
        let mergedAllocations = [...globalAllocations];

        if (effectiveUserId) {
            const indSnap = await getDocs(query(
                collection(db!, "individualAllocations"),
                where("userId", "==", effectiveUserId)
            )).catch(async (error) => {
                if (error.code === 'permission-denied') {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({
                        path: 'individualAllocations',
                        operation: 'list',
                    } satisfies SecurityRuleContext));
                }
                throw error;
            });
            
            const overrides: Record<string, number> = {};
            indSnap.docs.forEach(d => {
                const data = d.data();
                if (data.sampleId) overrides[data.sampleId] = data.quantity;
            });

            mergedAllocations = globalAllocations.map(a => ({
                ...a,
                allocationQuantity: overrides[a.id] !== undefined ? overrides[a.id] : a.allocationQuantity
            }));
        }

        mergedAllocations.sort((a, b) => a.displayMaterialName.toLowerCase().localeCompare(b.displayMaterialName.toLowerCase()));

        cachedAllocations = mergedAllocations;
        lastAllocationFetch = now;
        setAllocations(mergedAllocations);
        safeStorageSet(getStoreKey(ALLOCATIONS_STORAGE_KEY), JSON.stringify(mergedAllocations));

        if (includeUsage) {
            const used: Record<string, number> = {};
            const isManagerial = profile?.role && ['Manager', 'Admin', 'Marketing'].includes(profile.role);
            const startOfYear = getStartOfYearISO();
            const startOfYearDate = parseISO(startOfYear);
            
            let entriesSnap;
            const entriesCol = collection(db!, "coverageEntries");
            const q = targetUserId 
                ? query(entriesCol, where("userId", "==", targetUserId), where("coverageDate", ">=", startOfYear), limit(3000))
                : (isManagerial 
                    ? query(entriesCol, where("coverageDate", ">=", startOfYear), limit(3000))
                    : query(entriesCol, where("userId", "==", user.uid), where("coverageDate", ">=", startOfYear), limit(3000)));

            entriesSnap = await getDocs(q).catch(async (error) => {
                if (error.code === 'permission-denied') {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({
                        path: 'coverageEntries',
                        operation: 'list',
                    } satisfies SecurityRuleContext));
                }
                throw error;
            });

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

    } catch (error: any) {
        // Errors are already emitted in sub-calls
    } finally {
        setLoading(false);
    }
  }, [user, profile, active, includeUsage, allocations.length, targetUserId]);

  useEffect(() => {
    if (active) performFetch();
  }, [performFetch, active]);

  const saveAllocation = async (data: Omit<Q4Allocation, 'id'> & { id?: string }) => {
    if (!db) return false;
    const { id, ...rest } = data;
    const docRef = id ? doc(db!, "marketingSamples", id) : doc(collection(db!, "marketingSamples"));
    
    // Pattern 1: Non-blocking mutation with chained catch for permissions
    setDoc(docRef, rest, { merge: true })
      .catch(async (serverError) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: docRef.path,
          operation: 'write',
          requestResourceData: rest,
        } satisfies SecurityRuleContext));
      });
    
    performFetch(true);
    return true;
  };

  const setIndividualAllocation = async (userId: string, sampleId: string, quantity: number) => {
    if (!db) return false;
    const docId = `${userId}_${sampleId}`;
    const docRef = doc(db!, "individualAllocations", docId);
    const payload = {
        userId,
        sampleId,
        quantity: Math.round(quantity),
        updatedAt: new Date().toISOString()
    };
    
    setDoc(docRef, payload, { merge: true })
      .catch(async (serverError) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'write',
            requestResourceData: payload,
        } satisfies SecurityRuleContext));
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
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'marketingSamples',
            operation: 'create',
            requestResourceData: data,
        } satisfies SecurityRuleContext));
      });

    performFetch(true);
    return true;
  };

  const deleteAllocationsBulk = async (ids: string[]) => {
    if (!db) return false;
    const batch = writeBatch(db!);
    ids.forEach(id => batch.delete(doc(db!, "marketingSamples", id)));
    
    batch.commit()
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'marketingSamples',
            operation: 'delete',
        } satisfies SecurityRuleContext));
      });

    performFetch(true);
    return true;
  };

  return { 
    allocations, 
    usedQuantities, 
    loading, 
    refetch: () => {
        usageFetchedRef.current = false;
        performFetch(true);
    },
    saveAllocation,
    setIndividualAllocation,
    addAllocationsBulk,
    deleteAllocationsBulk
  };
};
