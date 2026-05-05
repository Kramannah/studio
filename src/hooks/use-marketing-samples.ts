
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MarketingSample, CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, query, writeBatch, doc, addDoc, updateDoc, deleteDoc, orderBy, limit, where } from 'firebase/firestore';

export const useMarketingSamples = () => {
  const [marketingSamples, setMarketingSamples] = useState<MarketingSample[]>([]);
  const [allEntries, setAllEntries] = useState<CoverageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const currentUser = auth.currentUser;
    
    try {
      // 1. Fetch Inventory
      const samplesSnap = await getDocs(query(collection(db, "marketingSamples"), orderBy("materialName", "asc")));
      const fetchedSamples = samplesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketingSample));
      setMarketingSamples(fetchedSamples);

      // 2. Fetch Usage (Based on user permissions)
      try {
        let entriesQuery;
        const normalizedEmail = currentUser?.email?.toLowerCase() || '';
        const isAdmin = normalizedEmail === 'mbustamante@hovidinc.com' || currentUser?.uid === 'SgOR5cjCC6dZ0oABv4nXdntu6pI3';
        
        if (isAdmin) {
          // Admins see everything for full stock control
          entriesQuery = query(collection(db, "coverageEntries"), orderBy("submittedAt", "desc"), limit(2000));
        } else if (currentUser) {
          // PMRs only see their own usage
          entriesQuery = query(collection(db, "coverageEntries"), where("userId", "==", currentUser.uid));
        }

        if (entriesQuery) {
          const entriesSnap = await getDocs(entriesQuery);
          const fetchedEntries = entriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoverageEntry));
          setAllEntries(fetchedEntries);
        }
      } catch (usageError) {
        console.warn("Usage fetch limited. Stock data remains accurate.", usageError);
      }

    } catch (error: any) {
      console.error("Critical error fetching marketing data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchData();
      } else {
        setMarketingSamples([]);
        setAllEntries([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
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
        if (entry.reminderProducts) {
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
  
  const addSample = async (data: Omit<MarketingSample, 'id'>) => {
    try {
        const docRef = await addDoc(collection(db, "marketingSamples"), {
            ...data,
            updatedAt: new Date().toISOString()
        });
        toast({ title: "Sample Added" });
        return { id: docRef.id, ...data };
    } catch (error: any) {
        toast({ variant: "destructive", title: "Add Failed", description: error.message });
        return null;
    }
  }

  const updateSample = async (id: string, data: Partial<MarketingSample>) => {
    try {
        await updateDoc(doc(db, "marketingSamples", id), {
            ...data,
            updatedAt: new Date().toISOString()
        });
        toast({ title: "Updated Successfully" });
        return true;
    } catch (error: any) {
        toast({ variant: "destructive", title: "Update Failed", description: error.message });
        return false;
    }
  }

  const deleteSample = async (id: string) => {
    try {
        await deleteDoc(doc(db, "marketingSamples", id));
        toast({ variant: "destructive", title: "Sample Deleted" });
        return true;
    } catch (error: any) {
        toast({ variant: "destructive", title: "Delete Failed", description: error.message });
        return false;
    }
  }

  const addMarketingSamplesBulk = useCallback(async (samplesData: Omit<MarketingSample, 'id'>[]) => {
    try {
      const batch = writeBatch(db);
      samplesData.forEach(sample => {
        const materialName = (sample.materialName || "").trim();
        if (!materialName) return;
        
        // Generate consistent ID based on material name
        const docId = materialName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const docRef = doc(db, "marketingSamples", docId);
        
        batch.set(docRef, { 
          productGroup: sample.productGroup || "Uncategorized",
          materialName: materialName,
          allocationQuantity: Math.round(Number(sample.allocationQuantity) || 0),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });
      
      await batch.commit();
      return true;
    } catch (error: any) {
      console.error("BATCH ERROR:", error);
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
      return false;
    }
  }, [toast]);

  return { addSample, updateSample, deleteSample, addMarketingSamplesBulk };
};
