"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MarketingSample, CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, query, writeBatch, doc, addDoc, updateDoc, deleteDoc, orderBy, limit } from 'firebase/firestore';

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
      // Optimized: Fetching inventory and only relevant usage data to prevent timeouts
      const [samplesSnap, entriesSnap] = await Promise.all([
        getDocs(query(collection(db, "marketingSamples"), orderBy("materialName", "asc"))),
        getDocs(query(collection(db, "coverageEntries"), orderBy("submittedAt", "desc"), limit(2000))) 
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
  
  const addSample = async (data: Omit<MarketingSample, 'id'>) => {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser || currentUser.email?.toLowerCase() !== 'mbustamante@hovidinc.com') {
          throw new Error("Administrative permission required.");
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
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.email?.toLowerCase() !== 'mbustamante@hovidinc.com') {
        toast({ variant: "destructive", title: "Permission Denied", description: "Verify you are logged in as mbustamante@hovidinc.com" });
        return false;
    }

    try {
      // Force refresh auth state before heavy write
      await currentUser.getIdToken(true);
      
      const batch = writeBatch(db);
      let addedCount = 0;

      samplesData.forEach(sample => {
        const materialName = (sample.materialName || "").trim();
        if (!materialName) return;

        // Create a unique but clean ID
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
        return false;
      }

      await batch.commit();
      return true;

    } catch (error: any) {
      console.error("BATCH ERROR:", error);
      toast({ 
        variant: "destructive", 
        title: "Database Sync Failed", 
        description: error.message || "Insufficient permissions."
      });
      return false;
    }
  }, [toast]);
  
  const runAutoSeed = useCallback(async () => {
    const newData = [
      { productGroup: "Tocovid - Tocovid 200mg", materialName: "SQ3_Tocovid 200mg 1's-CE1207-10/2028", allocationQuantity: 40 },
      { productGroup: "Tocovid - Tocovid 50mg", materialName: "SQ3_Tocovid 50mg 8+2 Promopack-CC10001-9/31/2025", allocationQuantity: 48 },
      { productGroup: "Tocovid - Tocovid 200mg", materialName: "PQ3_Tocovid Flyers with scalp massager white", allocationQuantity: 20 },
      { productGroup: "Anti-Fungals - Difluvid", materialName: "SQ3_Difluvid 1's-CE05506-4/30/2027", allocationQuantity: 30 },
      { productGroup: "Endocrine - Dapavid", materialName: "SQ3_Dapavid Starter Dose-A11682507-4/30/2027", allocationQuantity: 50 },
      { productGroup: "Endocrine - Hovideuform XR500", materialName: "SQ3_Hovideuform XR 1's-CD07504-6/30/2026", allocationQuantity: 91 },
      { productGroup: "CNS/Pain - Celevid", materialName: "SQ3_Celevid 1's-CF01615-12/31/2027", allocationQuantity: 50 },
      { productGroup: "Gastro - Hovizol", materialName: "SQ3_Hovizol 1's-CD02504-1/31/2026", allocationQuantity: 45 },
      { productGroup: "Anti-Fungals - Inox", materialName: "PQ3_Inox Portable Mini Fan-Blue", allocationQuantity: 5 },
      { productGroup: "Antihistamine - Ricam Syrup", materialName: "SQ3_Ricam Syrup 60ml-CF05029-4/30/2028", allocationQuantity: 15 },
      { productGroup: "CNS/Pain - Pengesic", materialName: "SQ3_Pengesic 1's-CC05534-4/30/2026", allocationQuantity: 45 },
      { productGroup: "Anti-Fungals - Inox", materialName: "SQ3_Inox 1's-CD11501-10/31/2026", allocationQuantity: 105 },
      { productGroup: "Anti-Fungals - Inox", materialName: "PQ3_Integumentary System Notepad", allocationQuantity: 10 },
      { productGroup: "Tocovid - Tocovid 100mg", materialName: "SQ3_Tocovid 100mg 1's-CF02508-1/31/2029", allocationQuantity: 40 },
      { productGroup: "Anti-Fungals - Difluvid", materialName: "PQ3_Difluvid OB Mat", allocationQuantity: 5 },
      { productGroup: "Gastro - Gascovid Double Action", materialName: "SQ3_Gascovid 1's-CE08616-7/31/2026", allocationQuantity: 45 },
      { productGroup: "Dermatology - Calazin", materialName: "SQ3_Calazin-CF03089-2/29/2028", allocationQuantity: 75 },
      { productGroup: "Anti-Fungals - Terbivid", materialName: "SQ3_Terbivid 15g-CF04079-3/31/2027", allocationQuantity: 45 },
      { productGroup: "Endocrine - Hovideuform 500", materialName: "SQ3_Hovideuform 500mg 1's-CC09503-8/31/2025", allocationQuantity: 91 },
      { productGroup: "Anti-Viral - Virest Tab", materialName: "SQ3_Virest Tab 1's-CD10502-9/30/2026", allocationQuantity: 60 },
      { productGroup: "Anti-Viral - Virest Tab", materialName: "SQ3_Virest Tab 1's-CE07507-6/30/2027", allocationQuantity: 75 },
      { productGroup: "CNS/Pain - Biovid Forte", materialName: "SQ3_Biovid 1's-CD10503-9/30/2026", allocationQuantity: 45 },
      { productGroup: "CNS/Pain - Celevid", materialName: "PQ3_Hot & Cold Compress Celevid", allocationQuantity: 10 },
      { productGroup: "Tocovid - Tocovid 200mg", materialName: "PQ3_Tocovid L Type Plastic Folder", allocationQuantity: 10 },
      { productGroup: "Antihistamine - Ricam Syrup", materialName: "SQ3_Ricam Syrup 60ml-CE07047-6/30/2027", allocationQuantity: 15 },
      { productGroup: "Antihistamine - Ricam Tablet", materialName: "PQ3_Ricam/Rinityn Flyers with Ballpen", allocationQuantity: 15 },
      { productGroup: "Endocrine - Dapavid", materialName: "SQ3_Dapavid 28's-A11682301-10/31/2025", allocationQuantity: 5 },
      { productGroup: "Antihistamine - Ricam Tablet", materialName: "SQ3_Ricam Tab 1's-CE11501-10/31/2027", allocationQuantity: 900 },
      { productGroup: "Antihistamine - Ricam Tablet", materialName: "PQ3_Scissor with Ricam Lanyard", allocationQuantity: 30 },
      { productGroup: "Tocovid - Tocovid 50mg", materialName: "SQ3_Tocovid 50mg 8+2 Promopack-CC07001-6/30/2025", allocationQuantity: 12 },
      { productGroup: "Endocrine - Dapavid", materialName: "SQ3_Dapavid 1's-A11682404-7/30/2026", allocationQuantity: 165 },
      { productGroup: "Anti-Fungals - Inox", materialName: "SQ3_Inox 1's-CE07504-6/30/2027", allocationQuantity: 135 },
      { productGroup: "Dermatology - Hovicor", materialName: "SQ3_Hovicor 5g-CE08087-7/31/2027", allocationQuantity: 24 },
      { productGroup: "CNS/Pain - Celevid", materialName: "PQ3_Celevid Hot & Cold Compress", allocationQuantity: 4 },
      { productGroup: "Endocrine - Dapavid", materialName: "SQ3_Dapavid 1's-A11682401-4/30/2026", allocationQuantity: 190 },
      { productGroup: "Anti-Viral - Hofovir", materialName: "SQ3_Hofovir 5's-231118401-10/31/2026", allocationQuantity: 20 },
      { productGroup: "Endocrine - Dapavid", materialName: "PQ3_Dapavid Moleskin Notebook Green", allocationQuantity: 10 },
      { productGroup: "Anti-Viral - Virest Tab", materialName: "PQ3_Pocket Flavor Inhaler with Lanyard", allocationQuantity: 10 },
      { productGroup: "Tocovid - Tocovid 200mg", materialName: "PQ3_Tocovid Flyers with Orange Scrunchies", allocationQuantity: 20 },
      { productGroup: "Dermatology - Calazin", materialName: "PQ3_Hovid Calendar 2025", allocationQuantity: 40 },
      { productGroup: "Tocovid - Tocovid 200mg", materialName: "PQ3_Love Your Atay Flyers", allocationQuantity: 500 },
      { productGroup: "Tocovid - Tocovid Vitality", materialName: "SQ3_Tocovid Vitality Sachet 53g-G41107-11/24/2026", allocationQuantity: 30 },
      { productGroup: "Anti-Fungals - Terbivid", materialName: "PQ3_Terbivid Tube Pen", allocationQuantity: 20 },
      { productGroup: "Gastro - Gascovid Double Action", materialName: "SQ3_Gascovid 60's-CE08616-7/31/2026", allocationQuantity: 3 },
      { productGroup: "Antihistamine - Ricam Tablet", materialName: "SQ3_Ricam Tab 1's-CE07505-6/30/2027", allocationQuantity: 1500 },
      { productGroup: "Anti-Viral - Hofovir", materialName: "PQ3_Hofovir Penlight", allocationQuantity: 10 },
      { productGroup: "Gastro - Gascovid Double Action", materialName: "SQ3_Gascovid 1's-CE05501-4/30/2026", allocationQuantity: 45 },
      { productGroup: "Tocovid - Tocovid D'Repair", materialName: "SQ3_Tocovid D'Repair Cream-CC06029-5/31/25", allocationQuantity: 10 },
      { productGroup: "Tocovid - Tocovid 200mg", materialName: "SQ3_Tocovid 200mg 2's-CE04059-3/31/2027", allocationQuantity: 60 },
      { productGroup: "Dermatology - Hovicor", materialName: "SQ3_Hovicor 5g-CE05121-4/30/2027", allocationQuantity: 24 },
    ];
    
    const currentUser = auth.currentUser;
    if (currentUser?.email?.toLowerCase() === 'mbustamante@hovidinc.com') {
        const res = await addMarketingSamplesBulk(newData);
        if (res) toast({ title: "Inventory Initialized", description: "50 products added to database." });
        return res;
    }
    return false;
  }, [addMarketingSamplesBulk, toast]);

  return { addSample, updateSample, deleteSample, addMarketingSamplesBulk, runAutoSeed };
}