"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MarketingSample, CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, query, writeBatch, doc, addDoc, updateDoc, deleteDoc, orderBy, where } from 'firebase/firestore';

export const useMarketingSamples = () => {
  const [marketingSamples, setMarketingSamples] = useState<MarketingSample[]>([]);
  const [allEntries, setAllEntries] = useState<CoverageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const currentUser = auth.currentUser;
    if (!currentUser) {
        setLoading(false);
        return;
    }
    
    try {
      // 1. Fetch Inventory
      const samplesSnap = await getDocs(query(collection(db, "marketingSamples"), orderBy("materialName", "asc")));
      const fetchedSamples = samplesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketingSample));
      setMarketingSamples(fetchedSamples);

      // 2. Fetch Usage (Based on user permissions)
      const normalizedEmail = currentUser.email?.toLowerCase() || '';
      const isAdmin = normalizedEmail === 'mbustamante@hovidinc.com' || currentUser.uid === 'SgOR5cjCC6dZ0oABv4nXdntu6pI3';
      
      let entriesQuery;
      if (isAdmin) {
        entriesQuery = query(collection(db, "coverageEntries"));
      } else {
        entriesQuery = query(collection(db, "coverageEntries"), where("userId", "==", currentUser.uid));
      }

      const entriesSnap = await getDocs(entriesQuery);
      const fetchedEntries = entriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoverageEntry));
      setAllEntries(fetchedEntries);

    } catch (error: any) {
      console.error("Marketing fetch error:", error);
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
        const docRef = await addDoc(collection(db, "marketingSamples"), data);
        toast({ title: "Sample Added" });
        return { id: docRef.id, ...data };
    } catch (error: any) {
        toast({ variant: "destructive", title: "Add Failed", description: error.message });
        return null;
    }
  }

  const updateSample = async (id: string, data: Partial<MarketingSample>) => {
    try {
        await updateDoc(doc(db, "marketingSamples", id), data);
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

  const resetToSystemDefaults = useCallback(async () => {
      const DEFAULT_PRODUCTS = [
          { group: "Tocovid - Tocovid 200mg", name: "SQ3_Tocovid 200mg 1's-CE1207-10/2028", qty: 40 },
          { group: "Tocovid - Tocovid 50mg", name: "SQ3_Tocovid 50mg 8+2 Promopack-CC10001-9/31/2025", qty: 48 },
          { group: "Tocovid - Tocovid 200mg", name: "PQ3_Tocovid Flyers with scalp massager white", qty: 20 },
          { group: "Anti-Fungals - Difluvid", name: "SQ3_Difluvid 1's-CE05506-4/30/2027", qty: 30 },
          { group: "Endocrine - Dapavid", name: "SQ3_Dapavid Starter Dose-A11682507-4/30/2027", qty: 50 },
          { group: "Endocrine - Hovideuform XR500", name: "SQ3_Hovideuform XR 1's-CD07504-6/30/2026", qty: 91 },
          { group: "CNS/Pain - Celevid", name: "SQ3_Celevid 1's-CF01615-12/31/2027", qty: 50 },
          { group: "Gastro - Hovizol", name: "SQ3_Hovizol 1's-CD02504-1/31/2026", qty: 45 },
          { group: "Anti-Fungals - Inox", name: "PQ3_Inox Portable Mini Fan-Blue", qty: 5 },
          { group: "Antihistamine - Ricam Syrup", name: "SQ3_Ricam Syrup 60ml-CF05029-4/30/2028", qty: 15 },
          { group: "CNS/Pain - Pengesic", name: "SQ3_Pengesic 1's-CC05534-4/30/2026", qty: 45 },
          { group: "Anti-Fungals - Inox", name: "SQ3_Inox 1's-CD11501-10/31/2026", qty: 105 },
          { group: "Anti-Fungals - Inox", name: "PQ3_Integumentary System Notepad", qty: 10 },
          { group: "Tocovid - Tocovid 100mg", name: "SQ3_Tocovid 100mg 1's-CF02508-1/31/2029", qty: 40 },
          { group: "Anti-Fungals - Difluvid", name: "PQ3_Difluvid OB Mat", qty: 5 },
          { group: "Gastro - Gascovid Double Action", name: "SQ3_Gascovid 1's-CE08616-7/31/2026", qty: 45 },
          { group: "Dermatology - Calazin", name: "SQ3_Calazin-CF03089-2/29/2028", qty: 75 },
          { group: "Anti-Fungals - Terbivid", name: "SQ3_Terbivid 15g-CF04079-3/31/2027", qty: 45 },
          { group: "Endocrine - Hovideuform 500", name: "SQ3_Hovideuform 500mg 1's-CC09503-8/31/2025", qty: 91 },
          { group: "Anti-Viral - Virest Tab", name: "SQ3_Virest Tab 1's-CD10502-9/30/2026", qty: 60 },
          { group: "Anti-Viral - Virest Tab", name: "SQ3_Virest Tab 1's-CE07507-6/30/2027", qty: 75 },
          { group: "CNS/Pain - Biovid Forte", name: "SQ3_Biovid 1's-CD10503-9/30/2026", qty: 45 },
          { group: "CNS/Pain - Celevid", name: "PQ3_Hot & Cold Compress Celevid", qty: 10 },
          { group: "Tocovid - Tocovid 200mg", name: "PQ3_Tocovid L Type Plastic Folder", qty: 10 },
          { group: "Antihistamine - Ricam Syrup", name: "SQ3_Ricam Syrup 60ml-CE07047-6/30/2027", qty: 15 },
          { group: "Antihistamine - Ricam Tablet", name: "PQ3_Ricam/Rinityn Flyers with Ballpen", qty: 15 },
          { group: "Endocrine - Dapavid", name: "SQ3_Dapavid 28's-A11682301-10/31/2025", qty: 5 },
          { group: "Antihistamine - Ricam Tablet", name: "SQ3_Ricam Tab 1's-CE11501-10/31/2027", qty: 900 },
          { group: "Antihistamine - Ricam Tablet", name: "PQ3_Scissor with Ricam Lanyard", qty: 30 },
          { group: "Tocovid - Tocovid 50mg", name: "SQ3_Tocovid 50mg 8+2 Promopack-CC07001-6/30/2025", qty: 12 },
          { group: "Endocrine - Dapavid", name: "SQ3_Dapavid 1's-A11682404-7/30/2026", qty: 165 },
          { group: "Anti-Fungals - Inox", name: "SQ3_Inox 1's-CE07504-6/30/2027", qty: 135 },
          { group: "Dermatology - Hovicor", name: "SQ3_Hovicor 5g-CE08087-7/31/2027", qty: 24 },
          { group: "CNS/Pain - Celevid", name: "PQ3_Celevid Hot & Cold Compress", qty: 4 },
          { group: "Endocrine - Dapavid", name: "SQ3_Dapavid 1's-A11682401-4/30/2026", qty: 190 },
          { group: "Anti-Viral - Hofovir", name: "SQ3_Hofovir 5's-231118401-10/31/2026", qty: 20 },
          { group: "Endocrine - Dapavid", name: "PQ3_Dapavid Moleskin Notebook Green", qty: 10 },
          { group: "Anti-Viral - Virest Tab", name: "PQ3_Pocket Flavor Inhaler with Lanyard", qty: 10 },
          { group: "Tocovid - Tocovid 200mg", name: "PQ3_Tocovid Flyers with Orange Scrunchies", qty: 20 },
          { group: "Dermatology - Calazin", name: "PQ3_Hovid Calendar 2025", qty: 40 },
          { group: "Tocovid - Tocovid 200mg", name: "PQ3_Love Your Atay Flyers", qty: 500 },
          { group: "Tocovid - Tocovid Vitality", name: "SQ3_Tocovid Vitality Sachet 53g-G41107-11/24/2026", qty: 30 },
          { group: "Anti-Fungals - Terbivid", name: "PQ3_Terbivid Tube Pen", qty: 20 },
          { group: "Gastro - Gascovid Double Action", name: "SQ3_Gascovid 60's-CE08616-7/31/2026", qty: 3 },
          { group: "Antihistamine - Ricam Tablet", name: "SQ3_Ricam Tab 1's-CE07505-6/30/2027", qty: 1500 },
          { group: "Anti-Viral - Hofovir", name: "PQ3_Hofovir Penlight", qty: 10 },
          { group: "Gastro - Gascovid Double Action", name: "SQ3_Gascovid 1's-CE05501-4/30/2026", qty: 45 },
          { group: "Tocovid - Tocovid D'Repair", name: "SQ3_Tocovid D'Repair Cream-CC06029-5/31/25", qty: 10 },
          { group: "Tocovid - Tocovid 200mg", name: "SQ3_Tocovid 200mg 2's-CE04059-3/31/2027", qty: 60 },
          { group: "Dermatology - Hovicor", name: "SQ3_Hovicor 5g-CE05121-4/30/2027", qty: 24 },
          { group: "Antihistamine - Ricam Syrup", name: "PQ3_Frutos Candy", qty: 180 },
          { group: "Antihistamine - Ricam Tablet", name: "PQ3_Pistachio with Ricam Sticker", qty: 675 },
          { group: "Anti-Fungals - Inox", name: "PQ3_Inox Penlight", qty: 180 },
          { group: "Anti-Fungals - Inox", name: "PQ3_Inox Elite Marks & Spencer Set", qty: 218 },
      ];

      try {
          const batch = writeBatch(db);
          DEFAULT_PRODUCTS.forEach(p => {
              const docId = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
              const docRef = doc(db, "marketingSamples", docId);
              batch.set(docRef, {
                  productGroup: p.group,
                  materialName: p.name,
                  allocationQuantity: p.qty
              });
          });
          await batch.commit();
          toast({ title: "Inventory Reset", description: "All 54 products have been successfully loaded." });
          return true;
      } catch (e: any) {
          console.error("Reset failed:", e);
          toast({ variant: 'destructive', title: "Update Failed", description: "Please check your internet connection or admin permissions." });
          return false;
      }
  }, [toast]);

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

  return { addSample, updateSample, deleteSample, addMarketingSamplesBulk, resetToSystemDefaults };
};