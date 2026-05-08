"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, query, writeBatch, doc, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from '@/lib/admins';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { getQueryStartDateISO } from '@/lib/utils';

export const useQ4Allocation = () => {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const isUserAdminOrManager = useCallback(() => {
    if (!user) return false;
    const email = String(user.email || "").toLowerCase().trim();
    if (!email) return false;
    
    const isAdmin = ADMIN_UIDS.includes(user.uid) || 
                  ADMIN_EMAILS.some(e => String(e || "").toLowerCase().trim() === email);
    const isManager = Object.keys(MANAGER_TEAMS).includes(user.uid);
    return isAdmin || isManager;
  }, [user]);

  const fetchAllocations = useCallback(async () => {
    if (!db || !user) return;
    
    try {
        const snapshot = await getDocs(collection(db, "marketingSamples"));
        const fetched = snapshot.docs.map(doc => {
            const data = doc.data();
            if (!data) return null;
            
            const materialName = String(data.displayMaterialName || data.materialName || "Unknown Item").trim();
            const group = String(data.prodGroupProdSubGroup || data.productGroup || "Uncategorized").trim();
            const qty = Number(data.allocationQuantity || 0);
            const quarter = String(data.quarter || "Q4").toUpperCase();

            return { 
                id: doc.id, 
                prodGroupProdSubGroup: group,
                displayMaterialName: materialName,
                allocationQuantity: isNaN(qty) ? 0 : qty,
                quarter: quarter as any
            } as Q4Allocation;
        }).filter((item): item is Q4Allocation => item !== null);

        fetched.sort((a, b) => a.displayMaterialName.localeCompare(b.displayMaterialName));
        setAllocations(fetched);
    } catch (error: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'marketingSamples',
            operation: 'list'
        }));
    }
  }, [user]);

  const fetchUsage = useCallback(async () => {
    if (!db || !user) return;
    
    try {
      const colRef = collection(db, "coverageEntries");
      const startDate = getQueryStartDateISO(); // Get start of 6 months ago to prevent timeout
      
      // Fetch user's entries or district entries with a date filter to prevent timeouts
      const usageQuery = isUserAdminOrManager() 
        ? query(colRef, where("submittedAt", ">=", startDate), orderBy("submittedAt", "desc"), limit(2000))
        : query(colRef, where("userId", "==", user.uid), where("submittedAt", ">=", startDate));

      const snapshot = await getDocs(usageQuery);
      const usage: Record<string, number> = {};
      
      snapshot.docs.forEach(docSnap => {
        const entry = docSnap.data();
        if (!entry) return;

        const processItem = (name?: any, qty?: any) => {
            // CRITICAL: Normalize keys using lower case + trimmed name to ensure accurate matching
            const safeName = String(name || "").toLowerCase().trim();
            if (!safeName) return;
            
            const safeQty = Math.round(Number(qty || 0));
            if (!isNaN(safeQty) && safeQty !== 0) {
                usage[safeName] = (usage[safeName] || 0) + safeQty;
            }
        };

        processItem(entry.primarySampleName, entry.primaryProductQty);
        processItem(entry.secondarySampleName, entry.secondaryProductQty);
        if (Array.isArray(entry.reminderProducts)) {
            entry.reminderProducts.forEach((p: any) => {
                if (p) processItem(p.sampleName, p.quantity);
            });
        }
      });

      setUsedQuantities(usage);
    } catch (error: any) {
        console.error("Usage Tracking Error:", error);
    }
  }, [user, isUserAdminOrManager]);

  useEffect(() => {
    const init = async () => {
        if (!user) return;
        setLoading(true);
        await Promise.allSettled([fetchAllocations(), fetchUsage()]);
        setLoading(false);
    };
    init();
  }, [user, fetchAllocations, fetchUsage]);

  const refetch = useCallback(async () => {
      setLoading(true);
      await Promise.allSettled([fetchAllocations(), fetchUsage()]);
      setLoading(false);
  }, [fetchAllocations, fetchUsage]);

  const addAllocationsBulk = async (data: Omit<Q4Allocation, 'id'>[], quarter: 'Q3' | 'Q4') => {
    if (!db) return false;
    try {
      const batch = writeBatch(db);
      data.forEach(item => {
        const name = String(item.displayMaterialName || "").trim();
        if (!name) return;
        const cleanId = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const docId = `${quarter.toLowerCase()}_${cleanId}`;
        const docRef = doc(db, "marketingSamples", docId);
        batch.set(docRef, { ...item, quarter }, { merge: true });
      });
      await batch.commit();
      await refetch();
      return true;
    } catch (err) {
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
          await refetch();
          return true;
      } catch (err) {
          return false;
      }
  };

  return { allocations, usedQuantities, loading, refetch, addAllocationsBulk, deleteAllocationsBulk };
};