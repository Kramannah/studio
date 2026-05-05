
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Q4Allocation } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, writeBatch, doc, orderBy, deleteDoc } from 'firebase/firestore';
import { useToast } from './use-toast';

export const useQ4Allocation = () => {
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "q4Allocation"), orderBy("displayMaterialName", "asc")));
      const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Q4Allocation));
      setAllocations(fetched);
    } catch (error: any) {
      console.error("Allocation fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addAllocationsBulk = async (data: Omit<Q4Allocation, 'id'>[], quarter: 'Q3' | 'Q4') => {
    try {
      const batch = writeBatch(db);
      data.forEach(item => {
        // Create unique ID based on material name and quarter to prevent overlaps
        const baseId = item.displayMaterialName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!baseId) return;
        const docId = `${quarter.toLowerCase()}_${baseId}`;
        const docRef = doc(db, "q4Allocation", docId);
        batch.set(docRef, { ...item, quarter }, { merge: true });
      });
      await batch.commit();
      await fetchData();
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
          await fetchData();
          toast({ title: "Deleted Successfully", description: `${ids.length} products removed.` });
          return true;
      } catch (error) {
          console.error("Delete Error:", error);
          toast({ variant: "destructive", title: "Delete Failed" });
          return false;
      }
  };

  return { allocations, loading, refetch: fetchData, addAllocationsBulk, deleteAllocationsBulk };
};
