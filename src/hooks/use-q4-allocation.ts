
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Q4Allocation, CoverageEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, query, writeBatch, doc, orderBy, where, limit, getDocs, FirestoreError } from 'firebase/firestore';
import { useToast } from './use-toast';
import { useAuth } from './use-auth';
import { subDays, parseISO, isValid, isAfter } from 'date-fns';
import { ADMIN_UIDS, ADMIN_EMAILS, MANAGER_TEAMS } from '@/lib/admins';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const USAGE_CACHE_KEY = 'hovid_usage_cache_v3';
const CACHE_DURATION = 300000; // 5 minutes

export const useQ4Allocation = () => {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState<Q4Allocation[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const isUserAdminOrManager = useCallback(() => {
    if (!user) return false;
    const email = user.email?.toLowerCase() || '';
    return ADMIN_UIDS.includes(user.uid) || 
           ADMIN_EMAILS.some(e => e.toLowerCase() === email) || 
           Object.keys(MANAGER_TEAMS).includes(user.uid);
  }, [user]);

  const fetchAllocations = useCallback(async () => {
    if (!db || !user) return;
    
    try {
        const colRef = collection(db, "q4Allocation");
        const q = query(colRef, orderBy("displayMaterialName", "asc"));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            setAllocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Q4Allocation)));
        }
    } catch (error: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'q4Allocation',
          operation: 'list',
        }));
    }
  }, [user]);

  const fetchUsage = useCallback(async (force = false) => {
    if (!db || !user) return;
    
    if (!force) {
        try {
            const cached = localStorage.getItem(USAGE_CACHE_KEY);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_DURATION) {
                    setUsedQuantities(data);
                    return;
                }
            }
        } catch (e) {}
    }

    try {
      const colRef = collection(db, "coverageEntries");
      const startDate = subDays(new Date(), 90);
      
      let usageQuery;
      if (isUserAdminOrManager()) {
          // Managers/Admins can see territory usage trends
          usageQuery = query(colRef, limit(1000));
      } else {
          // PMRs MUST query by userId to satisfy security rules
          // We remove the date filter from the query to avoid needing a composite index
          usageQuery = query(colRef, where("userId", "==", user.uid));
      }

      const snapshot = await getDocs(usageQuery);
      const usage: Record<string, number> = {};
      
      snapshot.docs.forEach(doc => {
        const entry = doc.data() as CoverageEntry;
        
        // Manual date filtering to bypass Firestore index requirements
        const subDate = entry.submittedAt ? parseISO(entry.submittedAt) : null;
        if (!isValid(subDate) || !isAfter(subDate!, startDate)) return;

        if (entry.primarySampleName && entry.primaryProductQty) {
            usage[entry.primarySampleName] = (usage[entry.primarySampleName] || 0) + Number(entry.primaryProductQty);
        }
        if (entry.secondarySampleName && entry.secondaryProductQty) {
            usage[entry.secondarySampleName] = (usage[entry.secondarySampleName] || 0) + Number(entry.secondaryProductQty);
        }
        if (entry.reminderProducts && Array.isArray(entry.reminderProducts)) {
            entry.reminderProducts.forEach(prod => {
                if (prod.sampleName && prod.quantity) {
                    usage[prod.sampleName] = (usage[prod.sampleName] || 0) + Number(prod.quantity);
                }
            });
        }
      });

      setUsedQuantities(usage);
      localStorage.setItem(USAGE_CACHE_KEY, JSON.stringify({ data: usage, timestamp: Date.now() }));
    } catch (error: any) {
        console.warn("Usage tracker restricted or requires sync:", error);
    }
  }, [user, isUserAdminOrManager]);

  useEffect(() => {
    const init = async () => {
        setLoading(true);
        await Promise.all([fetchAllocations(), fetchUsage()]);
        setLoading(false);
    };
    init();
  }, [fetchAllocations, fetchUsage]);

  const refetch = useCallback(async () => {
      setLoading(true);
      await fetchUsage(true);
      setLoading(false);
  }, [fetchUsage]);

  const addAllocationsBulk = async (data: Omit<Q4Allocation, 'id'>[], quarter: 'Q3' | 'Q4') => {
    if (!db) return false;
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
      toast({ title: "Import Successful", description: `Database updated for ${quarter}.` });
      fetchAllocations();
      return true;
    } catch (err) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'q4Allocation',
          operation: 'write',
        }));
        return false;
    }
  };

  const deleteAllocationsBulk = async (ids: string[]) => {
      if (!db) return false;
      const batch = writeBatch(db);
      ids.forEach(id => batch.delete(doc(db, "q4Allocation", id)));
      try {
          await batch.commit();
          toast({ title: "Deleted Successfully" });
          fetchAllocations();
          return true;
      } catch (err) {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'q4Allocation',
            operation: 'delete',
          }));
          return false;
      }
  };

  return { allocations, usedQuantities, loading, refetch, addAllocationsBulk, deleteAllocationsBulk };
};
