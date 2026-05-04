
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MarketingSample, CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, query, writeBatch, doc, addDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

/**
 * Hook to manage marketing sample inventory and usage calculation.
 */
export const useMarketingSamples = () => {
  const [marketingSamples, setMarketingSamples] = useState<MarketingSample[]>([]);
  const [allEntries, setAllEntries] = useState<CoverageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [samplesSnap, entriesSnap] = await Promise.all([
        getDocs(query(collection(db, "marketingSamples"))),
        getDocs(query(collection(db, "coverageEntries")))
      ]);

      const fetchedSamples = samplesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketingSample));
      const fetchedEntries = entriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoverageEntry));

      setMarketingSamples(fetchedSamples);
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

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "coverageEntries"), (snap) => {
        const entries = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoverageEntry));
        setAllEntries(entries);
    });
    return () => unsub();
  }, []);

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
        const currentUser = auth.currentUser;
        if (!currentUser || currentUser.email?.toLowerCase() !== 'mbustamante@hovidinc.com') {
            throw new Error("Access restricted to mbustamante@hovidinc.com");
        }

        const docRef = await addDoc(collection(db, "marketingSamples"), {
            ...data,
            updatedAt: new Date().toISOString()
        });
        toast({ title: "Sample Added", description: `${data.materialName} is now in the inventory.` });
        return { id: docRef.id, ...data };
    } catch (error: any) {
        toast({ variant: "destructive", title: "Add Failed", description: error.message });
        return null;
    }
  }

  const updateSample = async (id: string, data: Partial<MarketingSample>) => {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser || currentUser.email?.toLowerCase() !== 'mbustamante@hovidinc.com') {
            throw new Error("Access restricted to mbustamante@hovidinc.com");
        }

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
        const currentUser = auth.currentUser;
        if (!currentUser || currentUser.email?.toLowerCase() !== 'mbustamante@hovidinc.com') {
            throw new Error("Access restricted to mbustamante@hovidinc.com");
        }

        await deleteDoc(doc(db, "marketingSamples", id));
        toast({ variant: "destructive", title: "Sample Deleted" });
        return true;
    } catch (error: any) {
        toast({ variant: "destructive", title: "Delete Failed", description: error.message });
        return false;
    }
  }

  const addMarketingSamplesBulk = useCallback(async (samplesData: Omit<MarketingSample, 'id'>[]) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        toast({ variant: "destructive", title: "Session Error", description: "No user found. Please re-login." });
        return false;
    }

    if (currentUser.email?.toLowerCase() !== 'mbustamante@hovidinc.com') {
        toast({ variant: "destructive", title: "Access Denied", description: "Only mbustamante@hovidinc.com can perform bulk uploads." });
        return false;
    }

    try {
      // Force token refresh for fresh email claim validation in firestore.rules
      await currentUser.getIdToken(true);
      
      const batch = writeBatch(db);
      let addedCount = 0;

      samplesData.forEach(sample => {
        const materialName = (sample.materialName || "").trim();
        if (!materialName) return;

        // Create a predictable document ID to prevent duplicates
        const docId = materialName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!docId) return;

        const docRef = doc(db, "marketingSamples", docId);
        batch.set(docRef, { 
          productGroup: sample.productGroup || "Uncategorized",
          materialName: materialName,
          allocationQuantity: Math.round(Number(sample.allocationQuantity) || 0),
          updatedAt: new Date().toISOString()
        }, { merge: true });
        addedCount++;
      });
      
      if (addedCount === 0) {
        toast({ variant: "destructive", title: "Empty Data", description: "No valid products found in file." });
        return false;
      }

      await batch.commit();
      return true;

    } catch (error: any) {
      console.error("Bulk upload technical error:", error);
      toast({ 
        variant: "destructive", 
        title: "Database Error", 
        description: error.message || "Failed to commit changes to the database."
      });
      return false;
    }
  }, [toast]);
  
  const runAutoSeed = useCallback(async () => {
    const screenshotData = [
      { productGroup: "Antihistamine - Ricam Syrup", materialName: "PQ3_Frutos Candy", allocationQuantity: 180 },
      { productGroup: "Antihistamine - Ricam Tablet", materialName: "PQ3_Pistachio with Ricam Sticker", allocationQuantity: 675 },
      { productGroup: "Anti-Fungals - Inox", materialName: "PQ3_Inox Penlight", allocationQuantity: 180 },
      { productGroup: "Anti-Fungals - Inox", materialName: "PQ3_Inox Elite Marks & Spencer Set", allocationQuantity: 218 }
    ];
    
    const currentUser = auth.currentUser;
    if (currentUser?.email?.toLowerCase() === 'mbustamante@hovidinc.com') {
        return await addMarketingSamplesBulk(screenshotData);
    }
    return false;
  }, [addMarketingSamplesBulk]);

  return { addSample, updateSample, deleteSample, addMarketingSamplesBulk, runAutoSeed };
}
