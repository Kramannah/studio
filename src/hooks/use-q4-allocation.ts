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

const USAGE_CACHE_KEY = 'hovid_usage_cache_v4';
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
        // Try the new collection name first
        let colRef = collection(db, "marketingSamples");
        let q = query(colRef, orderBy("displayMaterialName", "asc"));
        let snapshot = await getDocs(q).catch(async () => {
            // Fallback to legacy name if new one doesn't work or is empty
            colRef = collection(db, "q4Allocation");
            q = query(colRef, orderBy("displayMaterialName", "asc"));
            return await getDocs(q);
        });
        
        if (!snapshot.empty) {
            setAllocations(snapshot.docs.map(doc => {
                const data = doc.data();
                return { 
                    id: doc.id, 
                    prodGroupProdSubGroup: data.prodGroupProdSubGroup || data.productGroup || "",
                    displayMaterialName: data.displayMaterialName || data.materialName || "",
                    allocationQuantity: data.allocationQuantity || 0,
                    quarter: data.quarter || 'Q4'
                } as Q4Allocation;
            }));
        }
    } catch (error: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'marketingSamples',
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
      const startDate = subDays(new Date(), 120); // Extended range for broader context
      
      let usageQuery;
      if (isUserAdminOrManager()) {
          usageQuery = query(colRef, limit(2000));
      } else {
          usageQuery = query(colRef, where("userId", "==", user.uid));
      }

      const snapshot = await getDocs(usageQuery);
      const usage: Record<string, number> = {};
      
      snapshot.docs.forEach(doc => {
        const entry = doc.data() as CoverageEntry;
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
        console.warn("Usage tracker synchronization required:", error);
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
      await Promise.all([fetchAllocations(), fetchUsage(true)]);
      setLoading(false);
  }, [fetchAllocations, fetchUsage]);

  const addAllocationsBulk = async (data: Omit<Q4Allocation, 'id'>[], quarter: 'Q3' | 'Q4') => {
    if (!db) return false;
    try {
      const batch = writeBatch(db);
      data.forEach(item => {
        const baseId = item.displayMaterialName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!baseId) return;
        const docId = `${quarter.toLowerCase()}_${baseId}`;
        const docRef = doc(db, "marketingSamples", docId);
        batch.set(docRef, { ...item, quarter }, { merge: true });
      });
      await batch.commit();
      toast({ title: "Import Successful", description: `Database updated for ${quarter}.` });
      fetchAllocations();
      return true;
    } catch (err) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'marketingSamples',
          operation: 'write',
        }));
        return false;
    }
  };

  const deleteAllocationsBulk = async (ids: string[]) => {
      if (!db) return false;
      const batch = writeBatch(db);
      ids.forEach(id => batch.delete(doc(db, "marketingSamples", id)));
      try {
          await batch.commit();
          toast({ title: "Deleted Successfully" });
          fetchAllocations();
          return true;
      } catch (err) {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'marketingSamples',
            operation: 'delete',
          }));
          return false;
      }
  };

  return { allocations, usedQuantities, loading, refetch, addAllocationsBulk, deleteAllocationsBulk };
};