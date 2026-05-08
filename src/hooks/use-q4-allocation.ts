
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, query, writeBatch, doc, where, getDocs } from 'firebase/firestore';
import { useToast } from './use-toast';
import { useAuth } from './use-auth';
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from '@/lib/admins';

const USAGE_CACHE_KEY = 'hovid_usage_cache_v16';
const CACHE_DURATION = 60000; // 1 minute cache for performance

export const useQ4Allocation = () => {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const isUserAdminOrManager = useCallback(() => {
    if (!user) return false;
    const email = String(user.email || "").toLowerCase();
    const isAdmin = ADMIN_UIDS.includes(user.uid) || 
                  ADMIN_EMAILS.some(e => String(e || "").toLowerCase() === email);
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
            return { 
                id: doc.id, 
                prodGroupProdSubGroup: String(data.prodGroupProdSubGroup || data.productGroup || "Uncategorized"),
                displayMaterialName: String(data.displayMaterialName || data.materialName || "Unknown Item"),
                allocationQuantity: Number(data.allocationQuantity || 0),
                quarter: String(data.quarter || "Q4")
            } as Q4Allocation;
        }).filter((item): item is Q4Allocation => item !== null);

        fetched.sort((a, b) => a.displayMaterialName.localeCompare(b.displayMaterialName));
        setAllocations(fetched);
    } catch (error: any) {
        console.warn("Allocation Fetch Error:", error);
    }
  }, [user]);

  const fetchUsage = useCallback(async (force = false) => {
    if (!db || !user) return;
    
    if (!force) {
        const cached = localStorage.getItem(USAGE_CACHE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (parsed && typeof parsed === 'object' && parsed.data && Date.now() - (parsed.timestamp || 0) < CACHE_DURATION) {
                    setUsedQuantities(parsed.data);
                    return;
                }
            } catch (e) {}
        }
    }

    try {
      const colRef = collection(db, "coverageEntries");
      // If admin, we want to see global distributions for oversight
      // If PMR, only their own
      let usageQuery = isUserAdminOrManager() 
        ? query(colRef)
        : query(colRef, where("userId", "==", user.uid));

      const snapshot = await getDocs(usageQuery);
      const usage: Record<string, number> = {};
      
      snapshot.docs.forEach(doc => {
        const entry = doc.data();
        if (!entry) return;

        const process = (name?: any, qty?: any) => {
            const safeName = String(name || "").trim();
            if (!safeName) return;
            
            const safeQty = Math.round(Number(qty || 0));
            if (!isNaN(safeQty) && safeQty !== 0) {
                usage[safeName] = (usage[safeName] || 0) + safeQty;
            }
        };

        process(entry.primarySampleName, entry.primaryProductQty);
        process(entry.secondarySampleName, entry.secondaryProductQty);
        if (Array.isArray(entry.reminderProducts)) {
            entry.reminderProducts.forEach((p: any) => {
                if (p) process(p.sampleName, p.quantity);
            });
        }
      });

      setUsedQuantities(usage);
      localStorage.setItem(USAGE_CACHE_KEY, JSON.stringify({ data: usage, timestamp: Date.now() }));
    } catch (error: any) {
        console.warn("Usage Tracker Error:", error);
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
      await Promise.allSettled([fetchAllocations(), fetchUsage(true)]);
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
      await fetchAllocations();
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
          await fetchAllocations();
          return true;
      } catch (err) {
          return false;
      }
  };

  return { allocations, usedQuantities, loading, refetch, addAllocationsBulk, deleteAllocationsBulk };
};
