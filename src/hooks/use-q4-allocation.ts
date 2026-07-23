
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  doc, 
  setDoc, 
  updateDoc, 
  addDoc, 
  deleteDoc, 
  writeBatch, 
  limit 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './use-auth';
import { getStartOfYearISO, safeStorageSet, parseAnyDate } from '@/lib/utils';
import { isValid, parseISO, isAfter } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import type { Q4Allocation, CoverageEntry, IndividualAllocation } from '@/lib/types';

const ALLOCATIONS_STORAGE_KEY = 'sfe-allocations-v5';
const USED_QUANTITIES_STORAGE_KEY = 'sfe-used-quantities-v5';

/**
 * Hook for managing inventory allocations.
 * Supports global templates and explicit individual PMR assignments.
 */
export const useQ4Allocation = (active: boolean = true, includeUsage: boolean = false, targetUserId?: string) => {
  const { user } = useAuth();
  const effectiveUserId = targetUserId || user?.uid;
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [individualAssignments, setIndividualAssignments] = useState<IndividualAllocation[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(active);
  
  const performFetch = useCallback(async (force = false) => {
    if (!db || !active || !navigator.onLine) {
        setLoading(false);
        return;
    }

    setLoading(true);

    try {
        // 1. Fetch Global Template (Marketing Samples)
        const samplesSnapshot = await getDocs(query(collection(db!, "marketingSamples"), limit(1000)))
            .catch(async (error) => {
                const permissionError = new FirestorePermissionError({
                    path: 'marketingSamples',
                    operation: 'list',
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
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

        // 2. Fetch Individual Assignments
        if (effectiveUserId) {
            const assignmentSnap = await getDocs(query(
                collection(db!, "individualAllocations"), 
                where("userId", "==", effectiveUserId)
            )).catch(async (error) => {
                const permissionError = new FirestorePermissionError({
                    path: 'individualAllocations',
                    operation: 'list',
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
                throw error;
            });
            
            const assignments = assignmentSnap.docs.map(d => ({ id: d.id, ...d.data() } as IndividualAllocation));
            setIndividualAssignments(assignments);

            const assignmentsMap = new Map();
            assignments.forEach(a => assignmentsMap.set(a.sampleId, a.quantity));

            finalAllocations = globalAllocations.map(s => {
                if (assignmentsMap.has(s.id)) {
                    return { ...s, allocationQuantity: assignmentsMap.get(s.id), isOverridden: true };
                }
                return s;
            });

            // 3. Fetch Usage
            if (includeUsage) {
                const used: Record<string, number> = {};
                const startOfYear = getStartOfYearISO();
                const startOfYearDate = parseISO(startOfYear);
                
                const entriesCol = collection(db!, "coverageEntries");
                const q = query(entriesCol, where("userId", "==", effectiveUserId), where("coverageDate", ">=", startOfYear), limit(3000));

                const entriesSnap = await getDocs(q).catch(async (error) => {
                    const permissionError = new FirestorePermissionError({
                        path: 'coverageEntries',
                        operation: 'list',
                    } satisfies SecurityRuleContext);
                    errorEmitter.emit('permission-error', permissionError);
                    throw error;
                });

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
                setUsedQuantities(used);
                safeStorageSet(`${USED_QUANTITIES_STORAGE_KEY}_${effectiveUserId}`, JSON.stringify(used));
            }
        }

        finalAllocations.sort((a, b) => a.displayMaterialName.toLowerCase().localeCompare(b.displayMaterialName.toLowerCase()));
        setAllocations(finalAllocations);
        if (effectiveUserId) {
            safeStorageSet(`${ALLOCATIONS_STORAGE_KEY}_${effectiveUserId}`, JSON.stringify(finalAllocations));
        }

    } catch (error) {
        // Errors handled via catch-and-emit pattern
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
    
    // CRITICAL: NO await here. Chain .catch() and emit error.
    setDoc(docRef, rest, { merge: true })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'write',
          requestResourceData: rest,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
    
    performFetch(true);
    return true;
  };

  const saveAssignment = async (sampleId: string, quantity: number) => {
      if (!db || !effectiveUserId) return false;
      
      const q = query(
          collection(db!, "individualAllocations"), 
          where("userId", "==", effectiveUserId), 
          where("sampleId", "==", sampleId)
      );
      
      const snap = await getDocs(q).catch(async (error) => {
          const permissionError = new FirestorePermissionError({
              path: 'individualAllocations',
              operation: 'list',
          } satisfies SecurityRuleContext);
          errorEmitter.emit('permission-error', permissionError);
          throw error;
      });

      const payload = {
          userId: effectiveUserId,
          sampleId,
          quantity,
          updatedAt: new Date().toISOString()
      };

      if (!snap.empty) {
          const docRef = doc(db!, "individualAllocations", snap.docs[0].id);
          // CRITICAL: NO await here.
          updateDoc(docRef, payload).catch(async (error) => {
              const permissionError = new FirestorePermissionError({
                  path: docRef.path,
                  operation: 'update',
                  requestResourceData: payload
              } satisfies SecurityRuleContext);
              errorEmitter.emit('permission-error', permissionError);
          });
      } else {
          const colRef = collection(db!, "individualAllocations");
          // CRITICAL: NO await here.
          addDoc(colRef, payload).catch(async (error) => {
              const permissionError = new FirestorePermissionError({
                  path: 'individualAllocations',
                  operation: 'create',
                  requestResourceData: payload
              } satisfies SecurityRuleContext);
              errorEmitter.emit('permission-error', permissionError);
          });
      }

      performFetch(true);
      return true;
  };

  const deleteAssignment = async (assignmentId: string) => {
      if (!db) return false;
      const docRef = doc(db!, "individualAllocations", assignmentId);
      // CRITICAL: NO await here.
      deleteDoc(docRef).catch(async (error) => {
          const permissionError = new FirestorePermissionError({
              path: docRef.path,
              operation: 'delete'
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
    
    // CRITICAL: NO await here.
    batch.commit()
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
            path: 'marketingSamples',
            operation: 'write',
            requestResourceData: data,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });

    performFetch(true);
    return true;
  };

  const deleteAllocationsBulk = async (ids: string[]) => {
    if (!db) return false;
    const batch = writeBatch(db!);
    ids.forEach(id => batch.delete(doc(db!, "marketingSamples", id)));
    
    // CRITICAL: NO await here.
    batch.commit()
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
            path: 'marketingSamples',
            operation: 'delete',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });

    performFetch(true);
    return true;
  };

  return { 
    allocations, 
    individualAssignments,
    usedQuantities, 
    loading, 
    refetch: () => performFetch(true),
    saveAllocation,
    saveAssignment,
    deleteAssignment,
    addAllocationsBulk,
    deleteAllocationsBulk
  };
};
