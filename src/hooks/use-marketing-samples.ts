
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { MarketingSample } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, setDoc, deleteDoc, writeBatch, limit, orderBy } from 'firebase/firestore';
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

      // Accuracy: Scan history with a reasonable limit to prevent timeouts while maintaining precision
      const usageSnap = await getDocs(
        query(
          collection(db, "coverageEntries"), 
          where("userId", "==", user.uid),
          orderBy("submittedAt", "desc"),
          limit(1000)
        )
      );
      
      const usage: Record<string, number> = {};
      
      usageSnap.docs.forEach(doc => {
          const entry = doc.data();
          if (!entry) return;
          
          const process = (name?: any, qty?: any) => {
              const safeName = String(name ?? "").toLowerCase().trim();
              if (!safeName) return;
              
              const safeQty = Math.round(Number(qty || 0));
              if (!isNaN(safeQty)) {
                  usage[safeName] = (usage[safeName] || 0) + safeQty;
              }
          };

          // Precision Aggregation
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
        const cleanId = item.materialName.toLowerCase().replace(/[^a-z0-9]/g, '');
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
      const cleanId = data.materialName.toLowerCase().replace(/[^a-z0-9]/g, '');
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
