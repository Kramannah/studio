
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

const DOCTORS_STORAGE_KEY = 'sfe-doctors-v5';

/**
 * LOW-COST V2: Optimized for minimum reads by using stricter limits for global masterlist
 * scans and prioritizing local cache for faster UI responsiveness.
 */
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
        // LOW-COST V2: Stricter limit for global scans to prevent quota spikes
        q = query(collection(db, "doctors"), limit(5000));
      } else {
        q = query(collection(db, "doctors"), where("userId", "==", user.uid), limit(2000));
      }

      const querySnapshot = await getDocs(q);
      const fetchedDoctors: Doctor[] = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Doctor));

      setDoctors(fetchedDoctors);
      safeStorageSet(`${DOCTORS_STORAGE_KEY}_${user.uid}`, JSON.stringify(fetchedDoctors));
    } catch (error) {
        console.error("Fetch doctors error:", error);
    } finally {
      setLoading(false);
    }
  }, [user, isUserAdmin, active]);

  useEffect(() => {
    if (active) fetchDoctors();
  }, [fetchDoctors, active]);

  const addDoctor = useCallback(
    async (doctorData: Omit<Doctor, "id">) => {
      if (!user || !db) return;
      const newDoctorData = { ...doctorData, userId: user.uid };
      try {
        const docRef = await addDoc(collection(db, "doctors"), newDoctorData);
        const created = { id: docRef.id, ...newDoctorData } as Doctor;
        setDoctors((prev) => {
            const next = [...prev, created];
            safeStorageSet(`${DOCTORS_STORAGE_KEY}_${user.uid}`, JSON.stringify(next));
            return next;
        });
        toast({ title: "Doctor Added" });
      } catch (e) {
        toast({ variant: 'destructive', title: "Error" });
      }
    },
    [user, toast]
  );

  const addDoctorsBulk = useCallback(
    async (doctorsToAdd: Omit<Doctor, 'id' | 'userId'>[]) => {
      if (!user || !db || doctorsToAdd.length === 0) return;
      setLoading(true);
      try {
        const batch = writeBatch(db);
        doctorsToAdd.forEach(d => {
            const docRef = doc(collection(db, "doctors"));
            batch.set(docRef, { ...d, userId: user.uid });
        });
        await batch.commit();
        await fetchDoctors();
        toast({ title: "Upload Successful" });
      } catch (error) {
        toast({ variant: 'destructive', title: "Upload Failed" });
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
      try {
          await updateDoc(docRef, { ...dataToUpdate, userId: user.uid });
          setDoctors((prev) => {
            const next = prev.map((d) => (d.id === doctorData.id ? { ...doctorData, userId: user.uid } : d));
            safeStorageSet(`${DOCTORS_STORAGE_KEY}_${user.uid}`, JSON.stringify(next));
            return next;
          });
      } catch (e) {}
    },
    [user]
  );

  const deleteDoctor = useCallback(
    async (id: string) => {
      if (!user || !db) return;
      try {
          await deleteDoc(doc(db, "doctors", id));
          setDoctors((prev) => {
            const next = prev.filter((d) => d.id !== id);
            safeStorageSet(`${DOCTORS_STORAGE_KEY}_${user.uid}`, JSON.stringify(next));
            return next;
          });
          toast({ variant: "destructive", title: "Doctor Removed" });
      } catch (e) {}
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
          setDoctors((prev) => {
            const next = prev.filter((d) => !ids.includes(d.id));
            safeStorageSet(`${DOCTORS_STORAGE_KEY}_${user.uid}`, JSON.stringify(next));
            return next;
          });
          toast({ variant: "destructive", title: "Doctors Deleted" });
      } catch (e) {}
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
