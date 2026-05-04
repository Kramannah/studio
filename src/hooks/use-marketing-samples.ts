
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
        toast({ variant: 'destructive', title: 'Session Error', description: 'You must be logged in to modify inventory.' });
        return false;
    }

    try {
      // Force refresh the token to ensure the database sees the current login session as valid
      await currentUser.getIdToken(true);
      
      console.log("DIAGNOSTIC: Session verified for:", currentUser.email);

      // Using a smaller chunk size for reliability
      const chunkSize = 200;
      let totalProcessed = 0;

      for (let i = 0; i < samplesData.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = samplesData.slice(i, i + chunkSize);
        
        let chunkHasValidItems = false;

        chunk.forEach(sample => {
          const materialName = (sample.materialName || "").trim();
          if (!materialName) return;

          // Generating a very strict ID to avoid any Firestore naming rejections
          const docId = materialName.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!docId) return;

          const docRef = doc(db, "marketingSamples", docId);
          
          const allocation = Math.round(Number(sample.allocationQuantity) || 0);
          const group = (sample.productGroup || "Uncategorized").trim();
          
          batch.set(docRef, { 
            productGroup: group,
            materialName: materialName,
            allocationQuantity: allocation,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          
          chunkHasValidItems = true;
        });
        
        if (chunkHasValidItems) {
            await batch.commit();
            totalProcessed += chunk.length;
        }
      }

      toast({
          title: "Update Successful",
          description: `Successfully processed ${totalProcessed} inventory items.`,
      });
      return true;

    } catch (error: any) {
      console.error("CRITICAL UPLOAD ERROR:", error);
      
      let errorMsg = error.message || "An unexpected error occurred.";
      if (error.code === 'permission-denied') {
          errorMsg = "Database access denied. Please refresh the page and try logging in again.";
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
