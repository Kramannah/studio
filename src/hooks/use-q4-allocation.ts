
"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, query, writeBatch, doc, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from '@/lib/admins';
import { getQueryStartDateISO } from '@/lib/utils';

export const useQ4Allocation = () => {
  const { user, profile } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const lastFetchTime = useRef<number>(0);

  const isUserAdminOrManager = useCallback(() => {
    if (!user) return false;
    const email = (user.email ?? "").toString().toLowerCase().trim();
    if (!email) return false;
    
    const isAdmin = ADMIN_UIDS.includes(user.uid) || 
                  ADMIN_EMAILS.some(e => (e ?? "").toString().toLowerCase().trim() === email) ||
                  profile?.role === 'Admin';
    const isManager = Object.keys(MANAGER_TEAMS).includes(user.uid) || profile?.role === 'Manager';
    return isAdmin || isManager;
  }, [user, profile]);

  const fetchAllocations = useCallback(async () => {
    if (!db || !user) return;
    try {
        // Fetching specifically from marketingSamples collection
        const snapshot = await getDocs(collection(db, "marketingSamples"));
        const fetched = snapshot.docs.map(doc => {
            const data = doc.data();
            if (!data) return null;
            const materialName = (data.displayMaterialName ?? data.materialName ?? "Unknown Item").toString().trim();
            const group = (data.prodGroupProdSubGroup ?? data.productGroup ?? "Uncategorized").toString().trim();
            const qty = Number(data.allocationQuantity || 0);
            return { 
                id: doc.id, 
                prodGroupProdSubGroup: group, 
                displayMaterialName: materialName, 
                allocationQuantity: isNaN(qty) ? 0 : qty 
            } as Q4Allocation;
        }).filter((item): item is Q4Allocation => item !== null);
        
        // Fix for sorting error
        fetched.sort((a, b) => {
            const nameA = (a.displayMaterialName || "").toLowerCase();
            const nameB = (b.displayMaterialName || "").toLowerCase();
            return nameA.localeCompare(nameB);
        });
        
        setAllocations(fetched);
    } catch (error) {
        console.error("Error fetching marketing samples:", error);
    }
  }, [user]);

  const fetchUsage = useCallback(async () => {
    if (!db || !user) return;
    try {
      const colRef = collection(db, "coverageEntries");
      const startDate = getQueryStartDateISO();
      
      const usageQuery = isUserAdminOrManager() 
        ? query(colRef, orderBy("submittedAt", "desc"), limit(1000)) 
        : query(colRef, where("userId", "==", user.uid)); 

      const snapshot = await getDocs(usageQuery);
      const usage: Record<string, number> = {};
      
      snapshot.docs.forEach(docSnap => {
        const entry = docSnap.data();
        if (!entry) return;

        // Skip entries older than our tracking window
        if (entry.submittedAt && entry.submittedAt < startDate) return;

        const processItem = (name?: any, qty?: any) => {
            const safeName = String(name ?? "").toLowerCase().trim();
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
    } catch (error) {
        console.error("Usage Tracking Error:", error);
    }
  }, [user, isUserAdminOrManager]);

  useEffect(() => {
    const init = async () => {
        if (!user) return;
        const now = Date.now();
        // Debounce fetching to prevent rapid re-renders
        if (now - lastFetchTime.current < 5000) return; 
        setLoading(true);
        await Promise.allSettled([fetchAllocations(), fetchUsage()]);
        lastFetchTime.current = now;
        setLoading(false);
    };
    init();
  }, [user, fetchAllocations, fetchUsage]);

  const refetch = useCallback(async () => {
      setLoading(true);
      await Promise.allSettled([fetchAllocations(), fetchUsage()]);
      setLoading(false);
  }, [fetchAllocations, fetchUsage]);

  const addAllocationsBulk = async (data: Omit<Q4Allocation, 'id'>[]) => {
    if (!db) return false;
    try {
      const batch = writeBatch(db);
      data.forEach(item => {
        const name = (item.displayMaterialName ?? "").toString().trim();
        if (!name) return;
        // Generate a stable ID based on material name
        const cleanId = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const docId = `sample_${cleanId}`;
        const docRef = doc(db, "marketingSamples", docId);
        batch.set(docRef, { ...item }, { merge: true });
      });
      await batch.commit();
      await refetch();
      return true;
    } catch (err) { 
        console.error("Bulk add error:", err);
        return false; 
    }
  };

  const deleteAllocationsBulk = async (ids: string[]) => {
      if (!db) return false;
      const batch = writeBatch(db);
      ids.forEach(id => { if (id) batch.delete(doc(db, "marketingSamples", id)); });
      try { 
          await batch.commit(); 
          await refetch(); 
          return true; 
      } catch (err) { 
          console.error("Bulk delete error:", err);
          return false; 
      }
  };

  return { allocations, usedQuantities, loading, refetch, addAllocationsBulk, deleteAllocationsBulk };
};
