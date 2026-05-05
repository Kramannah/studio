
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Q4Allocation } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, writeBatch, doc, orderBy } from 'firebase/firestore';

export const useQ4Allocation = () => {
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "q4Allocation"), orderBy("displayMaterialName", "asc")));
      const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Q4Allocation));
      setAllocations(fetched);
    } catch (error: any) {
      console.error("Q4 fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addAllocationsBulk = async (data: Omit<Q4Allocation, 'id'>[]) => {
    try {
      const batch = writeBatch(db);
      data.forEach(item => {
        // Create unique ID based on material name to prevent duplicates
        const docId = item.displayMaterialName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!docId) return;
        const docRef = doc(db, "q4Allocation", docId);
        batch.set(docRef, item, { merge: true });
      });
      await batch.commit();
      await fetchData();
      return true;
    } catch (error: any) {
      console.error("Q4 Bulk Upload Error:", error);
      return false;
    }
  }

  return { allocations, loading, refetch: fetchData, addAllocationsBulk };
};
