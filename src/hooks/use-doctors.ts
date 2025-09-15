
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Doctor } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, writeBatch, deleteDoc, doc, updateDoc, query, where } from 'firebase/firestore';
import { useAuth } from './use-auth';

const DOCTORS_KEY = 'sfe-offline-coverage-doctors';

export const useDoctors = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  const getLocalKey = useCallback(() => `${DOCTORS_KEY}_${user?.uid}`, [user]);

  const fetchDoctors = useCallback(async () => {
    if (!user) {
        setDoctors([]);
        setLoading(false);
        return;
    }

    setLoading(true);
    const localData = localStorage.getItem(getLocalKey());
    if (localData) {
        setDoctors(JSON.parse(localData));
    }

    if (navigator.onLine) {
        try {
            const q = query(collection(db, "doctors"), where("userId", "==", user.uid));
            const querySnapshot = await getDocs(q);
            const firestoreDoctors = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
            setDoctors(firestoreDoctors);
            localStorage.setItem(getLocalKey(), JSON.stringify(firestoreDoctors));
        } catch (error) {
            console.error("Error fetching doctors from Firestore:", error);
            if (!localData) {
              toast({
                  variant: "destructive",
                  title: "Error",
                  description: "Could not fetch doctor masterlist."
              });
            }
        }
    } else {
        if (!localData) {
             toast({
                title: "Offline",
                description: "Displaying cached doctor list. Some data may be outdated."
            });
        }
    }
    setLoading(false);
  }, [user, toast, getLocalKey]);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  const addDoctor = useCallback(async (doctorData: Omit<Doctor, 'id'>) => {
    if(!user) return;
    const newDoctorWithUser = { ...doctorData, userId: user.uid };
    
    try {
        const docRef = await addDoc(collection(db, "doctors"), newDoctorWithUser);
        const newDoctor = { ...newDoctorWithUser, id: docRef.id };
        setDoctors(prev => [...prev, newDoctor]);
        localStorage.setItem(getLocalKey(), JSON.stringify([...doctors, newDoctor]));
        toast({ title: "Doctor Added", description: `${newDoctor.firstName} ${newDoctor.lastName} has been added.` });
    } catch (error) {
        console.error("Error adding doctor:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to add doctor.' });
    }
  }, [user, doctors, toast, getLocalKey]);

  const addDoctorsBulk = useCallback(async (doctorsData: Omit<Doctor, 'id'>[]) => {
    if (!user) return;
    
    setLoading(true);
    const existingDoctors = new Set(doctors.map(d => `${d.firstName.toLowerCase()} ${d.lastName.toLowerCase()}`));
    
    const uniqueNewDoctorsData = doctorsData.filter(d => !existingDoctors.has(`${d.firstName.toLowerCase()} ${d.lastName.toLowerCase()}`));

    if (uniqueNewDoctorsData.length !== doctorsData.length) {
        const duplicateCount = doctorsData.length - uniqueNewDoctorsData.length;
        toast({
            variant: "destructive",
            title: "Duplicates Found",
            description: `${duplicateCount} doctor(s) from the uploaded file were already in the masterlist and have been skipped.`,
        });
    }

    if (uniqueNewDoctorsData.length > 0) {
        try {
            const batch = writeBatch(db);
            uniqueNewDoctorsData.forEach(doctor => {
                const docRef = doc(collection(db, "doctors"));
                batch.set(docRef, { ...doctor, userId: user.uid });
            });
            await batch.commit();
            await fetchDoctors(); // Refetch all to get new IDs
            toast({ title: 'Upload Successful', description: `${uniqueNewDoctorsData.length} doctors were added.` });
        } catch (error) {
            console.error("Bulk add error:", error);
            toast({ variant: 'destructive', title: 'Upload Failed', description: 'Could not save new doctors to the database.' });
        }
    }
    setLoading(false);
  }, [doctors, user, toast, fetchDoctors]);


  const updateDoctor = useCallback(async (doctorData: Doctor) => {
    if (!user) return;
    const { id, ...dataToUpdate } = doctorData;
    
    try {
        const docRef = doc(db, "doctors", id);
        await updateDoc(docRef, dataToUpdate);
        await fetchDoctors();
        toast({ title: "Doctor Updated", description: `${doctorData.firstName} ${doctorData.lastName}'s details have been updated.` });
    } catch (error) {
        console.error("Error updating doctor:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to update doctor.' });
    }
  }, [user, toast, fetchDoctors]);

  const deleteDoctor = useCallback(async (id: string) => {
    const doctorToDelete = doctors.find(d => d.id === id);
    try {
        await deleteDoc(doc(db, "doctors", id));
        await fetchDoctors();
        if (doctorToDelete) {
            toast({ variant: 'destructive', title: "Doctor Deleted", description: `${doctorToDelete.firstName} ${doctorToDelete.lastName} has been removed.` });
        }
    } catch(error) {
        console.error("Error deleting doctor:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete doctor.' });
    }
  }, [doctors, toast, fetchDoctors]);

  return { doctors, addDoctor, addDoctorsBulk, updateDoctor, deleteDoctor, loading };
};
