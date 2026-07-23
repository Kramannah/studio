
"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, limit, query, where, writeBatch, doc, setDoc, updateDoc, addDoc } from 'firebase/firestore';
import { useAuth } from './use-auth';
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
 * Supports global templates and individual PMR bag overrides.
 */
export const useQ4Allocation = (active: boolean = true, includeUsage: boolean = false, targetUserId?: string) => {
  const { user } = useAuth();
  const effectiveUserId = targetUserId || user?.uid;
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(active);
  
  const usageFetchedForRef = useRef<string | null>(null);

  useEffect(() => {
      if (effectiveUserId) {
          try {
              const localAlloc = localStorage.getItem(`${ALLOCATIONS_STORAGE_KEY}_${effectiveUserId}`);
              const localUsed = localStorage.getItem(`${USED_QUANTITIES_STORAGE_KEY}_${effectiveUserId}`);
              if (localAlloc) setAllocations(JSON.parse(localAlloc));
              if (localUsed) setUsedQuantities(JSON.parse(localUsed));
          } catch (e) {}
      }
  }, [effectiveUserId]);

  const performFetch = useCallback(async (force = false) => {
    if (!db || !active) {
        setLoading(false);
        return;
    }

    if (!navigator.onLine) {
        setLoading(false);
        return;
    }

    setLoading(true);

    try {
        // 1. Fetch Global Template (Marketing Samples)
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
            return { 
                id: docSnap.id, 
                prodGroupProdSubGroup: (data.prodGroupProdSubGroup || data.productGroup || "Uncategorized").toString().trim(), 
                displayMaterialName: (data.displayMaterialName || data.materialName || "Unknown Item").toString().trim(), 
                allocationQuantity: Number(data.allocationQuantity || 0) 
            } as Q4Allocation;
        });
        
        let finalAllocations = globalAllocations;

        // 2. Handle Individual Overrides if a specific user is targeted
        if (effectiveUserId) {
            const overrideSnap = await getDocs(query(
                collection(db!, "individualAllocations"), 
                where("userId", "==", effectiveUserId)
            ));
            
            const overridesMap = new Map();
            overrideSnap.docs.forEach(d => overridesMap.set(d.data().sampleId, d.data().quantity));

            finalAllocations = globalAllocations.map(s => {
                if (overridesMap.has(s.id)) {
                    return { ...s, allocationQuantity: overridesMap.get(s.id), isOverridden: true };
                }
                return s;
            });

            // 3. Fetch Targeted User Usage
            if (includeUsage) {
                const used: Record<string, number> = {};
                const startOfYear = getStartOfYearISO();
                const startOfYearDate = parseISO(startOfYear);
                
                const entriesCol = collection(db!, "coverageEntries");
                const q = query(entriesCol, where("userId", "==", effectiveUserId), where("coverageDate", ">=", startOfYear), limit(3000));

                const entriesSnap = await getDocs(q);

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
                usageFetchedForRef.current = effectiveUserId;
                safeStorageSet(`${USED_QUANTITIES_STORAGE_KEY}_${effectiveUserId}`, JSON.stringify(used));
            }
        }

        finalAllocations.sort((a, b) => a.displayMaterialName.toLowerCase().localeCompare(b.displayMaterialName.toLowerCase()));
        setAllocations(finalAllocations);
        if (effectiveUserId) {
            safeStorageSet(`${ALLOCATIONS_STORAGE_KEY}_${effectiveUserId}`, JSON.stringify(finalAllocations));
        }

    } catch (error: any) {
        console.error("Inventory Fetch Error:", error);
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

  const saveOverride = async (sampleId: string, quantity: number) => {
      if (!db || !effectiveUserId) return false;
      
      const q = query(
          collection(db!, "individualAllocations"), 
          where("userId", "==", effectiveUserId), 
          where("sampleId", "==", sampleId)
      );
      
      const snap = await getDocs(q);
      const payload = {
          userId: effectiveUserId,
          sampleId,
          quantity,
          updatedAt: new Date().toISOString()
      };

      if (!snap.empty) {
          const docRef = doc(db!, "individualAllocations", snap.docs[0].id);
          updateDoc(docRef, payload).catch(e => {
              errorEmitter.emit('permission-error', new FirestorePermissionError({
                  path: docRef.path,
                  operation: 'update',
                  requestResourceData: payload
              }));
          });
      } else {
          addDoc(collection(db!, "individualAllocations"), payload).catch(e => {
              errorEmitter.emit('permission-error', new FirestorePermissionError({
                  path: 'individualAllocations',
                  operation: 'create',
                  requestResourceData: payload
              }));
          });
      }

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
    refetch: () => performFetch(true),
    saveAllocation,
    saveOverride,
    addAllocationsBulk,
    deleteAllocationsBulk
  };
};
