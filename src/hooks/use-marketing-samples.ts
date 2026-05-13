
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { MarketingSample, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from './use-auth';

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
      const samplesSnap = await getDocs(collection(db, "marketingSamples"));
      
      const fetchedSamples: MarketingSample[] = [];
      samplesSnap.docs.forEach(doc => {
          const data = doc.data();
          if (!data) return;

          const productGroup = String(data.productGroup ?? data.prodGroupProdSubGroup ?? "Uncategorized");
          const materialName = String(data.materialName ?? data.displayMaterialName ?? "Unknown Item");
          const qty = Number(data.allocationQuantity || 0);

          fetchedSamples.push({ 
              id: doc.id, 
              productGroup,
              materialName,
              allocationQuantity: isNaN(qty) ? 0 : qty
          } as MarketingSample);
      });
      
      fetchedSamples.sort((a, b) => String(a.materialName).localeCompare(String(b.materialName)));
      setMarketingSamples(fetchedSamples);

      // ACCURACY: Scan ALL coverage entries of the PMR to reflect complete usage history
      // No limits applied to ensure total historical issued quantities are accounted for
      const usageSnap = await getDocs(
        query(
          collection(db, "coverageEntries"), 
          where("userId", "==", user.uid)
        )
      );
      
      const usage: Record<string, number> = {};
      
      usageSnap.docs.forEach(docSnap => {
          const entry = docSnap.data() as CoverageEntry;
          if (!entry) return;
          
          const process = (name?: string, qty?: number) => {
              const safeName = String(name ?? "").toLowerCase().trim();
              if (!safeName) return;
              
              const safeQty = Math.round(Number(qty || 0));
              if (!isNaN(safeQty) && safeQty !== 0) {
                  usage[safeName] = (usage[safeName] || 0) + safeQty;
              }
          };

          // ACCURACY: Reflect all used samples from all coverage entries submitted by this PMR
          process(entry.primarySampleName, entry.primaryProductQty);
          process(entry.secondarySampleName, entry.secondaryProductQty);
      });
      setUsedQuantities(usage);

    } catch (error: any) {
        console.warn("Marketing Samples usage tracking sync failed:", error);
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
  const { refetch } = useMarketingSamples();

  const addMarketingSamplesBulk = async (data: Omit<MarketingSample, 'id'>[]) => {
    if (!db) return false;
    try {
      const batch = writeBatch(db);
      data.forEach(item => {
        const name = (item.materialName ?? "").toString().trim();
        if (!name) return;
        const cleanId = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const docRef = doc(db, "marketingSamples", `sample_${cleanId}`);
        batch.set(docRef, item, { merge: true });
      });
      await batch.commit();
      await refetch();
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const addSample = async (data: Omit<MarketingSample, 'id'>) => {
    if (!db) return false;
    try {
      const name = (data.materialName ?? "").toString().trim();
      if (!name) return false;
      const cleanId = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      await setDoc(doc(db, "marketingSamples", `sample_${cleanId}`), data, { merge: true });
      await refetch();
      return true;
    } catch (e) {
      return false;
    }
  };

  const updateSample = async (id: string, data: Partial<MarketingSample>) => {
    if (!db) return false;
    try {
      await setDoc(doc(db, "marketingSamples", id), data, { merge: true });
      await refetch();
      return true;
    } catch (e) {
      return false;
    }
  };

  const deleteSample = async (id: string) => {
    if (!db) return false;
    try {
      await deleteDoc(doc(db, "marketingSamples", id));
      await refetch();
      return true;
    } catch (e) {
      return false;
    }
  };

  return { 
    addMarketingSamplesBulk, 
    deleteSample, 
    updateSample, 
    addSample 
  };
};
