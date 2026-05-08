
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { MarketingSample } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, DocumentData, QuerySnapshot } from 'firebase/firestore';
import { useAuth } from './use-auth';

/**
 * Hook to fetch marketing materials and the user's distribution levels.
 * Scrub data at source to prevent client-side crashes on malformed Firestore records.
 */
export const useMarketingSamples = () => {
  const { user } = useAuth();
  const [marketingSamples, setMarketingSamples] = useState<MarketingSample[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user || !db) {
        setLoading(false);
        return;
    }
    
    setLoading(true);
    try {
      let samplesSnap: QuerySnapshot<DocumentData> | null = null;
      
      // Attempt to fetch from official marketingSamples first
      try {
          samplesSnap = await getDocs(collection(db, "marketingSamples"));
      } catch (e) {
          console.warn("MarketingSamples collection access issue, checking fallback...");
          try {
              samplesSnap = await getDocs(collection(db, "q4Allocation"));
          } catch (fallbackError) {
              console.error("Critical: Both inventory data sources inaccessible.");
          }
      }
      
      const fetchedSamples: any[] = [];
      if (samplesSnap && !samplesSnap.empty) {
          samplesSnap.docs.forEach(doc => {
              const data = doc.data();
              if (!data) return;
              
              // DEEP SANITIZATION: Force values to strings/numbers at source
              // We check all possible field naming variations from live Firestore
              const rawName = data.displayMaterialName ?? data.materialName ?? "Unknown Item";
              const rawGroup = data.prodGroupProdSubGroup ?? data.productGroup ?? "Uncategorized";
              const rawQty = data.allocationQuantity ?? data.quantity ?? 0;

              const safeName = String(rawName || "Unknown Item").trim();
              const safeGroup = String(rawGroup || "Uncategorized").trim();
              const safeQty = Number(rawQty);
              
              fetchedSamples.push({ 
                  id: String(doc.id), 
                  productGroup: safeGroup, 
                  prodGroupProdSubGroup: safeGroup,
                  materialName: safeName, 
                  displayMaterialName: safeName,
                  allocationQuantity: isNaN(safeQty) ? 0 : safeQty
              });
          });
      }
      
      // Safe sorting using string comparison
      fetchedSamples.sort((a, b) => String(a.materialName).localeCompare(String(b.materialName)));
      setMarketingSamples(fetchedSamples);

      // Fetch usage data for the current PMR
      try {
          const usageSnap = await getDocs(query(collection(db, "coverageEntries"), where("userId", "==", user.uid)));
          const usage: Record<string, number> = {};
          
          usageSnap.docs.forEach(doc => {
              const entry = doc.data();
              if (!entry) return;
              
              const addQty = (name?: any, qty?: any) => {
                  if (name !== undefined && name !== null) {
                      const cleanName = String(name);
                      const cleanQty = Number(qty);
                      if (!isNaN(cleanQty) && cleanQty > 0) {
                          usage[cleanName] = (usage[cleanName] || 0) + cleanQty;
                      }
                  }
              };

              addQty(entry.primarySampleName, entry.primaryProductQty);
              addQty(entry.secondarySampleName, entry.secondaryProductQty);
              
              if (entry.reminderProducts && Array.isArray(entry.reminderProducts)) {
                  entry.reminderProducts.forEach((p: any) => {
                      if (p && p.sampleName) addQty(p.sampleName, p.quantity);
                  });
              }
          });
          setUsedQuantities(usage);
      } catch (usageError) {
          console.error("Usage tracker sync failed", usageError);
      }

    } catch (error: any) {
        console.error("Inventory Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { marketingSamples, usedQuantities, loading, refetch: fetchData };
};

export const useAdminMarketingSamples = () => {
  return { 
    addMarketingSamplesBulk: async (data: any) => true, 
    populateOfficialList: async () => true, 
    deleteSample: async (id: string) => true, 
    updateSample: async (id: string, data: any) => true, 
    addSample: async (data: any) => true 
  };
};
