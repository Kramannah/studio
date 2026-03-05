
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MarketingSample, CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, getDocs, query, writeBatch, doc } from 'firebase/firestore';

export const useMarketingSamples = () => {
  const { toast } = useToast();
  const [marketingSamples, setMarketingSamples] = useState<MarketingSample[]>([]);
  const [allEntries, setAllEntries] = useState<CoverageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all marketing samples
      const samplesQuery = query(collection(db, "marketingSamples"));
      const samplesSnapshot = await getDocs(samplesQuery);
      const fetchedSamples: MarketingSample[] = [];
      samplesSnapshot.forEach((doc) => {
        fetchedSamples.push({ id: doc.id, ...doc.data() } as MarketingSample);
      });
      setMarketingSamples(fetchedSamples);

      // Fetch all coverage entries to calculate usage
      // We fetch all to ensure global balance is accurate
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

  const usedQuantities = useMemo(() => {
    const quantities: Record<string, number> = {};
    
    const processEntry = (entry: CoverageEntry) => {
        // Sum primary
        if (entry.primarySampleName && entry.primaryProductQty) {
            quantities[entry.primarySampleName] = (quantities[entry.primarySampleName] || 0) + Number(entry.primaryProductQty);
        }
        // Sum secondary
        if (entry.secondarySampleName && entry.secondaryProductQty) {
            quantities[entry.secondarySampleName] = (quantities[entry.secondarySampleName] || 0) + Number(entry.secondaryProductQty);
        }
        // Sum reminders (The missing link)
        if (entry.reminderProducts && entry.reminderProducts.length > 0) {
            entry.reminderProducts.forEach(prod => {
                if (prod.sampleName && prod.quantity) {
                    quantities[prod.sampleName] = (quantities[prod.sampleName] || 0) + Number(prod.quantity);
                }
            });
        }
    };

    allEntries.forEach(processEntry);
    
    return quantities;
  }, [allEntries]);

  return { marketingSamples, usedQuantities, loading, refetch: fetchData };
};


export const useAdminMarketingSamples = () => {
  const { toast } = useToast();
  
  const addMarketingSamplesBulk = useCallback(async (samplesData: Omit<MarketingSample, 'id'>[]) => {
    try {
      const batch = writeBatch(db);
      
      // Clear existing list first
      const q = query(collection(db, "marketingSamples"));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach(doc => {
          batch.delete(doc.ref);
      });

      // Add new ones in safe chunks
      samplesData.forEach(sample => {
        const docRef = doc(collection(db, "marketingSamples"));
        batch.set(docRef, { 
            ...sample,
            allocationQuantity: Number(sample.allocationQuantity) || 0
        });
      });

      await batch.commit();

      toast({
          title: "Upload Successful",
          description: `${samplesData.length} marketing samples have been uploaded and replaced the old list.`,
      });

      return true;

    } catch (error) {
      console.error("Error adding marketing samples in bulk:", error);
      toast({ variant: 'destructive', title: 'Bulk Add Failed', description: 'Could not add marketing samples.' });
      return false;
    }

  }, [toast]);
  
  return { addMarketingSamplesBulk };
}
