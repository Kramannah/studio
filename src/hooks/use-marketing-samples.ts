
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MarketingSample, CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, query, writeBatch, doc } from 'firebase/firestore';

/**
 * Hook to manage marketing sample inventory and usage calculation.
 */
export const useMarketingSamples = () => {
  const { toast } = useToast();
  const [marketingSamples, setMarketingSamples] = useState<MarketingSample[]>([]);
  const [allEntries, setAllEntries] = useState<CoverageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const samplesQuery = query(collection(db, "marketingSamples"));
      const samplesSnapshot = await getDocs(samplesQuery);
      const fetchedSamples: MarketingSample[] = [];
      samplesSnapshot.forEach((doc) => {
        fetchedSamples.push({ id: doc.id, ...doc.data() } as MarketingSample);
      });
      setMarketingSamples(fetchedSamples);

      const entriesQuery = query(collection(db, "coverageEntries"));
      const entriesSnapshot = await getDocs(entriesQuery);
      const fetchedEntries: CoverageEntry[] = [];
      entriesSnapshot.forEach((doc) => {
        fetchedEntries.push({ id: doc.id, ...doc.data() } as CoverageEntry);
      });
      setAllEntries(fetchedEntries);

    } catch (error: any) {
      console.error("Error fetching marketing data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const usedQuantities = useMemo(() => {
    const quantities: Record<string, number> = {};
    
    allEntries.forEach(entry => {
        if (entry.primarySampleName && entry.primaryProductQty) {
            const qty = Math.round(Number(entry.primaryProductQty)) || 0;
            quantities[entry.primarySampleName] = (quantities[entry.primarySampleName] || 0) + qty;
        }
        if (entry.secondarySampleName && entry.secondaryProductQty) {
            const qty = Math.round(Number(entry.secondaryProductQty)) || 0;
            quantities[entry.secondarySampleName] = (quantities[entry.secondarySampleName] || 0) + qty;
        }
        if (entry.reminderProducts && entry.reminderProducts.length > 0) {
            entry.reminderProducts.forEach(prod => {
                if (prod.sampleName && prod.quantity) {
                    const qty = Math.round(Number(prod.quantity)) || 0;
                    quantities[prod.sampleName] = (quantities[prod.sampleName] || 0) + qty;
                }
            });
        }
    });
    
    return quantities;
  }, [allEntries]);

  return { marketingSamples, usedQuantities, loading, refetch: fetchData };
};


export const useAdminMarketingSamples = () => {
  const { toast } = useToast();
  
  const addMarketingSamplesBulk = useCallback(async (samplesData: Omit<MarketingSample, 'id'>[]) => {
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
        return false;
    }

    try {
      // Force refresh the token to ensure the database sees the current login session as valid
      await currentUser.getIdToken(true);
      
      const chunkSize = 300;
      let totalProcessed = 0;

      for (let i = 0; i < samplesData.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = samplesData.slice(i, i + chunkSize);
        
        chunk.forEach(sample => {
          const materialName = (sample.materialName || "").trim();
          if (!materialName) return;

          // Generating a robust, clean ID
          const docId = materialName.toLowerCase().replace(/[^a-z0-9]/g, '');
          const docRef = doc(db, "marketingSamples", docId);
          
          const allocation = Math.round(Number(sample.allocationQuantity) || 0);
          const group = (sample.productGroup || "Uncategorized").trim();
          
          batch.set(docRef, { 
            productGroup: group,
            materialName: materialName,
            allocationQuantity: allocation,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        });
        
        await batch.commit();
        totalProcessed += chunk.length;
      }

      return true;

    } catch (error: any) {
      console.error("UPLOAD ERROR:", error);
      return false;
    }
  }, []);
  
  const runAutoSeed = useCallback(async () => {
    const screenshotData = [
      { productGroup: "Antihistamine - Ricam Syrup", materialName: "PQ3_Frutos Candy", allocationQuantity: 180 },
      { productGroup: "Antihistamine - Ricam Tablet", materialName: "PQ3_Pistachio with Ricam Sticker", allocationQuantity: 675 },
      { productGroup: "Anti-Fungals - Inox", materialName: "PQ3_Inox Penlight", allocationQuantity: 180 },
      { productGroup: "Anti-Fungals - Inox", materialName: "PQ3_Inox Elite Marks & Spencer Set", allocationQuantity: 218 }
    ];
    return await addMarketingSamplesBulk(screenshotData);
  }, [addMarketingSamplesBulk]);

  return { addMarketingSamplesBulk, runAutoSeed };
}
