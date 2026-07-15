
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
import { safeStorageSet } from "@/lib/utils";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const DOCTORS_STORAGE_KEY = 'sfe-doctors-v5';

export const useDoctors = (active: boolean = true) => {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.uid) {
        try {
            const cached = localStorage.getItem(`${DOCTORS_STORAGE_KEY}_${user.uid}`);
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
    if (!user || !db || !active || !navigator.onLine) return;

    setLoading(true);
    try {
      let q;
      if (isUserAdmin) {
        q = query(collection(db, "doctors"), limit(5000));
      } else {
        q = query(collection(db, "doctors"), where("userId", "==", user.uid), limit(2000));
      }

      const querySnapshot = await getDocs(q);
      const fetchedDoctors: Doctor[] = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Doctor));

      setDoctors(fetchedDoctors);
      safeStorageSet(`${DOCTORS_STORAGE_KEY}_${user.uid}`, JSON.stringify(fetchedDoctors));
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'doctors',
                operation: 'list',
            }));
        }
    } finally {
      setLoading(false);
    }
  }, [user, isUserAdmin, active]);

  useEffect(() => {
    if (active) fetchDoctors();
  }, [fetchDoctors, active]);

  const addDoctor = async (doctorData: Omit<Doctor, "id">) => {
    if (!user || !db) return;
    const newDoctorData = { ...doctorData, userId: user.uid };
    addDoc(collection(db, "doctors"), newDoctorData)
      .then((docRef) => {
        const created = { id: docRef.id, ...newDoctorData } as Doctor;
        setDoctors((prev) => {
            const next = [...prev, created];
            safeStorageSet(`${DOCTORS_STORAGE_KEY}_${user.uid}`, JSON.stringify(next));
            return next;
        });
        toast({ title: "Doctor Added" });
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'doctors',
            operation: 'create',
            requestResourceData: newDoctorData,
        }));
      });
  };

  const addDoctorsBulk = async (doctorsToAdd: Omit<Doctor, 'id' | 'userId'>[]) => {
    if (!user || !db || doctorsToAdd.length === 0) return;
    setLoading(true);
    const batch = writeBatch(db);
    const processedDoctors: any[] = doctorsToAdd.map(d => ({ ...d, userId: user.uid }));
    
    processedDoctors.forEach(data => {
        batch.set(doc(collection(db, "doctors")), data);
    });

    batch.commit()
      .then(() => {
        fetchDoctors();
        toast({ title: "Upload Successful" });
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'doctors',
            operation: 'create',
            requestResourceData: processedDoctors,
        }));
      })
      .finally(() => setLoading(false));
  };

  const updateDoctor = async (doctorData: Doctor) => {
    if (!user || !db) return;
    const { id, userId, ...dataToUpdate } = doctorData;
    const docRef = doc(db, "doctors", id);
    const finalData = { ...dataToUpdate, userId: user.uid };
    
    updateDoc(docRef, finalData)
      .then(() => {
        setDoctors((prev) => {
            const next = prev.map((d) => (d.id === doctorData.id ? { ...doctorData, userId: user.uid } : d));
            safeStorageSet(`${DOCTORS_STORAGE_KEY}_${user.uid}`, JSON.stringify(next));
            return next;
        });
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: finalData,
        }));
      });
  };

  const deleteDoctor = async (id: string) => {
    if (!user || !db) return;
    const docRef = doc(db, "doctors", id);
    deleteDoc(docRef)
      .then(() => {
        setDoctors((prev) => {
            const next = prev.filter((d) => d.id !== id);
            safeStorageSet(`${DOCTORS_STORAGE_KEY}_${user.uid}`, JSON.stringify(next));
            return next;
        });
        toast({ variant: "destructive", title: "Doctor Removed" });
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        }));
      });
  };

  const deleteDoctorsBulk = async (ids: string[]) => {
    if (!user || !db || ids.length === 0) return;
    const batch = writeBatch(db);
    ids.forEach((id) => batch.delete(doc(db, "doctors", id)));
    
    batch.commit()
      .then(() => {
        setDoctors((prev) => {
            const next = prev.filter((d) => !ids.includes(d.id));
            safeStorageSet(`${DOCTORS_STORAGE_KEY}_${user.uid}`, JSON.stringify(next));
            return next;
        });
        toast({ variant: "destructive", title: "Doctors Deleted" });
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'doctors',
            operation: 'delete',
        }));
      });
  };

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
