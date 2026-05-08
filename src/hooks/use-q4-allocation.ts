
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, query, writeBatch, doc, where, limit, getDocs, DocumentData, QuerySnapshot } from 'firebase/firestore';
import { useToast } from './use-toast';
import { useAuth } from './use-auth';
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from '@/lib/admins';

const USAGE_CACHE_KEY = 'hovid_usage_cache_v11';
const CACHE_DURATION = 300000; // 5 minutes

export const useQ4Allocation = () => {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const isUserAdminOrManager = useCallback(() => {
    if (!user) return false;
    const email = String(user.email ?? '').toLowerCase();
    const isAdmin = ADMIN_UIDS.includes(user.uid) || 
                  ADMIN_EMAILS.some(e => String(e ?? "").toLowerCase() === email);
    const isManager = Object.keys(MANAGER_TEAMS).includes(user.uid);
    
    return isAdmin || isManager;
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
            try {
                snapshot = await getDocs(collection(db, "q4Allocation"));
            } catch (fallbackError) {
                console.error("Fatal: Inventory data source inaccessible.");
            }
        }
        
        if (snapshot && !snapshot.empty) {
            const fetched = snapshot.docs.map(doc => {
                const data = doc.data();
                if (!data) return null;
                
                // DEEP SANITIZATION: Assign hard defaults at retrieval point
                const rawName = data.displayMaterialName ?? data.materialName ?? "Unknown Item";
                const rawGroup = data.prodGroupProdSubGroup ?? data.productGroup ?? "Uncategorized";
                const rawQty = data.allocationQuantity ?? 0;
                const rawQuarter = data.quarter ?? "Q4";

                const safeName = String(rawName).trim();
                const safeGroup = String(rawGroup).trim();
                const safeQty = Number(rawQty);
                const safeQuarter = String(rawQuarter).trim();
                
                return { 
                    id: doc.id, 
                    prodGroupProdSubGroup: safeGroup,
                    productGroup: safeGroup,
                    displayMaterialName: safeName,
                    materialName: safeName,
                    allocationQuantity: isNaN(safeQty) ? 0 : safeQty,
                    quarter: safeQuarter
                } as any;
            }).filter((item): item is any => item !== null);

            // Safe in-memory sorting
            fetched.sort((a, b) => String(a.displayMaterialName).localeCompare(String(b.displayMaterialName)));
            setAllocations(fetched);
        }
    } catch (error: any) {
        console.error("Allocation Engine Error:", error);
    }
  }, [user]);

  const fetchUsage = useCallback(async (force = false) => {
    if (!db || !user) return;
    
    if (!force) {
        try {
            const cached = localStorage.getItem(USAGE_CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed && typeof parsed === 'object' && parsed.data && parsed.timestamp) {
                    if (Date.now() - parsed.timestamp < CACHE_DURATION) {
                        setUsedQuantities(parsed.data);
                        return;
                    }
                }
            }
        } catch (e) {
            localStorage.removeItem(USAGE_CACHE_KEY);
        }
    }

    try {
      const colRef = collection(db, "coverageEntries");
      
      let usageQuery;
      if (isUserAdminOrManager()) {
          usageQuery = query(colRef, limit(1000)); 
      } else {
          usageQuery = query(colRef, where("userId", "==", user.uid));
      }

      const snapshot = await getDocs(usageQuery);
      const usage: Record<string, number> = {};
      
      if (snapshot && snapshot.docs) {
          snapshot.docs.forEach(doc => {
            const entry = doc.data();
            if (!entry) return;

            const processSample = (name?: any, qty?: any) => {
                if (name !== undefined && name !== null && qty) {
                    const cleanName = String(name);
                    const cleanQty = Number(qty);
                    if (!isNaN(cleanQty)) {
                        usage[cleanName] = (usage[cleanName] || 0) + cleanQty;
                    }
                }
            };

            processSample(entry.primarySampleName, entry.primaryProductQty);
            processSample(entry.secondarySampleName, entry.secondaryProductQty);
            
            if (entry.reminderProducts && Array.isArray(entry.reminderProducts)) {
                entry.reminderProducts.forEach(prod => {
                    if (prod) processSample(prod.sampleName, prod.quantity);
                });
            }
          });
      }

      setUsedQuantities(usage);
      localStorage.setItem(USAGE_CACHE_KEY, JSON.stringify({ data: usage, timestamp: Date.now() }));
    } catch (error: any) {
        console.warn("Usage Tracker Error:", error);
    }
  }, [user, isUserAdminOrManager]);

  useEffect(() => {
    let active = true;
    const init = async () => {
        if (!user) return;
        setLoading(true);
        await Promise.allSettled([fetchAllocations(), fetchUsage()]);
        if (active) setLoading(false);
    };
    init();
    return () => { active = false; };
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
        const name = String(item.displayMaterialName ?? "").trim();
        if (!name) return;
        
        const cleanId = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const docId = `${String(quarter).toLowerCase()}_${cleanId}`;
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
      ids.forEach(id => {
          if (id) batch.delete(doc(db, "marketingSamples", id));
      });
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
