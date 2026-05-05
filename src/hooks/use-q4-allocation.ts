
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Q4Allocation } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, writeBatch, doc, orderBy, deleteDoc } from 'firebase/firestore';
import { useToast } from './use-toast';

export const useQ4Allocation = () => {
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

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

  const refetch = () => {
      // Data is synced in real-time via onSnapshot, so we just return
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

  return { allocations, loading, refetch, addAllocationsBulk, deleteAllocationsBulk };
};
