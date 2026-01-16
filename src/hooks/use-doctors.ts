
"use client";

import { useState, useEffect, useCallback } from "react";
import type { Doctor } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "./use-auth";
import { db } from "@/lib/firebase";
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

// List of admin UIDs (must match Firestore Rules)
const ADMIN_UIDS = ["SgOR5cjCC6dZ0oABv4nXdntu6pI3", "m2ZTNUi5v9ef82FxVRbwSmyGv9S2"];

export const useDoctors = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  /** ------------------------
   * Fetch Doctors
   * ------------------------ */
  const fetchDoctors = useCallback(async () => {
    if (!user) {
      setDoctors([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let q;
      // Admins can see all doctors
      if (ADMIN_UIDS.includes(user.uid)) {
        q = query(collection(db, "doctors"));
      } else {
        // Regular users only see their own
        q = query(collection(db, "doctors"), where("userId", "==", user.uid));
      }

      const querySnapshot = await getDocs(q);
      const fetchedDoctors: Doctor[] = [];
      querySnapshot.forEach((docSnap) => {
        fetchedDoctors.push({ id: docSnap.id, ...docSnap.data() } as Doctor);
      });

      setDoctors(fetchedDoctors);
    } catch (error) {
      console.error("Error fetching doctors:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not fetch doctor masterlist.",
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  /** ------------------------
   * Add Doctor (single)
   * ------------------------ */
  const addDoctor = useCallback(
    async (doctorData: Omit<Doctor, "id">) => {
      if (!user) return;
      try {
        const newDoctorData = { ...doctorData, userId: user.uid };
        const docRef = await addDoc(collection(db, "doctors"), newDoctorData);
        setDoctors((prev) => [
          ...prev,
          { id: docRef.id, ...newDoctorData },
        ]);
        toast({
          title: "Doctor Added",
          description: `${doctorData.firstName} ${doctorData.lastName} has been added.`,
        });
      } catch (error) {
        console.error("Error adding doctor:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not add doctor.",
        });
      }
    },
    [user, toast]
  );

  /** ------------------------
   * Add/Update Doctors in Bulk (for user's own upload)
   * This now only adds new doctors and ignores existing ones.
   * ------------------------ */
  const addDoctorsBulk = useCallback(
    async (doctorsToAdd: Omit<Doctor, 'id' | 'userId'>[]) => {
      if (!user) return;
      if (doctorsToAdd.length === 0) return;
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
        let newDoctorsCount = 0;
        let updatedDoctorsCount = 0;

        doctorsToAdd.forEach((newDoctor) => {
          const key = `${newDoctor.firstName.toLowerCase()}|${newDoctor.lastName.toLowerCase()}`;
          const existingDoctor = existingDoctorMap.get(key);

          if (existingDoctor) {
            operations.push({ type: 'update', data: { ...newDoctor, userId: user.uid }, id: existingDoctor.id });
            updatedDoctorsCount++;
          } else {
            operations.push({ type: 'create', data: { ...newDoctor, userId: user.uid } });
            newDoctorsCount++;
          }
        });

        if (operations.length === 0) {
          toast({
            title: "No Changes",
            description: `All doctors from the file already exist.`,
          });
          setLoading(false);
          return;
        }

        const chunkSize = 499; // Keep it safely under the 500 limit
        for (let i = 0; i < operations.length; i += chunkSize) {
          const chunk = operations.slice(i, i + chunkSize);
          const batch = writeBatch(db);
          chunk.forEach(op => {
            if (op.type === 'create') {
              const docRef = doc(collection(db, "doctors"));
              batch.set(docRef, op.data);
            } else if (op.type === 'update' && op.id) {
              const docRef = doc(db, "doctors", op.id);
              batch.update(docRef, op.data);
            }
          });
          await batch.commit();
        }

        await fetchDoctors();
        toast({
          title: "Upload Successful",
          description: `${newDoctorsCount} new doctor(s) added and ${updatedDoctorsCount} existing doctor(s) updated.`,
        });
      } catch (error) {
        console.error("Error processing bulk doctor upload:", error);
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: "Could not process your doctor master list file.",
        });
        await fetchDoctors();
      } finally {
        setLoading(false);
      }
    },
    [user, toast, fetchDoctors]
  );


  /** ------------------------
   * Update Doctor (only user’s own)
   * ------------------------ */
  const updateDoctor = useCallback(
    async (doctorData: Doctor) => {
      if (!user) return;
      try {
        const { id, userId, ...dataToUpdate } = doctorData;
        const doctorRef = doc(db, "doctors", id);
        // Ensure userId from auth is used, not from doctorData if it exists
        await updateDoc(doctorRef, { ...dataToUpdate, userId: user.uid });

        setDoctors((prev) =>
          prev.map((d) => (d.id === doctorData.id ? { ...doctorData, userId: user.uid } : d))
        );

      } catch (error) {
        console.error("Error updating doctor:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not update doctor details.",
        });
      }
    },
    [user, toast]
  );

  /** ------------------------
   * Delete Doctor (only user’s own)
   * ------------------------ */
  const deleteDoctor = useCallback(
    async (id: string) => {
      if (!user) return;
      try {
        const doctorToDelete = doctors.find((d) => d.id === id);
        await deleteDoc(doc(db, "doctors", id));
        setDoctors((prev) => prev.filter((d) => d.id !== id));

        if (doctorToDelete) {
          toast({
            variant: "destructive",
            title: "Doctor Deleted",
            description: `${doctorToDelete.firstName} ${doctorToDelete.lastName} has been removed from your master list.`,
          });
        }
      } catch (error) {
        console.error("Error deleting doctor:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not delete doctor.",
        });
      }
    },
    [user, doctors, toast]
  );

  /** ------------------------
   * Bulk Delete (user’s own)
   * ------------------------ */
  const deleteDoctorsBulk = useCallback(
    async (ids: string[]) => {
      if (!user || ids.length === 0) return;

      const batch = writeBatch(db);
      ids.forEach((id) => {
        const docRef = doc(db, "doctors", id);
        batch.delete(docRef);
      });

      try {
        await batch.commit();
        setDoctors((prev) => prev.filter((d) => !ids.includes(d.id)));

        toast({
          variant: "destructive",
          title: "Doctors Deleted",
          description: `${ids.length} doctor(s) have been removed from your master list.`,
        });
      } catch (error) {
        console.error("Error bulk deleting doctors:", error);
        toast({
          variant: "destructive",
          title: "Bulk Delete Failed",
          description: `Could not remove the selected doctors.`,
        });
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
