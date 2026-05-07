
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, query, writeBatch, doc, where, limit, getDocs, FirestoreError, DocumentData, QuerySnapshot } from 'firebase/firestore';
import { useToast } from './use-toast';
import { useAuth } from './use-auth';
import { subDays, parseISO, isValid, isAfter } from 'date-fns';
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from '@/lib/admins';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const USAGE_CACHE_KEY = 'hovid_usage_cache_v5';
const CACHE_DURATION = 300000; // 5 minutes

export const useQ4Allocation = () => {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const isUserAdminOrManager = useCallback(() => {
    if (!user) return false;
    const email = user.email?.toLowerCase() || '';
    return ADMIN_UIDS.includes(user.uid) || 
           ADMIN_EMAILS.some(e => e.toLowerCase() === email) || 
           Object.keys(MANAGER_TEAMS).includes(user.uid);
  }, [user]);

  const fetchAllocations = useCallback(async () => {
    if (!db || !user) return;
    
    try {
        let snapshot: QuerySnapshot<DocumentData> | null = null;
        try {
            snapshot = await getDocs(collection(db, "marketingSamples"));
            if (snapshot.empty) {
                snapshot = await getDocs(collection(db, "q4Allocation"));
            }
        } catch (e) {
            console.warn("Primary allocation fetch failed, using legacy fallback:", e);
            try {
                snapshot = await getDocs(collection(db, "q4Allocation"));
            } catch (fallbackError) {
                console.error("Fatal: Could not access any allocation collections.");
            }
        }
        
        if (snapshot && !snapshot.empty) {
            const fetched = snapshot.docs.map(doc => {
                const data = doc.data();
                if (!data) return null;
                const name = data.displayMaterialName || data.materialName || "Unknown Item";
                const group = data.prodGroupProdSubGroup || data.productGroup || "Uncategorized";
                const qty = Number(data.allocationQuantity || 0);
                
                return { 
                    id: doc.id, 
                    prodGroupProdSubGroup: group,
                    displayMaterialName: name,
                    allocationQuantity: isNaN(qty) ? 0 : qty,
                    quarter: data.quarter || 'Q4'
                } as Q4Allocation;
            }).filter((item): item is Q4Allocation => item !== null);

            // Sort in memory to prevent index crashes
            fetched.sort((a, b) => a.displayMaterialName.localeCompare(b.displayMaterialName));
            setAllocations(fetched);
        }
    } catch (error: any) {
        console.error("Critical error in allocation engine:", error);
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'marketingSamples',
          operation: 'list',
        }));
    }
  }, [user]);

  const fetchUsage = useCallback(async (force = false) => {
    if (!db || !user) return;
    
    if (!force) {
        try {
            const cached = localStorage.getItem(USAGE_CACHE_KEY);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_DURATION) {
                    setUsedQuantities(data);
                    return;
                }
            }
        } catch (e) {}
    }

    try {
      const colRef = collection(db, "coverageEntries");
      
      let usageQuery;
      if (isUserAdminOrManager()) {
          usageQuery = query(colRef, limit(1000)); // Limit to prevent browser timeouts
      } else {
          usageQuery = query(colRef, where("userId", "==", user.uid));
      }

      const snapshot = await getDocs(usageQuery);
      const usage: Record<string, number> = {};
      
      snapshot.docs.forEach(doc => {
        const entry = doc.data() as CoverageEntry;
        if (!entry) return;

        if (entry.primarySampleName && entry.primaryProductQty) {
            const pQty = Number(entry.primaryProductQty);
            if (!isNaN(pQty)) usage[entry.primarySampleName] = (usage[entry.primarySampleName] || 0) + pQty;
        }
        if (entry.secondarySampleName && entry.secondaryProductQty) {
            const sQty = Number(entry.secondaryProductQty);
            if (!isNaN(sQty)) usage[entry.secondarySampleName] = (usage[entry.secondarySampleName] || 0) + sQty;
        }
        if (entry.reminderProducts && Array.isArray(entry.reminderProducts)) {
            entry.reminderProducts.forEach(prod => {
                if (prod && prod.sampleName && prod.quantity) {
                    const rQty = Number(prod.quantity);
                    if (!isNaN(rQty)) usage[prod.sampleName] = (usage[prod.sampleName] || 0) + rQty;
                }
            });
        }
      });

      setUsedQuantities(usage);
      localStorage.setItem(USAGE_CACHE_KEY, JSON.stringify({ data: usage, timestamp: Date.now() }));
    } catch (error: any) {
        console.warn("Distribution tracker could not calculate real-time usage:", error);
    }
  }, [user, isUserAdminOrManager]);

  useEffect(() => {
    const init = async () => {
        setLoading(true);
        await Promise.allSettled([fetchAllocations(), fetchUsage()]);
        setLoading(false);
    };
    init();
  }, [fetchAllocations, fetchUsage]);

  const refetch = useCallback(async () => {
      setLoading(true);
      await Promise.allSettled([fetchAllocations(), fetchUsage(true)]);
      setLoading(false);
  }, [fetchAllocations, fetchUsage]);

  const addAllocationsBulk = async (data: Omit<Q4Allocation, 'id'>[], quarter: 'Q3' | 'Q4') => {
    if (!db) return false;
    try {
      const batch = writeBatch(db);
      data.forEach(item => {
        const cleanName = (item.displayMaterialName || "").toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!cleanName) return;
        const docId = `${quarter.toLowerCase()}_${cleanName}`;
        const docRef = doc(db, "marketingSamples", docId);
        batch.set(docRef, { ...item, quarter }, { merge: true });
      });
      await batch.commit();
      toast({ title: "Import Successful" });
      fetchAllocations();
      return true;
    } catch (err) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'marketingSamples',
          operation: 'write',
        }));
        return false;
    }
  };

  const deleteAllocationsBulk = async (ids: string[]) => {
      if (!db) return false;
      const batch = writeBatch(db);
      ids.forEach(id => {
          if (id) batch.delete(doc(db, "marketingSamples", id));
      });
      try {
          await batch.commit();
          toast({ title: "Deleted Successfully" });
          fetchAllocations();
          return true;
      } catch (err) {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'marketingSamples',
            operation: 'delete',
          }));
          return false;
      }
  };

  return { allocations, usedQuantities, loading, refetch, addAllocationsBulk, deleteAllocationsBulk };
};
