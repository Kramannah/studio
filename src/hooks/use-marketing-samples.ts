
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { MarketingSample } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, DocumentData, QuerySnapshot } from 'firebase/firestore';
import { useAuth } from './use-auth';

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
      
      try {
          samplesSnap = await getDocs(collection(db, "marketingSamples"));
          if (samplesSnap.empty) {
              samplesSnap = await getDocs(collection(db, "q4Allocation"));
          }
      } catch (e) {
          try {
              samplesSnap = await getDocs(collection(db, "q4Allocation"));
          } catch (fallbackError) {
              console.error("Critical: Inventory source inaccessible.");
          }
      }
      
      const fetchedSamples: any[] = [];
      if (samplesSnap && !samplesSnap.empty) {
          samplesSnap.docs.forEach(doc => {
              const data = doc.data();
              if (!data) return;
              
              // LOGGING: Identify missing fields for the user
              const name = data.displayMaterialName || data.materialName;
              const group = data.prodGroupProdSubGroup || data.productGroup;

              if (!name || !group || data.allocationQuantity === undefined) {
                  console.group(`%c DATA ALERT: Malformed Record in marketingSamples `, 'background: #dc2626; color: white; font-weight: bold;');
                  console.log(`Document ID: ${doc.id}`);
                  console.log(`Missing Name: ${!name}`);
                  console.log(`Missing Group: ${!group}`);
                  console.log(`Missing Qty: ${data.allocationQuantity === undefined}`);
                  console.log(`Raw Data:`, data);
                  console.groupEnd();
              }
              
              // ULTRA-SAFE CASTING: Assign hard defaults if missing
              const safeName = String(name ?? "Unknown Item");
              const safeGroup = String(group ?? "Uncategorized");
              const safeQty = Number(data.allocationQuantity ?? 0);
              
              fetchedSamples.push({ 
                  id: doc.id, 
                  productGroup: safeGroup, 
                  prodGroupProdSubGroup: safeGroup,
                  materialName: safeName, 
                  displayMaterialName: safeName,
                  allocationQuantity: isNaN(safeQty) ? 0 : safeQty
              });
          });
      }
      
      fetchedSamples.sort((a, b) => String(a.materialName).localeCompare(String(b.materialName)));
      setMarketingSamples(fetchedSamples);

      try {
          const usageSnap = await getDocs(query(collection(db, "coverageEntries"), where("userId", "==", user.uid)));
          const usage: Record<string, number> = {};
          
          usageSnap.docs.forEach(doc => {
              const entry = doc.data();
              if (!entry) return;
              
              const addQty = (name?: any, qty?: any) => {
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
      } catch (usageError) {}

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
