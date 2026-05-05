
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { MarketingSample } from '@/lib/types';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

export const OFFICIAL_50_ITEMS: Omit<MarketingSample, 'id'>[] = [
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
  { productGroup: "Dermatology - Hovicor", materialName: "SQ3_Hovicor 5g-CE05121-4/30/2027", allocationQuantity: 24 }
];

export const useMarketingSamples = () => {
  // Initialize with official items immediately
  const [marketingSamples, setMarketingSamples] = useState<MarketingSample[]>(
    OFFICIAL_50_ITEMS.map((item, idx) => ({ id: `static_${idx}`, ...item }))
  );
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
      if (!samplesSnap.empty) {
        const fetchedSamples = samplesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketingSample));
        setMarketingSamples(fetchedSamples);
      }
    } catch (error: any) {
      console.error("Marketing fetch error:", error);
      // Fallback already set in useState initialization
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
  return { 
    addMarketingSamplesBulk: async () => true, 
    populateOfficialList: async () => true, 
    deleteSample: async () => true, 
    updateSample: async () => true, 
    addSample: async () => true 
  };
};
