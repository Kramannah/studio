
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
const ADMIN_UIDS = ["SgOR5cjCC6dZ0oABv4nXdntu6pI3"];

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
      // If user is admin, fetch all doctors
      let q;
      if (ADMIN_UIDS.includes(user.uid)) {
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
   * Add Doctor
   * ------------------------ */
  const addDoctor = useCallback(
    async (doctorData: Omit<Doctor, "id" | "userId">) => {
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
   * Update Doctor
   * ------------------------ */
  const updateDoctor = useCallback(
    async (doctorData: Doctor) => {
      if (!user) return;
      try {
        const { id, userId, ...dataToUpdate } = doctorData;
        const doctorRef = doc(db, "doctors", id);
        await updateDoc(doctorRef, dataToUpdate);

        setDoctors((prev) =>
          prev.map((d) => (d.id === doctorData.id ? doctorData : d))
        );

        toast({
          title: "Doctor Updated",
          description: `${doctorData.firstName} ${doctorData.lastName}'s details have been updated.`,
        });
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
   * Delete Doctor
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
            description: `${doctorToDelete.firstName} ${doctorToDelete.lastName} has been removed.`,
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

    const addDoctorsBulk = useCallback(
    async (doctorsToAdd: Omit<Doctor, 'id'>[]) => {
      if (!user) return;

      const batch = writeBatch(db);
      const doctorsWithUserId = doctorsToAdd.map(d => ({ ...d, userId: user.uid }));

      doctorsWithUserId.forEach(doctor => {
        const docRef = doc(collection(db, "doctors"));
        batch.set(docRef, doctor);
      });
      
      await batch.commit();
      fetchDoctors(); // Refetch all doctors to get new IDs
    },
    [user, fetchDoctors]
  );

  const deleteDoctorsBulk = useCallback(
    async (ids: string[]) => {
      if (!user) return;

      const batch = writeBatch(db);
      ids.forEach(id => {
        const docRef = doc(db, "doctors", id);
        batch.delete(docRef);
      });

      await batch.commit();
      setDoctors((prev) => prev.filter((d) => !ids.includes(d.id)));
      toast({
        variant: "destructive",
        title: "Doctors Deleted",
        description: `${ids.length} doctor(s) have been removed.`,
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
