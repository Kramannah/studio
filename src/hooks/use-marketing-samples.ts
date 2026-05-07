"use client"

import { useState, useEffect, useCallback } from 'react';
import type { MarketingSample } from '@/lib/types';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, where, FirestoreError } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from './use-toast';

export const useMarketingSamples = () => {
  const { toast } = useToast();
  const [marketingSamples, setMarketingSamples] = useState<MarketingSample[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const currentUser = auth?.currentUser;
    if (!currentUser || !db) {
        setLoading(false);
        return;
    }
    
    try {
      // 1. Fetch official allocations from marketingSamples
      const samplesSnap = await getDocs(query(collection(db, "marketingSamples"), orderBy("displayMaterialName", "asc")))
        .catch(async () => {
            // Fallback to legacy name if needed
            return await getDocs(query(collection(db, "q4Allocation"), orderBy("displayMaterialName", "asc")));
        })
        .catch((e) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'marketingSamples',
                operation: 'list',
            }));
            throw e;
        });
      
      const fetchedSamples = samplesSnap.docs.map(doc => {
          const data = doc.data();
          return { 
              id: doc.id, 
              productGroup: data.prodGroupProdSubGroup || data.productGroup || "Uncategorized", 
              materialName: data.displayMaterialName || data.materialName || "Unknown", 
              allocationQuantity: data.allocationQuantity || 0 
          } as MarketingSample;
      });
      
      setMarketingSamples(fetchedSamples);

      // 2. Fetch user-specific usage from coverage entries
      const usageSnap = await getDocs(query(collection(db, "coverageEntries"), where("userId", "==", currentUser.uid)))
        .catch((e) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'coverageEntries',
                operation: 'list',
            }));
            throw e;
        });

      const usage: Record<string, number> = {};
      usageSnap.docs.forEach(doc => {
          const entry = doc.data();
          if (entry.primarySampleName && entry.primaryProductQty) {
              usage[entry.primarySampleName] = (usage[entry.primarySampleName] || 0) + Number(entry.primaryProductQty);
          }
          if (entry.secondarySampleName && entry.secondaryProductQty) {
              usage[entry.secondarySampleName] = (usage[entry.secondarySampleName] || 0) + Number(entry.secondaryProductQty);
          }
          if (entry.reminderProducts && Array.isArray(entry.reminderProducts)) {
              entry.reminderProducts.forEach((p: any) => {
                  if (p.sampleName && p.quantity) {
                      usage[p.sampleName] = (usage[p.sampleName] || 0) + Number(p.quantity);
                  }
              });
          }
      });
      setUsedQuantities(usage);

    } catch (error: any) {
        console.error("Marketing samples fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { marketingSamples, usedQuantities, loading, refetch: fetchData };
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