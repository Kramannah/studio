"use client"

import { useState, useEffect, useCallback } from 'react';
import type { MarketingSample } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, DocumentData, QuerySnapshot } from 'firebase/firestore';
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
          fetchedSamples.push({ 
              id: doc.id, 
              productGroup: data.productGroup || data.prodGroupProdSubGroup || "Uncategorized",
              materialName: data.materialName || data.displayMaterialName || "Unknown Item",
              allocationQuantity: Number(data.allocationQuantity || 0)
          } as MarketingSample);
      });
      
      fetchedSamples.sort((a, b) => (a.materialName || "").localeCompare(b.materialName || ""));
      setMarketingSamples(fetchedSamples);

      // Fetch usage data
      const usageSnap = await getDocs(query(collection(db, "coverageEntries"), where("userId", "==", user.uid)));
      const usage: Record<string, number> = {};
      
      usageSnap.docs.forEach(doc => {
          const entry = doc.data();
          if (!entry) return;
          
          const process = (name?: string, qty?: number) => {
              if (name && qty) {
                  usage[name] = (usage[name] || 0) + Number(qty);
              }
          };

          process(entry.primarySampleName, entry.primaryProductQty);
          process(entry.secondarySampleName, entry.secondaryProductQty);
          
          entry.reminderProducts?.forEach((p: any) => {
              process(p.sampleName, p.quantity);
          });
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
