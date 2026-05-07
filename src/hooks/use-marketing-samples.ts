
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { MarketingSample } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, where, FirestoreError, DocumentData, QuerySnapshot } from 'firebase/firestore';
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
      // 1. Fetch official allocations from marketingSamples with defensive fallback
      let samplesSnap: QuerySnapshot<DocumentData>;
      try {
          samplesSnap = await getDocs(query(collection(db, "marketingSamples"), orderBy("displayMaterialName", "asc")));
          if (samplesSnap.empty) {
              samplesSnap = await getDocs(query(collection(db, "q4Allocation"), orderBy("displayMaterialName", "asc")));
          }
      } catch (e) {
          // Fallback to legacy if first query fails (e.g. collection missing)
          samplesSnap = await getDocs(query(collection(db, "q4Allocation"), orderBy("displayMaterialName", "asc")));
      }
      
      const fetchedSamples = samplesSnap.docs.map(doc => {
          const data = doc.data();
          // Defensive mapping for inconsistent field names
          const name = data.displayMaterialName || data.materialName || "Unknown Item";
          const group = data.prodGroupProdSubGroup || data.productGroup || "Uncategorized";
          const qty = Number(data.allocationQuantity || 0);
          
          return { 
              id: doc.id, 
              productGroup: group, 
              materialName: name, 
              allocationQuantity: isNaN(qty) ? 0 : qty
          } as MarketingSample;
      });
      
      setMarketingSamples(fetchedSamples);

      // 2. Fetch user-specific usage from coverage entries
      // Simplified query to avoid index requirements on live server
      const usageSnap = await getDocs(query(collection(db, "coverageEntries"), where("userId", "==", user.uid)));

      const usage: Record<string, number> = {};
      usageSnap.docs.forEach(doc => {
          const entry = doc.data();
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

    } catch (error: any) {
        console.error("Marketing samples fetch error:", error);
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
