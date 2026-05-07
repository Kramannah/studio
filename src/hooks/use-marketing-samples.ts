
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { MarketingSample } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, DocumentData, QuerySnapshot } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from './use-toast';
import { useAuth } from './use-auth';

export const useMarketingSamples = () => {
  const { toast } = useToast();
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
      // 1. Fetch official allocations with safe collection switching
      let samplesSnap: QuerySnapshot<DocumentData> | null = null;
      
      try {
          samplesSnap = await getDocs(collection(db, "marketingSamples"));
          if (samplesSnap.empty) {
              samplesSnap = await getDocs(collection(db, "q4Allocation"));
          }
      } catch (e) {
          console.warn("Primary inventory access issue, attempting fallback...");
          try {
              samplesSnap = await getDocs(collection(db, "q4Allocation"));
          } catch (fallbackError) {
              console.error("All inventory collections inaccessible.");
          }
      }
      
      const fetchedSamples: MarketingSample[] = [];
      if (samplesSnap && !samplesSnap.empty) {
          samplesSnap.docs.forEach(doc => {
              const data = doc.data();
              if (!data) return;
              
              // Extreme string protection for fields
              const name = String(data.displayMaterialName || data.materialName || "Unknown Item");
              const group = String(data.prodGroupProdSubGroup || data.productGroup || "Uncategorized");
              const qty = Number(data.allocationQuantity || 0);
              
              fetchedSamples.push({ 
                  id: doc.id, 
                  productGroup: group, 
                  materialName: name, 
                  allocationQuantity: isNaN(qty) ? 0 : qty
              });
          });
      }
      
      // Sort in memory
      fetchedSamples.sort((a, b) => (a.materialName || "").localeCompare(b.materialName || ""));
      setMarketingSamples(fetchedSamples);

      // 2. Fetch usage specifically for this representative
      try {
          const usageSnap = await getDocs(query(collection(db, "coverageEntries"), where("userId", "==", user.uid)));
          const usage: Record<string, number> = {};
          
          usageSnap.docs.forEach(doc => {
              const entry = doc.data();
              if (!entry) return;
              
              const addQty = (name?: string, qty?: number) => {
                  if (name && qty) {
                      const cleanName = String(name);
                      const cleanQty = Number(qty);
                      if (!isNaN(cleanQty)) {
                          usage[cleanName] = (usage[cleanName] || 0) + cleanQty;
                      }
                  }
              };

              addQty(entry.primarySampleName, entry.primaryProductQty);
              addQty(entry.secondarySampleName, entry.secondaryProductQty);
              
              if (entry.reminderProducts && Array.isArray(entry.reminderProducts)) {
                  entry.reminderProducts.forEach((p: any) => {
                      if (p) addQty(p.sampleName, p.quantity);
                  });
              }
          });
          setUsedQuantities(usage);
      } catch (usageError) {
          console.warn("Personal usage data could not be computed.");
      }

    } catch (error: any) {
        console.error("Critical error in inventory engine:", error);
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
