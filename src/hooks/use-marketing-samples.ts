
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { MarketingSample } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from './use-auth';

/**
 * Hook to fetch marketing materials and the user's distribution levels.
 */
export const useMarketingSamples = () => {
  const { user } = useAuth();
  const [marketingSamples, setMarketingSamples] = useState<MarketingSample[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user || !db) {
        setLoading(false);
        return;
    }
    
    setLoading(true);
    try {
      // Fetch from marketingSamples
      const samplesSnap = await getDocs(collection(db, "marketingSamples"));
      
      const fetchedSamples: MarketingSample[] = [];
      samplesSnap.docs.forEach(doc => {
          const data = doc.data();
          if (!data) return;

          // Force all fields to valid strings/numbers during retrieval to prevent downstream crashes
          const productGroup = String(data.productGroup || data.prodGroupProdSubGroup || "Uncategorized");
          const materialName = String(data.materialName || data.displayMaterialName || "Unknown Item");
          const qty = Number(data.allocationQuantity || 0);

          fetchedSamples.push({ 
              id: doc.id, 
              productGroup,
              materialName,
              allocationQuantity: isNaN(qty) ? 0 : qty
          } as MarketingSample);
      });
      
      fetchedSamples.sort((a, b) => a.materialName.localeCompare(b.materialName));
      setMarketingSamples(fetchedSamples);

      // Fetch usage data
      const usageSnap = await getDocs(query(collection(db, "coverageEntries"), where("userId", "==", user.uid)));
      const usage: Record<string, number> = {};
      
      usageSnap.docs.forEach(doc => {
          const entry = doc.data();
          if (!entry) return;
          
          const process = (name?: any, qty?: any) => {
              const safeName = String(name || "").trim();
              const safeQty = Number(qty || 0);
              if (safeName && !isNaN(safeQty)) {
                  // Prevent prototype pollution and ensure numeric accumulation
                  const current = typeof usage[safeName] === 'number' ? usage[safeName] : 0;
                  usage[safeName] = current + safeQty;
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

    } catch (error: any) {
        console.error("Inventory Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { marketingSamples, usedQuantities, loading, refetch: fetchData };
};

export const useAdminMarketingSamples = () => {
  return { 
    addMarketingSamplesBulk: async (data: any) => true, 
    populateOfficialList: async () => true, 
    deleteSample: async (id: string) => true, 
    updateSample: async (id: string, data: any) => true, 
    addSample: async (data: any) => true 
  };
};
