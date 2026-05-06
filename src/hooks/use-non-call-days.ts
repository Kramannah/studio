
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { NonCallDay } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { parseISO, isValid, startOfMonth, isAfter } from 'date-fns';
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export const useNonCallDays = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [nonCallDays, setNonCallDays] = useState<NonCallDay[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNonCallDays = useCallback(async () => {
    if (!user || !db) {
      setNonCallDays([]);
      setLoading(false);
      return;
    };
    setLoading(true);
    try {
      const q = query(collection(db, "nonCallDays"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const fetched: NonCallDay[] = [];
      querySnapshot.forEach((doc) => {
        fetched.push({ id: doc.id, ...doc.data() } as NonCallDay);
      });

      const monthStart = startOfMonth(new Date());

      const filtered = fetched.filter(d => {
          const dDate = d.date ? parseISO(d.date) : null;
          return dDate && isValid(dDate) && isAfter(dDate, monthStart);
      });

      setNonCallDays(filtered);
    } catch (serverError) {
      const permissionError = new FirestorePermissionError({
        path: 'nonCallDays',
        operation: 'list',
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNonCallDays();
  }, [fetchNonCallDays]);

  return { 
      nonCallDays, 
      addNonCallDay: async (entry: any) => {
          if (!user || !db) return;
          const newEntry = { userId: user.uid, ...entry, status: 'pending' as const };
          const colRef = collection(db, "nonCallDays");
          
          addDoc(colRef, newEntry)
            .then((docRef) => {
              setNonCallDays(prev => [...prev, { id: docRef.id, ...newEntry }]);
              toast({ title: "Request Submitted" });
            })
            .catch(async (serverError) => {
              const permissionError = new FirestorePermissionError({
                path: colRef.path,
                operation: 'create',
                requestResourceData: newEntry,
              } satisfies SecurityRuleContext);
              errorEmitter.emit('permission-error', permissionError);
            });
      }, 
      loading,
      fetchNonCallDays
  };
};
