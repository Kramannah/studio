
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MarketingSample } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, getDocs, query, writeBatch, doc } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { useOfflineSync } from './use-offline-sync';

export const useMarketingSamples = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [marketingSamples, setMarketingSamples] = useState<MarketingSample[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { masterEntries, offlineEntries } = useOfflineSync(undefined, user?.uid);

  const fetchMarketingSamples = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "marketingSamples"));
      const querySnapshot = await getDocs(q);
      const fetchedSamples: MarketingSample[] = [];
      querySnapshot.forEach((doc) => {
        fetchedSamples.push({ id: doc.id, ...doc.data() } as MarketingSample);
      });
      setMarketingSamples(fetchedSamples);
    } catch (error) {
      console.error("Error fetching marketing samples:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not fetch marketing samples." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchMarketingSamples();
  }, [fetchMarketingSamples]);


  const usedQuantities = useMemo(() => {
    const allEntries = [...masterEntries, ...offlineEntries];
    const quantities: Record<string, number> = {};
    allEntries.forEach(entry => {
        if (entry.primarySampleName && entry.primaryProductQty) {
            quantities[entry.primarySampleName] = (quantities[entry.primarySampleName] || 0) + entry.primaryProductQty;
        }
        if (entry.secondarySampleName && entry.secondaryProductQty) {
            quantities[entry.secondarySampleName] = (quantities[entry.secondarySampleName] || 0) + entry.secondaryProductQty;
        }
    });
    return quantities;
  }, [masterEntries, offlineEntries]);

  return { marketingSamples, usedQuantities, loading, refetch: fetchMarketingSamples };
};

export const useAdminMarketingSamples = () => {
  const { toast } = useToast();
  
  const addMarketingSamplesBulk = useCallback(async (samplesData: Omit<MarketingSample, 'id'>[]) => {
    try {
      const batch = writeBatch(db);
      
      const q = query(collection(db, "marketingSamples"));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach(doc => {
          batch.delete(doc.ref);
      });

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
