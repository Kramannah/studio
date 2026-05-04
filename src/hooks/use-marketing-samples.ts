
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
      // Don't show toast for initial sync issues unless it's critical
    } finally {
      setLoading(false);
    }
  }, [toast]);

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
    try {
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
          toast({ variant: 'destructive', title: 'Session Expired', description: 'Please log in again.' });
          return false;
      }

      // 1. Fetch existing samples to determine if we update or create
      const q = query(collection(db, "marketingSamples"));
      const querySnapshot = await getDocs(q);
      const existingMap = new Map<string, string>(); 
      
      querySnapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.materialName) {
            existingMap.set(data.materialName.toLowerCase().trim(), docSnap.id);
        }
      });

      // 2. Prepare operations
      const operations: { type: 'set' | 'update'; docRef: any; data: any }[] = [];
      let updatedCount = 0;
      let addedCount = 0;
      
      samplesData.forEach(sample => {
        const materialNameLower = sample.materialName.toLowerCase().trim();
        const rawQty = Number(sample.allocationQuantity);
        const roundedQty = isNaN(rawQty) ? 0 : Math.round(rawQty);
        const existingId = existingMap.get(materialNameLower);
        
        if (existingId) {
          const docRef = doc(db, "marketingSamples", existingId);
          operations.push({
            type: 'update',
            docRef,
            data: { 
              productGroup: sample.productGroup,
              allocationQuantity: roundedQty 
            }
          });
          updatedCount++;
        } else {
          const docRef = doc(collection(db, "marketingSamples"));
          operations.push({
            type: 'set',
            docRef,
            data: { 
              productGroup: sample.productGroup,
              materialName: sample.materialName,
              allocationQuantity: roundedQty
            }
          });
          addedCount++;
        }
      });

      // 3. Process in chunks of 400 (Firebase batch limit is 500)
      const chunkSize = 400;
      for (let i = 0; i < operations.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = operations.slice(i, i + chunkSize);
        
        chunk.forEach(op => {
          if (op.type === 'update') {
            batch.update(op.docRef, op.data);
          } else {
            batch.set(op.docRef, op.data);
          }
        });
        
        await batch.commit();
      }

      toast({
          title: "Update Successful",
          description: `${addedCount} new items added, ${updatedCount} updated.`,
      });

      return true;

    } catch (error: any) {
      console.error("Database Operation Failed:", error);
      
      // Removed hardcoded permission strings to show real error messages
      const errorMessage = error.message || "Could not update inventory. Please check your file format and connection.";

      toast({ 
          variant: 'destructive', 
          title: 'Operation Failed', 
          description: errorMessage
      });
      return false;
    }

  }, [toast]);
  
  return { addMarketingSamplesBulk };
}
