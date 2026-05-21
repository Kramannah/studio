"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Doctor } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "./use-auth";
import { db } from "@/lib/firebase";
import { ADMIN_UIDS, ADMIN_EMAILS } from "@/lib/admins";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
  limit,
} from "firebase/firestore";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const DOCTORS_STORAGE_KEY = 'sfe-doctors-v4';

export const useDoctors = (active: boolean = true) => {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(false);

  const getStoreKey = () => `${DOCTORS_STORAGE_KEY}_${user?.uid}`;

  useEffect(() => {
    if (user?.uid) {
        try {
            const cached = localStorage.getItem(getStoreKey());
            if (cached) setDoctors(JSON.parse(cached));
        } catch (e) {}
    }
  }, [user?.uid]);

  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    const normalizedEmail = (user.email ?? "").toLowerCase();
    return ADMIN_UIDS.includes(user.uid) || 
           normalizedEmail === 'mbustamante@hovidinc.com' ||
           ADMIN_EMAILS.some(e => e.toLowerCase() === normalizedEmail) ||
           profile?.role === 'Admin';
  }, [user, profile]);

  const fetchDoctors = useCallback(async () => {
    if (!user || !db || !active || !navigator.onLine) {
      if (!active) setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let q;
      if (isUserAdmin) {
        q = query(collection(db, "doctors"), limit(10000));
      } else {
        q = query(collection(db, "doctors"), where("userId", "==", user.uid), limit(10000));
      }

      const querySnapshot = await getDocs(q);
      const fetchedDoctors: Doctor[] = [];
      querySnapshot.forEach((docSnap) => {
        fetchedDoctors.push({ id: docSnap.id, ...docSnap.data() } as Doctor);
      });

      setDoctors(fetchedDoctors);
      localStorage.setItem(getStoreKey(), JSON.stringify(fetchedDoctors));
    } catch (serverError: any) {
        const permissionError = new FirestorePermissionError({
            path: 'doctors',
            operation: 'list',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
    } finally {
      setLoading(false);
    }
  }, [user, isUserAdmin, active]);

  useEffect(() => {
    if (active) {
        fetchDoctors();
    }
  }, [fetchDoctors, active]);

  const addDoctor = useCallback(
    async (doctorData: Omit<Doctor, "id">) => {
      if (!user || !db) return;
      const newDoctorData = { ...doctorData, userId: user.uid };
      const colRef = collection(db, "doctors");
      addDoc(colRef, newDoctorData)
        .then((docRef) => {
            const created = { id: docRef.id, ...newDoctorData };
            setDoctors((prev) => {
                const next = [...prev, created];
                localStorage.setItem(getStoreKey(), JSON.stringify(next));
                return next;
            });
            toast({
                title: "Doctor Added",
                description: `${doctorData.firstName} ${doctorData.lastName} has been added.`,
            });
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: colRef.path,
                operation: 'create',
                requestResourceData: newDoctorData,
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        });
    },
    [user, toast]
  );

  const addDoctorsBulk = useCallback(
    async (doctorsToAdd: Omit<Doctor, 'id' | 'userId'>[]) => {
      if (!user || !db || doctorsToAdd.length === 0) return;
      setLoading(true);

      try {
        const q = query(collection(db, "doctors"), where("userId", "==", user.uid), limit(10000));
        const querySnapshot = await getDocs(q);
        const existingDoctors = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Doctor[];
        const existingDoctorMap = new Map<string, Doctor>();
        existingDoctors.forEach(doc => {
          const key = `${doc.firstName.toLowerCase()}|${doc.lastName.toLowerCase()}`;
          existingDoctorMap.set(key, doc);
        });

        const operations: { type: 'create' | 'update'; data: any; id?: string }[] = [];
        
        doctorsToAdd.forEach((newDoctor) => {
          const key = `${newDoctor.firstName.toLowerCase()}|${newDoctor.lastName.toLowerCase()}`;
          const existingDoctor = existingDoctorMap.get(key);
          if (existingDoctor) {
            operations.push({ type: 'update', data: { ...newDoctor, userId: user.uid }, id: existingDoctor.id });
          } else {
            operations.push({ type: 'create', data: { ...newDoctor, userId: user.uid } });
          }
        });

        if (operations.length === 0) {
          toast({ title: "No Changes" });
          setLoading(false);
          return;
        }

        const chunkSize = 499;
        for (let i = 0; i < operations.length; i += chunkSize) {
          const chunk = operations.slice(i, i + chunkSize);
          const batch = writeBatch(db);
          chunk.forEach(op => {
            if (op.type === 'create') {
              batch.set(doc(collection(db, "doctors")), op.data);
            } else if (op.type === 'update' && op.id) {
              batch.update(doc(db, "doctors", op.id), op.data);
            }
          });
          await batch.commit();
        }

        await fetchDoctors();
        toast({ title: "Upload Successful" });
      } catch (serverError: any) {
        const permissionError = new FirestorePermissionError({
          path: 'doctors',
          operation: 'write',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      } finally {
        setLoading(false);
      }
    },
    [user, toast, fetchDoctors]
  );

  const updateDoctor = useCallback(
    async (doctorData: Doctor) => {
      if (!user || !db) return;
      const { id, userId, ...dataToUpdate } = doctorData;
      const docRef = doc(db, "doctors", id);
      updateDoc(docRef, { ...dataToUpdate, userId: user.uid })
        .then(() => {
            setDoctors((prev) => {
                const next = prev.map((d) => (d.id === doctorData.id ? { ...doctorData, userId: user.uid } : d));
                localStorage.setItem(getStoreKey(), JSON.stringify(next));
                return next;
            });
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: docRef.path,
                operation: 'update',
                requestResourceData: dataToUpdate,
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        });
    },
    [user]
  );

  const deleteDoctor = useCallback(
    async (id: string) => {
      if (!user || !db) return;
      const docRef = doc(db, "doctors", id);
      deleteDoc(docRef)
        .then(() => {
            setDoctors((prev) => {
                const next = prev.filter((d) => d.id !== id);
                localStorage.setItem(getStoreKey(), JSON.stringify(next));
                return next;
            });
            toast({ variant: "destructive", title: "Doctor Removed" });
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: docRef.path,
                operation: 'delete',
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        });
    },
    [user, toast]
  );

  const deleteDoctorsBulk = useCallback(
    async (ids: string[]) => {
      if (!user || !db || ids.length === 0) return;
      const batch = writeBatch(db);
      ids.forEach((id) => batch.delete(doc(db, "doctors", id)));

      batch.commit()
        .then(() => {
            setDoctors((prev) => {
                const next = prev.filter((d) => !ids.includes(d.id));
                localStorage.setItem(getStoreKey(), JSON.stringify(next));
                return next;
            });
            toast({ variant: "destructive", title: "Doctors Deleted" });
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: 'doctors',
                operation: 'delete',
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        });
    },
    [user, toast]
  );

  return {
    doctors,
    addDoctor,
    updateDoctor,
    deleteDoctor,
    addDoctorsBulk,
    deleteDoctorsBulk,
    loading,
  };
};