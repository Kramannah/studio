
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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

const DOCTORS_STORAGE_KEY = 'sfe-doctors-v6';
const CACHE_TTL = 15 * 60 * 1000; // 15 Minutes

export const useDoctors = (active: boolean = true) => {
  const { toast } = useToast();
  const { user, profile, loading: authLoading } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(false);
  const lastFetchTimeRef = useRef<number>(0);
  const lastUidRef = useRef<string | null>(null);

  // Load from local storage immediately on mount/user change
  useEffect(() => {
    if (user?.uid) {
        if (lastUidRef.current && lastUidRef.current !== user.uid) {
            // New user session, clear immediate state to prevent ghosting
            setDoctors([]);
            lastFetchTimeRef.current = 0;
        }
        
        try {
            const cached = localStorage.getItem(`${DOCTORS_STORAGE_KEY}_${user.uid}`);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                setDoctors(data || []);
                lastFetchTimeRef.current = timestamp || 0;
            }
        } catch (e) {}
    }
  }, [user?.uid]);

  const isUserAdmin = useMemo(() => {
    if (!user) return false;
    // Explicitly wait for profile if it's supposed to be there to avoid broad query denial
    // But don't block if we have a clear DSM UID match
    const normalizedEmail = (user.email ?? "").toLowerCase();
    const isManagerUID = ADMIN_UIDS.includes(user.uid) || normalizedEmail === 'mbustamante@hovidinc.com';
    
    if (isManagerUID) return true;
    if (authLoading && !profile) return false; 
    
    return ADMIN_EMAILS.some(e => e.toLowerCase() === normalizedEmail) || profile?.role === 'Admin';
  }, [user, profile, authLoading]);

  const fetchDoctors = useCallback(async (force = false) => {
    if (!user?.uid || !db || !active || !navigator.onLine) return;

    const now = Date.now();
    // HEALING: If list is empty but we have a user, ignore TTL and fetch at least once
    const needsInitialFetch = doctors.length === 0 && lastUidRef.current !== user.uid;
    
    if (!force && !needsInitialFetch && (now - lastFetchTimeRef.current < CACHE_TTL)) {
        return;
    }

    setLoading(true);
    try {
      let q;
      // CRITICAL: Scope query strictly to avoid permission errors if profile isn't ready
      if (isUserAdmin) {
        q = query(collection(db, "doctors"), limit(5000));
      } else {
        q = query(collection(db, "doctors"), where("userId", "==", user.uid), limit(2000));
      }

      const querySnapshot = await getDocs(q);
      const fetchedDoctors: Doctor[] = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Doctor));

      setDoctors(fetchedDoctors);
      lastFetchTimeRef.current = now;
      lastUidRef.current = user.uid;
      safeStorageSet(`${DOCTORS_STORAGE_KEY}_${user.uid}`, JSON.stringify({ data: fetchedDoctors, timestamp: now }));
    } catch (error: any) {
        console.error("Fetch doctors failed:", error);
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'doctors',
                operation: 'list',
            }));
        }
    } finally {
      setLoading(false);
    }
  }, [user?.uid, isUserAdmin, active, doctors.length]);

  useEffect(() => {
    // If active view requires doctors, fetch them
    if (active && user?.uid && !authLoading) {
        fetchDoctors();
    }
  }, [fetchDoctors, active, user?.uid, authLoading]);

  const addDoctor = async (doctorData: Omit<Doctor, "id">) => {
    if (!user || !db) return;
    const newDoctorData = { ...doctorData, userId: user.uid };
    addDoc(collection(db, "doctors"), newDoctorData)
      .then((docRef) => {
        const created = { id: docRef.id, ...newDoctorData } as Doctor;
        setDoctors((prev) => {
            const next = [...prev, created];
            safeStorageSet(`${DOCTORS_STORAGE_KEY}_${user.uid}`, JSON.stringify({ data: next, timestamp: Date.now() }));
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
        fetchDoctors(true);
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
    const finalData = { ...dataToUpdate, userId: doctorData.userId || user.uid };
    
    const oldVersion = doctors.find(d => d.id === id);
    if (!oldVersion) return;

    const nameChanged = 
        oldVersion.firstName.trim().toLowerCase() !== doctorData.firstName.trim().toLowerCase() || 
        oldVersion.lastName.trim().toLowerCase() !== doctorData.lastName.trim().toLowerCase();

    try {
        await updateDoc(docRef, finalData);
        
        if (nameChanged) {
            const batch = writeBatch(db!);
            const targetUserId = doctorData.userId || user.uid;

            // Only attempt sync for current user to avoid permission errors
            const [plansSnap, entriesSnap] = await Promise.all([
                getDocs(query(collection(db!, "plans"), where("doctorId", "==", id), where("userId", "==", targetUserId))),
                getDocs(query(collection(db!, "coverageEntries"), where("userId", "==", targetUserId)))
            ]);

            plansSnap.forEach(pDoc => {
                batch.update(doc(db!, "plans", pDoc.id), {
                    doctorFirstName: doctorData.firstName,
                    doctorLastName: doctorData.lastName
                });
            });

            const matchingEntries = entriesSnap.docs.filter(d => {
                const data = d.data();
                const eFirst = String(data.firstName || "").toLowerCase().trim();
                const eLast = String(data.lastName || "").toLowerCase().trim();
                const oFirst = String(oldVersion.firstName).toLowerCase().trim();
                const oLast = String(oldVersion.lastName).toLowerCase().trim();
                return eFirst === oFirst && eLast === oLast;
            });

            matchingEntries.forEach(eDoc => {
                batch.update(doc(db!, "coverageEntries", eDoc.id), {
                    firstName: doctorData.firstName,
                    lastName: doctorData.lastName
                });
            });

            if (!plansSnap.empty || matchingEntries.length > 0) {
                await batch.commit();
            }
        }

        setDoctors((prev) => {
            const next = prev.map((d) => (d.id === doctorData.id ? { ...doctorData, userId: finalData.userId } : d));
            safeStorageSet(`${DOCTORS_STORAGE_KEY}_${user.uid}`, JSON.stringify({ data: next, timestamp: Date.now() }));
            return next;
        });
        
        toast({ title: "Doctor Updated" });
    } catch (error: any) {
        console.error("Update doctor failed:", error);
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'update',
                requestResourceData: finalData,
            }));
        } else {
            toast({ variant: 'destructive', title: "Update Error", description: "Failed to sync changes." });
        }
    }
  };

  const deleteDoctor = async (id: string) => {
    if (!user || !db) return;
    const docRef = doc(db, "doctors", id);
    deleteDoc(docRef)
      .then(() => {
        setDoctors((prev) => {
            const next = prev.filter((d) => d.id !== id);
            safeStorageSet(`${DOCTORS_STORAGE_KEY}_${user.uid}`, JSON.stringify({ data: next, timestamp: Date.now() }));
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
            safeStorageSet(`${DOCTORS_STORAGE_KEY}_${user.uid}`, JSON.stringify({ data: next, timestamp: Date.now() }));
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
    refetch: () => fetchDoctors(true)
  };
};
