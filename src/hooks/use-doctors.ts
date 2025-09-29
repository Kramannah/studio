
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Doctor } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';

export const useDoctors = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDoctors = useCallback(async () => {
    if (!user) {
      setDoctors([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = query(collection(db, "doctors"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const fetchedDoctors: Doctor[] = [];
      querySnapshot.forEach((doc) => {
        fetchedDoctors.push({ id: doc.id, ...doc.data() } as Doctor);
      });
      setDoctors(fetchedDoctors);
    } catch (error) {
      console.error("Error fetching doctors:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not fetch doctor masterlist." });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  const addDoctor = useCallback(async (doctorData: Omit<Doctor, 'id' | 'userId'>) => {
    if (!user) return;
    try {
      const newDoctorData = { ...doctorData, userId: user.uid };
      const docRef = await addDoc(collection(db, "doctors"), newDoctorData);
      setDoctors(prev => [...prev, { id: docRef.id, ...newDoctorData }]);
      toast({ title: "Doctor Added", description: `${doctorData.firstName} ${doctorData.lastName} has been added.` });
    } catch (error) {
       toast({ variant: "destructive", title: "Error", description: "Could not add doctor." });
    }
  }, [user, toast]);

  const addDoctorsBulk = useCallback(async (doctorsData: Omit<Doctor, 'id' | 'userId'>[]) => {
    if (!user) return;

    try {
      const batch = writeBatch(db);
      const newDoctors: Doctor[] = [];

      const q = query(collection(db, "doctors"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const existingDoctorsMap = new Map(querySnapshot.docs.map(d => [`${d.data().firstName.toLowerCase()} ${d.data().lastName.toLowerCase()}`, d.id]));

      const doctorsToAdd: Omit<Doctor, 'id' | 'userId'>[] = [];
      const doctorsToUpdate: Doctor[] = [];

      doctorsData.forEach(doctor => {
        const key = `${doctor.firstName.toLowerCase()} ${doctor.lastName.toLowerCase()}`;
        if (existingDoctorsMap.has(key)) {
            const existingId = existingDoctorsMap.get(key)!;
            doctorsToUpdate.push({ ...doctor, id: existingId, userId: user.uid });
        } else {
            doctorsToAdd.push(doctor);
        }
      });
      
      doctorsToAdd.forEach(doctor => {
        const docRef = doc(collection(db, "doctors"));
        batch.set(docRef, { ...doctor, userId: user.uid });
        newDoctors.push({ ...doctor, id: docRef.id, userId: user.uid });
      });

      doctorsToUpdate.forEach(doctor => {
        const docRef = doc(db, "doctors", doctor.id);
        batch.update(docRef, { ...doctor, userId: user.uid });
      });


      await batch.commit();

      setDoctors(prev => {
          const updatedList = prev.map(existingDoc => {
              const update = doctorsToUpdate.find(d => d.id === existingDoc.id);
              return update ? update : existingDoc;
          });
          return [...updatedList, ...newDoctors];
      });
      
      let toastDescription = "";
      if (doctorsToAdd.length > 0) {
        toastDescription += `${doctorsToAdd.length} new doctors added. `;
      }
      if (doctorsToUpdate.length > 0) {
        toastDescription += `${doctorsToUpdate.length} existing doctors updated.`
      }

      toast({ title: 'Upload Successful', description: toastDescription.trim() });

    } catch (error) {
      console.error("Error adding doctors in bulk:", error);
      toast({ variant: 'destructive', title: 'Bulk Add Failed', description: 'Could not add or update doctors in the masterlist.' });
    }

  }, [user, toast]);

  const updateDoctor = useCallback(async (doctorData: Doctor) => {
    if (!user) return;
    try {
      const doctorRef = doc(db, "doctors", doctorData.id);
      await updateDoc(doctorRef, { ...doctorData });
      setDoctors(prev => prev.map(d => d.id === doctorData.id ? doctorData : d));
      toast({ title: "Doctor Updated", description: `${doctorData.firstName} ${doctorData.lastName}'s details have been updated.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not update doctor details." });
    }
  }, [user, toast]);

  const deleteDoctor = useCallback(async (id: string) => {
    if (!user) return;
    try {
      const doctorToDelete = doctors.find(d => d.id === id);
      await deleteDoc(doc(db, "doctors", id));
      setDoctors(prev => prev.filter(d => d.id !== id));
      if (doctorToDelete) {
        toast({ variant: 'destructive', title: "Doctor Deleted", description: `${doctorToDelete.firstName} ${doctorToDelete.lastName} has been removed.` });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not delete doctor.' });
    }
  }, [user, doctors, toast]);

  return { doctors, addDoctor, addDoctorsBulk, updateDoctor, deleteDoctor, loading };
};
