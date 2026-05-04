"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MarketingSample, CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
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
      // Fetch all marketing samples (Inventory)
      const samplesQuery = query(collection(db, "marketingSamples"));
      const samplesSnapshot = await getDocs(samplesQuery);
      const fetchedSamples: MarketingSample[] = [];
      samplesSnapshot.forEach((doc) => {
        fetchedSamples.push({ id: doc.id, ...doc.data() } as MarketingSample);
      });
      setMarketingSamples(fetchedSamples);

      // Fetch all coverage entries to calculate global usage
      const entriesQuery = query(collection(db, "coverageEntries"));
      const entriesSnapshot = await getDocs(entriesQuery);
      const fetchedEntries: CoverageEntry[] = [];
      entriesSnapshot.forEach((doc) => {
        fetchedEntries.push({ id: doc.id, ...doc.data() } as CoverageEntry);
      });
      setAllEntries(fetchedEntries);

    } catch (error) {
      console.error("Error fetching marketing data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not fetch marketing samples or usage data." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Aggregates usage across all reports.
   * Checks primary, secondary, and reminder products.
   */
  const usedQuantities = useMemo(() => {
    const quantities: Record<string, number> = {};
    
    allEntries.forEach(entry => {
        // Track primary sample usage
        if (entry.primarySampleName && entry.primaryProductQty) {
            const qty = Math.round(Number(entry.primaryProductQty));
            quantities[entry.primarySampleName] = (quantities[entry.primarySampleName] || 0) + qty;
        }
        // Track secondary sample usage
        if (entry.secondarySampleName && entry.secondaryProductQty) {
            const qty = Math.round(Number(entry.secondaryProductQty));
            quantities[entry.secondarySampleName] = (quantities[entry.secondarySampleName] || 0) + qty;
        }
        // Track reminder products usage
        if (entry.reminderProducts && entry.reminderProducts.length > 0) {
            entry.reminderProducts.forEach(prod => {
                if (prod.sampleName && prod.quantity) {
                    const qty = Math.round(Number(prod.quantity));
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
    try {
      // 1. Fetch existing samples to create a map for checking duplicates/updates
      const q = query(collection(db, "marketingSamples"));
      const querySnapshot = await getDocs(q);
      const existingMap = new Map<string, string>(); // materialName -> docId
      querySnapshot.forEach(docSnap => {
        existingMap.set(docSnap.data().materialName, docSnap.id);
      });

      const batch = writeBatch(db);
      let updatedCount = 0;
      let addedCount = 0;
      
      // 2. Process the new data additively
      samplesData.forEach(sample => {
        const roundedQty = Math.round(Number(sample.allocationQuantity)) || 0;
        const existingId = existingMap.get(sample.materialName);
        
        if (existingId) {
          // Update existing product
          const docRef = doc(db, "marketingSamples", existingId);
          batch.update(docRef, { 
            productGroup: sample.productGroup,
            allocationQuantity: roundedQty 
          });
          updatedCount++;
        } else {
          // Add new product
          const docRef = doc(collection(db, "marketingSamples"));
          batch.set(docRef, { 
            productGroup: sample.productGroup,
            materialName: sample.materialName,
            allocationQuantity: roundedQty
          });
          addedCount++;
        }
      });

      await batch.commit();

      toast({
          title: "Add Sample Complete",
          description: `${addedCount} new products added, ${updatedCount} existing products updated.`,
      });

      return true;

    } catch (error) {
      console.error("Error adding marketing samples in bulk:", error);
      toast({ variant: 'destructive', title: 'Action Failed', description: 'Could not process the samples file.' });
      return false;
    }

  }, [toast]);
  
  return { addMarketingSamplesBulk };
}
