"use client"

import { useState, useEffect } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, writeBatch, doc, orderBy, where, limit, getDocs } from 'firebase/firestore';
import { useToast } from './use-toast';
import { useAuth } from './use-auth';
import { subDays, startOfMonth, subMonths } from 'date-fns';

export const OFFICIAL_BATCH_ITEMS: Omit<Q4Allocation, 'id'>[] = [
  { prodGroupProdSubGroup: "Tocovid - Tocovid 200mg", displayMaterialName: "SQ3_Tocovid 200mg 1's-CE1207-10/2028", allocationQuantity: 40, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Tocovid - Tocovid 50mg", displayMaterialName: "SQ3_Tocovid 50mg 8+2 Promopack-CC10001-9/31/2025", allocationQuantity: 48, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Tocovid - Tocovid 200mg", displayMaterialName: "PQ3_Tocovid Flyers with scalp massager white", allocationQuantity: 20, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Anti-Fungals - Difluvid", displayMaterialName: "SQ3_Difluvid 1's-CE05506-4/30/2027", allocationQuantity: 30, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Endocrine - Dapavid", displayMaterialName: "SQ3_Dapavid Starter Dose-A11682507-4/30/2027", allocationQuantity: 50, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Endocrine - Hovideuform XR500", displayMaterialName: "SQ3_Hovideuform XR 1's-CD07504-6/30/2026", allocationQuantity: 91, quarter: 'Q4' },
  { prodGroupProdSubGroup: "CNS/Pain - Celevid", displayMaterialName: "SQ3_Celevid 1's-CF01615-12/31/2027", allocationQuantity: 50, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Gastro - Hovizol", displayMaterialName: "SQ3_Hovizol 1's-CD02504-1/31/2026", allocationQuantity: 45, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Anti-Fungals - Inox", displayMaterialName: "PQ3_Inox Portable Mini Fan-Blue", allocationQuantity: 5, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Antihistamine - Ricam Syrup", displayMaterialName: "SQ3_Ricam Syrup 60ml-CF05029-4/30/2028", allocationQuantity: 15, quarter: 'Q4' },
  { prodGroupProdSubGroup: "CNS/Pain - Pengesic", displayMaterialName: "SQ3_Pengesic 1's-CC05534-4/30/2026", allocationQuantity: 45, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Anti-Fungals - Inox", displayMaterialName: "SQ3_Inox 1's-CD11501-10/31/2026", allocationQuantity: 105, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Anti-Fungals - Inox", displayMaterialName: "PQ3_Integumentary System Notepad", allocationQuantity: 10, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Tocovid - Tocovid 100mg", displayMaterialName: "SQ3_Tocovid 100mg 1's-CF02508-1/31/2029", allocationQuantity: 40, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Anti-Fungals - Difluvid", displayMaterialName: "PQ3_Difluvid OB Mat", allocationQuantity: 5, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Gastro - Gascovid Double Action", displayMaterialName: "SQ3_Gascovid 1's-CE08616-7/31/2026", allocationQuantity: 45, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Dermatology - Calazin", displayMaterialName: "SQ3_Calazin-CF03089-2/29/2028", allocationQuantity: 75, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Anti-Fungals - Terbivid", displayMaterialName: "SQ3_Terbivid 15g-CF04079-3/31/2027", allocationQuantity: 45, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Endocrine - Hovideuform 500", displayMaterialName: "SQ3_Hovideuform 500mg 1's-CC09503-8/31/2025", allocationQuantity: 91, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Anti-Viral - Virest Tab", displayMaterialName: "SQ3_Virest Tab 1's-CD10502-9/30/2026", allocationQuantity: 60, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Anti-Viral - Virest Tab", displayMaterialName: "SQ3_Virest Tab 1's-CE07507-6/30/2027", allocationQuantity: 75, quarter: 'Q4' },
  { prodGroupProdSubGroup: "CNS/Pain - Biovid Forte", displayMaterialName: "SQ3_Biovid 1's-CD10503-9/30/2026", allocationQuantity: 45, quarter: 'Q4' },
  { prodGroupProdSubGroup: "CNS/Pain - Celevid", displayMaterialName: "PQ3_Hot & Cold Compress Celevid", allocationQuantity: 10, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Tocovid - Tocovid 200mg", displayMaterialName: "PQ3_Tocovid L Type Plastic Folder", allocationQuantity: 10, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Antihistamine - Ricam Syrup", displayMaterialName: "SQ3_Ricam Syrup 60ml-CE07047-6/30/2027", allocationQuantity: 15, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Antihistamine - Ricam Tablet", displayMaterialName: "PQ3_Ricam/Rinityn Flyers with Ballpen", allocationQuantity: 15, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Endocrine - Dapavid", displayMaterialName: "SQ3_Dapavid 28's-A11682301-10/31/2025", allocationQuantity: 5, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Antihistamine - Ricam Tablet", displayMaterialName: "SQ3_Ricam Tab 1's-CE11501-10/31/2027", allocationQuantity: 900, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Antihistamine - Ricam Tablet", displayMaterialName: "PQ3_Scissor with Ricam Lanyard", allocationQuantity: 30, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Tocovid - Tocovid 50mg", displayMaterialName: "SQ3_Tocovid 50mg 8+2 Promopack-CC07001-6/30/2025", allocationQuantity: 12, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Endocrine - Dapavid", displayMaterialName: "SQ3_Dapavid 1's-A11682404-7/30/2026", allocationQuantity: 165, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Anti-Fungals - Inox", displayMaterialName: "SQ3_Inox 1's-CE07504-6/30/2027", allocationQuantity: 135, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Dermatology - Hovicor", displayMaterialName: "SQ3_Hovicor 5g-CE08087-7/31/2027", allocationQuantity: 24, quarter: 'Q4' },
  { prodGroupProdSubGroup: "CNS/Pain - Celevid", displayMaterialName: "PQ3_Celevid Hot & Cold Compress", allocationQuantity: 4, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Endocrine - Dapavid", displayMaterialName: "SQ3_Dapavid 1's-A11682401-4/30/2026", allocationQuantity: 190, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Anti-Viral - Hofovir", displayMaterialName: "SQ3_Hofovir 5's-231118401-10/31/2026", allocationQuantity: 20, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Endocrine - Dapavid", displayMaterialName: "PQ3_Dapavid Moleskin Notebook Green", allocationQuantity: 10, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Anti-Viral - Virest Tab", displayMaterialName: "PQ3_Pocket Flavor Inhaler with Lanyard", allocationQuantity: 10, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Tocovid - Tocovid 200mg", displayMaterialName: "PQ3_Tocovid Flyers with Orange Scrunchies", allocationQuantity: 20, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Dermatology - Calazin", displayMaterialName: "PQ3_Hovid Calendar 2025", allocationQuantity: 40, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Tocovid - Tocovid 200mg", displayMaterialName: "PQ3_Love Your Atay Flyers", allocationQuantity: 500, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Tocovid - Tocovid Vitality", displayMaterialName: "SQ3_Tocovid Vitality Sachet 53g-G41107-11/24/2026", allocationQuantity: 30, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Anti-Fungals - Terbivid", displayMaterialName: "PQ3_Terbivid Tube Pen", allocationQuantity: 20, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Gastro - Gascovid Double Action", displayMaterialName: "SQ3_Gascovid 60's-CE08616-7/31/2026", allocationQuantity: 3, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Antihistamine - Ricam Tablet", displayMaterialName: "SQ3_Ricam Tab 1's-CE07505-6/30/2027", allocationQuantity: 1500, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Anti-Viral - Hofovir", displayMaterialName: "PQ3_Hofovir Penlight", allocationQuantity: 10, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Gastro - Gascovid Double Action", displayMaterialName: "SQ3_Gascovid 1's-CE05501-4/30/2026", allocationQuantity: 45, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Tocovid - Tocovid D'Repair", displayMaterialName: "SQ3_Tocovid D'Repair Cream-CC06029-5/31/25", allocationQuantity: 10, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Tocovid - Tocovid 200mg", displayMaterialName: "SQ3_Tocovid 200mg 2's-CE04059-3/31/2027", allocationQuantity: 60, quarter: 'Q4' },
  { prodGroupProdSubGroup: "Dermatology - Hovicor", displayMaterialName: "SQ3_Hovicor 5g-CE05121-4/30/2027", allocationQuantity: 24, quarter: 'Q4' }
];

export const useQ4Allocation = () => {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>(
    OFFICIAL_BATCH_ITEMS.map((item, idx) => ({ id: `hardcoded_${idx}`, ...item }))
  );
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!db || !user) return;
    
    setLoading(true);
    const colRef = collection(db, "q4Allocation");
    const q = query(colRef, orderBy("displayMaterialName", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Q4Allocation));
        setAllocations(fetched);
      } else {
          setAllocations(OFFICIAL_BATCH_ITEMS.map((item, idx) => ({ id: `hardcoded_${idx}`, ...item })));
      }
      setLoading(false);
    }, (error) => {
        console.error("Allocation fetch error:", error);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!db || !user) return;
    
    const colRef = collection(db, "coverageEntries");
    
    // INVENTORY TRACKING OPTIMIZATION:
    // We look back at the last 3 months of team-wide activity for inventory balancing.
    // This is wider than 30 days but narrower than 6 months to avoid Firestore timeouts 
    // while ensuring quarterly batch accuracy.
    const startDate = subMonths(startOfMonth(new Date()), 2).toISOString();
    
    const usageQuery = query(
        colRef, 
        where("submittedAt", ">=", startDate),
        limit(5000) 
    );

    const unsubscribe = onSnapshot(usageQuery, (snapshot) => {
      const usage: Record<string, number> = {};
      snapshot.docs.forEach(doc => {
        const entry = doc.data() as CoverageEntry;
        if (entry.primarySampleName && entry.primaryProductQty) {
            usage[entry.primarySampleName] = (usage[entry.primarySampleName] || 0) + Number(entry.primaryProductQty);
        }
        if (entry.secondarySampleName && entry.secondaryProductQty) {
            usage[entry.secondarySampleName] = (usage[entry.secondarySampleName] || 0) + Number(entry.secondaryProductQty);
        }
        entry.reminderProducts?.forEach(prod => {
            if (prod.sampleName && prod.quantity) {
                usage[prod.sampleName] = (usage[prod.sampleName] || 0) + Number(prod.quantity);
            }
        });
      });
      setUsedQuantities(usage);
    }, (error) => {
        console.error("Usage tracking error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const refetch = () => {};

  const addAllocationsBulk = async (data: Omit<Q4Allocation, 'id'>[], quarter: 'Q3' | 'Q4') => {
    if (!db) return false;
    try {
      const batch = writeBatch(db);
      data.forEach(item => {
        const baseId = item.displayMaterialName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!baseId) return;
        const docId = `${quarter.toLowerCase()}_${baseId}`;
        const docRef = doc(db, "q4Allocation", docId);
        batch.set(docRef, { ...item, quarter }, { merge: true });
      });
      await batch.commit();
      return true;
    } catch (err) {
        console.error("Bulk add error:", err);
        toast({ variant: 'destructive', title: "Upload Failed", description: "You might not have permission." });
        return false;
    }
  };

  const deleteAllocationsBulk = async (ids: string[]) => {
      if (!db) return false;
      const batch = writeBatch(db);
      ids.forEach(id => {
          batch.delete(doc(db, "q4Allocation", id));
      });
      try {
          await batch.commit();
          toast({ title: "Deleted Successfully", description: `${ids.length} products removed.` });
          return true;
      } catch (err) {
          console.error("Delete error:", err);
          toast({ variant: 'destructive', title: "Delete Failed" });
          return false;
      }
  };

  return { allocations, usedQuantities, loading, refetch, addAllocationsBulk, deleteAllocationsBulk };
};
