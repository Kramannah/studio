"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, query, writeBatch, doc, where, limit, getDocs, DocumentData, QuerySnapshot } from 'firebase/firestore';
import { useToast } from './use-toast';
import { useAuth } from './use-auth';
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from '@/lib/admins';

const USAGE_CACHE_KEY = 'hovid_usage_cache_v13';
const CACHE_DURATION = 300000; // 5 minutes

export const useQ4Allocation = () => {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const isUserAdminOrManager = useCallback(() => {
    if (!user) return false;
    const email = (user.email || "").toLowerCase();
    const isAdmin = ADMIN_UIDS.includes(user.uid) || 
                  ADMIN_EMAILS.some(e => e.toLowerCase() === email);
    const isManager = Object.keys(MANAGER_TEAMS).includes(user.uid);
    return isAdmin || isManager;
  }, [user]);

  const fetchAllocations = useCallback(async () => {
    if (!db || !user) return;
    
    try {
        const snapshot = await getDocs(collection(db, "marketingSamples"));
        const fetched = snapshot.docs.map(doc => {
            const data = doc.data();
            return { 
                id: doc.id, 
                prodGroupProdSubGroup: data.prodGroupProdSubGroup || data.productGroup || "Uncategorized",
                displayMaterialName: data.displayMaterialName || data.materialName || "Unknown Item",
                allocationQuantity: Number(data.allocationQuantity || 0),
                quarter: data.quarter || "Q4"
            } as Q4Allocation;
        });

        fetched.sort((a, b) => (a.displayMaterialName || "").localeCompare(b.displayMaterialName || ""));
        setAllocations(fetched);
    } catch (error: any) {
        console.error("Allocation Fetch Error:", error);
    }
  }, [user]);

  const fetchUsage = useCallback(async (force = false) => {
    if (!db || !user) return;
    
    if (!force) {
        const cached = localStorage.getItem(USAGE_CACHE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (parsed && Date.now() - parsed.timestamp < CACHE_DURATION) {
                    setUsedQuantities(parsed.data);
                    return;
                }
            } catch (e) {}
        }
    }

    try {
      const colRef = collection(db, "coverageEntries");
      let usageQuery = isUserAdminOrManager() 
        ? query(colRef, limit(2000))
        : query(colRef, where("userId", "==", user.uid));

      const snapshot = await getDocs(usageQuery);
      const usage: Record<string, number> = {};
      
      snapshot.docs.forEach(doc => {
        const entry = doc.data();
        if (!entry) return;

        const process = (name?: string, qty?: number) => {
            if (name && qty) {
                usage[name] = (usage[name] || 0) + Number(qty);
            }
        };

        process(entry.primarySampleName, entry.primaryProductQty);
        process(entry.secondarySampleName, entry.secondaryProductQty);
        entry.reminderProducts?.forEach((p: any) => process(p.sampleName, p.quantity));
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
        const name = (item.displayMaterialName || "").trim();
        if (!name) return;
        const cleanId = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const docId = `${quarter.toLowerCase()}_${cleanId}`;
        const docRef = doc(db, "marketingSamples", docId);
        batch.set(docRef, { ...item, quarter }, { merge: true });
      });
      await batch.commit();
      fetchAllocations();
      return true;
    } catch (err) {
        return false;
    }
  };

  const deleteAllocationsBulk = async (ids: string[]) => {
      if (!db) return false;
      const batch = writeBatch(db);
      ids.forEach(id => batch.delete(doc(db, "marketingSamples", id)));
      try {
          await batch.commit();
          fetchAllocations();
          return true;
      } catch (err) {
          return false;
      }
  };

  return { allocations, usedQuantities, loading, refetch, addAllocationsBulk, deleteAllocationsBulk };
};
