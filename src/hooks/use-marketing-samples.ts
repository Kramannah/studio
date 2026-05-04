
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
        toast({ variant: 'destructive', title: 'Session Error', description: 'User not logged in.' });
        return false;
    }

    console.log("DIAGNOSTIC: Attempting upload as user:", currentUser.email);
    console.log("DIAGNOSTIC: Items to process:", samplesData.length);

    try {
      // Process in smaller chunks to guarantee database performance
      const chunkSize = 300;
      let totalProcessed = 0;

      for (let i = 0; i < samplesData.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = samplesData.slice(i, i + chunkSize);
        
        chunk.forEach(sample => {
          const materialName = (sample.materialName || "").trim();
          if (!materialName) return;

          // Create unique ID from material name for efficient upserts
          const docId = materialName.toLowerCase().replace(/[^a-z0-9]/g, '-');
          const docRef = doc(db, "marketingSamples", docId);
          
          const allocation = Math.round(Number(sample.allocationQuantity) || 0);
          const group = (sample.productGroup || "General").trim();
          
          batch.set(docRef, { 
            productGroup: group,
            materialName: materialName,
            allocationQuantity: allocation
          }, { merge: true });
        });
        
        await batch.commit();
        totalProcessed += chunk.length;
        console.log(`DIAGNOSTIC: Successfully committed batch. Total processed: ${totalProcessed}`);
      }

      toast({
          title: "Upload Successful",
          description: `Inventory updated with ${totalProcessed} items.`,
      });
      return true;

    } catch (error: any) {
      console.error("CRITICAL UPLOAD ERROR:", error);
      
      let errorMsg = error.message || "An unknown database error occurred.";
      if (error.code === 'permission-denied') {
          errorMsg = "Database rejected the request. Please ensure you are logged in correctly.";
      }

      toast({ 
          variant: 'destructive', 
          title: 'Update Failed', 
          description: errorMsg
      });
      return false;
    }
  }, [toast]);
  
  return { addMarketingSamplesBulk };
}
