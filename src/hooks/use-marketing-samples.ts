
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { MarketingSample } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, FirestoreError, DocumentData, QuerySnapshot } from 'firebase/firestore';
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
      // 1. Fetch official allocations with deep resilience
      let samplesSnap: QuerySnapshot<DocumentData> | null = null;
      
      try {
          // Try primary collection first
          samplesSnap = await getDocs(collection(db, "marketingSamples"));
          
          // If explicitly empty, try fallback
          if (samplesSnap.empty) {
              samplesSnap = await getDocs(collection(db, "q4Allocation"));
          }
      } catch (e) {
          console.warn("Primary inventory fetch failed, attempting fallback:", e);
          try {
              samplesSnap = await getDocs(collection(db, "q4Allocation"));
          } catch (fallbackError) {
              console.error("All inventory fetch paths failed:", fallbackError);
          }
      }
      
      const fetchedSamples: MarketingSample[] = [];
      if (samplesSnap && !samplesSnap.empty) {
          samplesSnap.docs.forEach(doc => {
              const data = doc.data();
              if (!data) return;
              
              const name = data.displayMaterialName || data.materialName || "Unknown Item";
              const group = data.prodGroupProdSubGroup || data.productGroup || "Uncategorized";
              const qty = Number(data.allocationQuantity || 0);
              
              fetchedSamples.push({ 
                  id: doc.id, 
                  productGroup: group, 
                  materialName: name, 
                  allocationQuantity: isNaN(qty) ? 0 : qty
              });
          });
      }
      
      // Sort in memory to avoid missing index errors on server
      fetchedSamples.sort((a, b) => a.materialName.localeCompare(b.materialName));
      setMarketingSamples(fetchedSamples);

      // 2. Fetch user-specific usage
      try {
          const usageSnap = await getDocs(query(collection(db, "coverageEntries"), where("userId", "==", user.uid)));
          const usage: Record<string, number> = {};
          
          usageSnap.docs.forEach(doc => {
              const entry = doc.data();
              if (!entry) return;
              
              if (entry.primarySampleName && entry.primaryProductQty) {
                  const pQty = Number(entry.primaryProductQty);
                  if (!isNaN(pQty)) usage[entry.primarySampleName] = (usage[entry.primarySampleName] || 0) + pQty;
              }
              if (entry.secondarySampleName && entry.secondaryProductQty) {
                  const sQty = Number(entry.secondaryProductQty);
                  if (!isNaN(sQty)) usage[entry.secondarySampleName] = (usage[entry.secondarySampleName] || 0) + sQty;
              }
              if (entry.reminderProducts && Array.isArray(entry.reminderProducts)) {
                  entry.reminderProducts.forEach((p: any) => {
                      if (p && p.sampleName && p.quantity) {
                          const rQty = Number(p.quantity);
                          if (!isNaN(rQty)) usage[p.sampleName] = (usage[p.sampleName] || 0) + rQty;
                      }
                  });
              }
          });
          setUsedQuantities(usage);
      } catch (usageError) {
          console.warn("Usage tracking data could not be fully loaded:", usageError);
      }

    } catch (error: any) {
        console.error("Critical error in inventory engine:", error);
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'marketingSamples',
            operation: 'list',
        }));
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
