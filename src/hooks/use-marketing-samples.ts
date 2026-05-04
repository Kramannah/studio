
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
      if (error.code !== 'permission-denied') {
        toast({ variant: "destructive", title: "Sync Issue", description: "Check your connection to refresh inventory." });
      }
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
            const qty = Math.round(Number(entry.primaryProductQty));
            quantities[entry.primarySampleName] = (quantities[entry.primarySampleName] || 0) + qty;
        }
        if (entry.secondarySampleName && entry.secondaryProductQty) {
            const qty = Math.round(Number(entry.secondaryProductQty));
            quantities[entry.secondarySampleName] = (quantities[entry.secondarySampleName] || 0) + qty;
        }
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
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
          toast({ variant: 'destructive', title: 'Session Expired', description: 'Please log in again.' });
          return false;
      }

      // Simplified: If you have access to the UI, you can write to the database.
      // Database security rules will still ensure you are a logged-in user.
      
      const q = query(collection(db, "marketingSamples"));
      const querySnapshot = await getDocs(q);
      const existingMap = new Map<string, string>(); 
      
      querySnapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.materialName) {
            existingMap.set(data.materialName.toLowerCase().trim(), docSnap.id);
        }
      });

      const batch = writeBatch(db);
      let updatedCount = 0;
      let addedCount = 0;
      
      samplesData.forEach(sample => {
        const materialNameLower = sample.materialName.toLowerCase().trim();
        const roundedQty = Math.round(Number(sample.allocationQuantity)) || 0;
        const existingId = existingMap.get(materialNameLower);
        
        if (existingId) {
          const docRef = doc(db, "marketingSamples", existingId);
          batch.update(docRef, { 
            productGroup: sample.productGroup,
            allocationQuantity: roundedQty 
          });
          updatedCount++;
        } else {
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
          title: "Update Successful",
          description: `${addedCount} new product(s) added, ${updatedCount} updated.`,
      });

      return true;

    } catch (error: any) {
      console.error("Database Operation Failed:", error);
      
      toast({ 
          variant: 'destructive', 
          title: 'Operation Failed', 
          description: "Could not update inventory. Please verify your connection." 
      });
      return false;
    }

  }, [toast]);
  
  return { addMarketingSamplesBulk };
}
