
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
  
  const addMarketingSamplesBulk = useCallback(async (samplesData: Omit<MarketingSample, 'id'>[]) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        toast({ variant: "destructive", title: "Not Logged In", description: "Please sign in to your account." });
        return false;
    }

    try {
      console.log("REFRESHING AUTH TOKEN...");
      await currentUser.getIdToken(true);
      console.log("AUTH REFRESHED. ATTEMPTING BATCH WRITE AS:", currentUser.email);
      
      const batch = writeBatch(db);
      let addedCount = 0;

      samplesData.forEach(sample => {
        const materialName = (sample.materialName || "").trim();
        if (!materialName) return;

        // Create a clean doc ID
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
      
      if (addedCount === 0) return false;

      await batch.commit();
      console.log("BATCH COMMIT SUCCESSFUL");
      return true;

    } catch (error: any) {
      console.error("FIRESTORE REJECTION DETAILS:", error);
      toast({ 
        variant: "destructive", 
        title: "Update Failed", 
        description: `Access Denied: The database rules rejected this update. Verify you are logged in as mbustamante@hovidinc.com.`
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
    return await addMarketingSamplesBulk(screenshotData);
  }, [addMarketingSamplesBulk]);

  return { addMarketingSamplesBulk, runAutoSeed };
}
