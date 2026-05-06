
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
} from "firebase/firestore";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export const useDoctors = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    return ADMIN_UIDS.includes(user.uid) || (user.email && ADMIN_EMAILS.includes(user.email));
  }, [user]);

  const fetchDoctors = useCallback(async () => {
    if (!user || !db) {
      setDoctors([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let q;
      if (isUserAdmin) {
        q = query(collection(db, "doctors"));
      } else {
        q = query(collection(db, "doctors"), where("userId", "==", user.uid));
      }

      const querySnapshot = await getDocs(q);
      const fetchedDoctors: Doctor[] = [];
      querySnapshot.forEach((docSnap) => {
        fetchedDoctors.push({ id: docSnap.id, ...docSnap.data() } as Doctor);
      });

      setDoctors(fetchedDoctors);
    } catch (serverError: any) {
      const permissionError = new FirestorePermissionError({
        path: 'doctors',
        operation: 'list',
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
    } finally {
      setLoading(false);
    }
  }, [user, isUserAdmin]);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  const addDoctor = useCallback(
    async (doctorData: Omit<Doctor, "id">) => {
      if (!user || !db) return;
      const newDoctorData = { ...doctorData, userId: user.uid };
      const colRef = collection(db, "doctors");
      
      addDoc(colRef, newDoctorData)
        .then((docRef) => {
          setDoctors((prev) => [...prev, { id: docRef.id, ...newDoctorData }]);
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
        const q = query(collection(db, "doctors"), where("userId", "==", user.uid));
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
      const doctorRef = doc(db, "doctors", id);
      const payload = { ...dataToUpdate, userId: user.uid };

      updateDoc(doctorRef, payload)
        .catch(async () => {
          const permissionError = new FirestorePermissionError({
            path: doctorRef.path,
            operation: 'update',
            requestResourceData: payload,
          } satisfies SecurityRuleContext);
          errorEmitter.emit('permission-error', permissionError);
        });

      setDoctors((prev) =>
        prev.map((d) => (d.id === doctorData.id ? { ...doctorData, userId: user.uid } : d))
      );
    },
    [user]
  );

  const deleteDoctor = useCallback(
    async (id: string) => {
      if (!user || !db) return;
      const doctorRef = doc(db, "doctors", id);
      
      deleteDoc(doctorRef)
        .catch(async () => {
          const permissionError = new FirestorePermissionError({
            path: doctorRef.path,
            operation: 'delete',
          } satisfies SecurityRuleContext);
          errorEmitter.emit('permission-error', permissionError);
        });

      setDoctors((prev) => prev.filter((d) => d.id !== id));
      toast({ variant: "destructive", title: "Doctor Removed" });
    },
    [user, toast]
  );

  const deleteDoctorsBulk = useCallback(
    async (ids: string[]) => {
      if (!user || !db || ids.length === 0) return;
      const batch = writeBatch(db);
      ids.forEach((id) => batch.delete(doc(db, "doctors", id)));

      try {
        await batch.commit();
        setDoctors((prev) => prev.filter((d) => !ids.includes(d.id)));
        toast({ variant: "destructive", title: "Doctors Deleted" });
      } catch (serverError) {
        const permissionError = new FirestorePermissionError({
          path: 'doctors',
          operation: 'delete',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      }
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
