
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { CoverageEntry } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';

export const useAllCoverageEntries = () => {
  const { toast } = useToast();
  const [entries, setEntries] = useState<CoverageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "coverageEntries"), orderBy("submittedAt", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedEntries: CoverageEntry[] = [];
      querySnapshot.forEach((doc) => {
        fetchedEntries.push({ id: doc.id, ...doc.data() } as CoverageEntry);
      });
      setEntries(fetchedEntries);
    } catch (error) {
      console.error("Error fetching all coverage entries:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not fetch coverage reports. Check Firestore rules." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const deleteEntry = useCallback(async (id: string) => {
    try {
        const entryToDelete = entries.find(e => e.id === id);
        await deleteDoc(doc(db, "coverageEntries", id));
        setEntries(prev => prev.filter(e => e.id !== id));
        if(entryToDelete) {
            toast({ variant: 'destructive', title: "Entry Deleted", description: `Coverage for ${entryToDelete.firstName} ${entryToDelete.lastName} has been removed.` });
        }
    } catch (error) {
        toast({ variant: 'destructive', title: "Delete Failed", description: "Could not delete entry from server." });
    }
  }, [entries, toast]);

  return { entries, loading, fetchEntries, deleteEntry };
};

    