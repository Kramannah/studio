
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';

// CRITICAL: This hook is restricted to prevent massive quota-killing scans.
// It is intended for limited admin oversight only.
export const useAllCoverageEntries = () => {
  const { toast } = useToast();
  const [entries, setEntries] = useState<CoverageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      // Enforce a strict limit to prevent Quota Exceeded errors
      const q = query(collection(db, "coverageEntries"), orderBy("submittedAt", "desc"), limit(200));
      const querySnapshot = await getDocs(q);
      const fetchedEntries: CoverageEntry[] = [];
      querySnapshot.forEach((doc) => {
        fetchedEntries.push({ id: doc.id, ...doc.data() } as CoverageEntry);
      });
      setEntries(fetchedEntries);
    } catch (error) {
      console.warn("Global entries fetch limited for quota:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const deleteEntry = useCallback(async (id: string) => {
    try {
        await deleteDoc(doc(db!, "coverageEntries", id));
        setEntries(prev => prev.filter(e => e.id !== id));
        toast({ variant: 'destructive', title: "Entry Deleted" });
    } catch (error) {
        toast({ variant: 'destructive', title: "Delete Failed" });
    }
  }, [toast]);

  return { entries, loading, fetchEntries, deleteEntry };
};
