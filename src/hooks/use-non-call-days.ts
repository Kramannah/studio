
"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import type { NonCallDay } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { parseISO, isValid, isWithinInterval, format } from 'date-fns';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { getMonthRangeISO, safeStorageSet } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const NCD_STORAGE_KEY = 'sfe-non-call-days-v5';

export const useNonCallDays = (active: boolean = true, selectedMonth?: string) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [nonCallDays, setNonCallDays] = useState<NonCallDay[]>([]);
  const [loading, setLoading] = useState(false);
  
  const lastFetchedKeyRef = useRef<string | null>(null);

  const getStoreKey = () => `${NCD_STORAGE_KEY}_${user?.uid}_${selectedMonth || 'current'}`;

  useEffect(() => {
    if (user?.uid) {
        try {
            const cached = localStorage.getItem(getStoreKey());
            if (cached) {
                setNonCallDays(JSON.parse(cached));
            } else {
                setNonCallDays([]);
            }
        } catch (e) {}
    }
  }, [user?.uid, selectedMonth]);

  const fetchNonCallDays = useCallback(async (force = false) => {
    if (!user || !db || (!active && !force) || !navigator.onLine) return;
    
    const fetchKey = `${user.uid}_${selectedMonth || 'current'}`;
    if (!force && lastFetchedKeyRef.current === fetchKey && nonCallDays.length > 0) return;

    setLoading(true);

    try {
      const { start, end } = getMonthRangeISO(selectedMonth);
      
      const q = query(
        collection(db, "nonCallDays"), 
        where("userId", "==", user.uid),
        where("date", ">=", start),
        where("date", "<=", end),
        limit(200)
      );
      
      try {
          const querySnapshot = await getDocs(q);
          const fetched: NonCallDay[] = querySnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as NonCallDay) }));
          setNonCallDays(fetched);
          lastFetchedKeyRef.current = fetchKey;
          safeStorageSet(getStoreKey(), JSON.stringify(fetched));
      } catch (indexError) {
          const fallbackQ = query(collection(db, "nonCallDays"), where("userId", "==", user.uid), limit(200));
          const querySnapshot = await getDocs(fallbackQ);
          const interval = { start: parseISO(start), end: parseISO(end) };
          const filtered = querySnapshot.docs
            .map(doc => ({ id: doc.id, ...(doc.data() as NonCallDay) }))
            .filter(n => n.date && isValid(parseISO(n.date)) && isWithinInterval(parseISO(n.date), interval));
          
          setNonCallDays(filtered);
      }
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'nonCallDays',
                operation: 'list',
            }));
        }
    } finally {
      setLoading(false);
    }
  }, [user, active, nonCallDays.length, selectedMonth]);

  useEffect(() => {
    const currentMonth = format(new Date(), 'yyyy-MM');
    const isCurrentMonth = !selectedMonth || selectedMonth === currentMonth;

    if (user && active && isCurrentMonth) {
        fetchNonCallDays();
    }
  }, [fetchNonCallDays, active, user, selectedMonth]);

  const addNonCallDay = async (entry: any) => {
    if (!user || !db) return;
    const newEntry = { userId: user.uid, ...entry, status: 'pending' as const };
    addDoc(collection(db, "nonCallDays"), newEntry)
      .then((docRef) => {
        setNonCallDays(prev => [...prev, { id: docRef.id, ...newEntry }]);
        toast({ title: "Request Submitted" });
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'nonCallDays',
            operation: 'create',
            requestResourceData: newEntry,
        }));
      });
  };

  return { nonCallDays, addNonCallDay, loading, fetchNonCallDays };
};
