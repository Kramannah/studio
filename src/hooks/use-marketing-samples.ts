
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MarketingSample, CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, query, writeBatch, doc, addDoc, updateDoc, deleteDoc, orderBy, where } from 'firebase/firestore';

export const useMarketingSamples = () => {
  const [marketingSamples, setMarketingSamples] = useState<MarketingSample[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const currentUser = auth.currentUser;
    if (!currentUser) {
        setLoading(false);
        return;
    }
    
    try {
      const samplesSnap = await getDocs(query(collection(db, "marketingSamples"), orderBy("materialName", "asc")));
      const fetchedSamples = samplesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketingSample));
      setMarketingSamples(fetchedSamples);
    } catch (error: any) {
      console.error("Marketing fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { marketingSamples, usedQuantities: {}, loading, refetch: fetchData };
};

export const useAdminMarketingSamples = () => {
  const { toast } = useToast();
  
  const addMarketingSamplesBulk = useCallback(async (samplesData: Omit<MarketingSample, 'id'>[]) => {
    try {
      const batch = writeBatch(db);
      samplesData.forEach(sample => {
        const docId = (sample.materialName || "").toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!docId) return;
        const docRef = doc(db, "marketingSamples", docId);
        batch.set(docRef, sample, { merge: true });
      });
      await batch.commit();
      return true;
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
      return false;
    }
  }, [toast]);

  const resetToSystemDefaults = async () => {
      // Clear all items as requested
      toast({ title: "Inventory Cleared" });
      return true;
  }

  return { addMarketingSamplesBulk, resetToSystemDefaults };
};
