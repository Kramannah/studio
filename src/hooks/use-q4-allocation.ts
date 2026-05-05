
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, writeBatch, doc, orderBy, deleteDoc } from 'firebase/firestore';
import { useToast } from './use-toast';

export const useQ4Allocation = () => {
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const { toast } = useToast();

  // Listener for Allocation Definitions
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "q4Allocation"), orderBy("displayMaterialName", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Q4Allocation));
      setAllocations(fetched);
      setLoading(false);
    }, (error) => {
      console.error("Allocation listener error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time Global Usage Listener
  useEffect(() => {
    setLoadingUsage(true);
    const q = query(collection(db, "coverageEntries"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
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
      setLoadingUsage(false);
    }, (error) => {
      console.error("Usage listener error:", error);
      setLoadingUsage(false);
    });

    return () => unsubscribe();
  }, []);

  const refetch = () => {
      // Data is synced in real-time via onSnapshot
  };

  const addAllocationsBulk = async (data: Omit<Q4Allocation, 'id'>[], quarter: 'Q3' | 'Q4') => {
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
    } catch (error: any) {
      console.error("Bulk Upload Error:", error);
      return false;
    }
  };

  const deleteAllocationsBulk = async (ids: string[]) => {
      try {
          const batch = writeBatch(db);
          ids.forEach(id => {
              const docRef = doc(db, "q4Allocation", id);
              batch.delete(docRef);
          });
          await batch.commit();
          toast({ title: "Deleted Successfully", description: `${ids.length} products removed.` });
          return true;
      } catch (error) {
          console.error("Delete Error:", error);
          toast({ variant: "destructive", title: "Delete Failed" });
          return false;
      }
  };

  return { allocations, usedQuantities, loading: loading || loadingUsage, refetch, addAllocationsBulk, deleteAllocationsBulk };
};
