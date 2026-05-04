
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MarketingSample, CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, query, writeBatch, doc } from 'firebase/firestore';

/**
 * Hook to manage marketing sample inventory and usage calculation.
 * Optimized for speed using parallel fetching.
 */
export const useMarketingSamples = () => {
  const { toast } = useToast();
  const [marketingSamples, setMarketingSamples] = useState<MarketingSample[]>([]);
  const [allEntries, setAllEntries] = useState<CoverageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Parallel fetch for significant speed improvement
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
        toast({ variant: "destructive", title: "Auth Error", description: "You must be logged in as an Admin to modify inventory." });
        return false;
    }

    try {
      console.log(`Starting bulk upload for ${samplesData.length} items as ${currentUser.email}...`);
      
      // Force refresh the token to ensure the database sees the current login session as valid and "fresh"
      await currentUser.getIdToken(true);
      
      const chunkSize = 400; // Safe chunk size below Firestore limit of 500
      for (let i = 0; i < samplesData.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = samplesData.slice(i, i + chunkSize);
        
        chunk.forEach(sample => {
          const materialName = (sample.materialName || "").trim();
          if (!materialName) return;

          // Generate a clean alphanumeric ID
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
        });
        
        console.log(`Committing batch ${Math.floor(i / chunkSize) + 1}...`);
        await batch.commit();
      }

      console.log("Bulk upload completed successfully.");
      return true;

    } catch (error: any) {
      console.error("FIRESTORE UPLOAD REJECTED:", error);
      
      let friendlyMessage = "Insufficient permissions. Please ensure your account has Admin rights.";
      if (error.code === 'permission-denied') {
          friendlyMessage = "Access Denied: The database rules rejected this update. Verify you are logged in as mbustamante@hovidinc.com.";
      } else if (error.code === 'unavailable') {
          friendlyMessage = "Network error: The database is currently unreachable. Check your internet connection.";
      }

      toast({ 
        variant: "destructive", 
        title: "Update Failed", 
        description: friendlyMessage
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
