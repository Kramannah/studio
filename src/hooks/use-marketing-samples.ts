
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { MarketingSample } from '@/lib/types';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, FirestoreError } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export const useMarketingSamples = () => {
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
      // Corrected collection name to match backend.json and firestore.rules
      const samplesSnap = await getDocs(query(collection(db, "q4Allocation"), orderBy("displayMaterialName", "asc")));
      
      const fetchedSamples = samplesSnap.docs.map(doc => {
          const data = doc.data();
          return { 
              id: doc.id, 
              productGroup: data.prodGroupProdSubGroup || "Uncategorized", 
              materialName: data.displayMaterialName || "Unknown", 
              allocationQuantity: data.allocationQuantity || 0 
          } as MarketingSample;
      });
      
      setMarketingSamples(fetchedSamples);

      // Fetch usage from coverage entries
      const usageSnap = await getDocs(query(collection(db, "coverageEntries"), where("userId", "==", currentUser.uid)));
      const usage: Record<string, number> = {};
      usageSnap.docs.forEach(doc => {
          const entry = doc.data();
          if (entry.primarySampleName) usage[entry.primarySampleName] = (usage[entry.primarySampleName] || 0) + (entry.primaryProductQty || 0);
          if (entry.secondarySampleName) usage[entry.secondarySampleName] = (usage[entry.secondarySampleName] || 0) + (entry.secondaryProductQty || 0);
      });
      setUsedQuantities(usage);

    } catch (error: any) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'q4Allocation',
        operation: 'list',
      }));
    } finally {
      setLoading(false);
    }
  }, []);

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
