
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Doctor } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from './use-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, writeBatch, deleteDoc, doc, updateDoc, query, where } from 'firebase/firestore';

const DOCTORS_LOCAL_KEY = 'sfe-offline-coverage-doctors-local';

export const useDoctors = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  const getLocalKey = useCallback(() => `${DOCTORS_LOCAL_KEY}_${user?.uid}`, [user]);

  const fetchDoctorsFromFirestore = useCallback(async () => {
    if (!db || !user) {
        setDoctors([]);
        return [];
    }
    setLoading(true);
    try {
        const q = query(collection(db, 'doctors'), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        const firestoreDoctors = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
        
        setDoctors(firestoreDoctors);
        localStorage.setItem(getLocalKey(), JSON.stringify(firestoreDoctors));
        return firestoreDoctors;
    } catch (error) {
        console.error("Error fetching doctors from Firestore:", error);
        toast({
            variant: "destructive",
            title: "Network Error",
            description: "Could not fetch doctor masterlist. Loading local data."
        });
        const localData = localStorage.getItem(getLocalKey());
        return localData ? JSON.parse(localData) : [];
    } finally {
        setLoading(false);
    }
  }, [user, getLocalKey, toast]);

  useEffect(() => {
    if (user) {
        setLoading(true);
        const localData = localStorage.getItem(getLocalKey());
        if (localData) {
            setDoctors(JSON.parse(localData));
        }
        fetchDoctorsFromFirestore().then(fetchedDoctors => {
            if (fetchedDoctors.length > 0 || !localData) {
                setDoctors(fetchedDoctors);
            }
        }).finally(() => setLoading(false));
    } else {
        setDoctors([]);
        setLoading(false);
    }
  }, [user, fetchDoctorsFromFirestore, getLocalKey]);


  const addDoctor = useCallback(async (doctorData: Omit<Doctor, 'id'>) => {
    if (!user || !db) return;
    const newDoctorData = { ...doctorData, userId: user.uid };
    
    try {
        const docRef = await addDoc(collection(db, "doctors"), newDoctorData);
        const newDoctor = { ...newDoctorData, id: docRef.id };
        const updatedDoctors = [...doctors, newDoctor];
        setDoctors(updatedDoctors);
        localStorage.setItem(getLocalKey(), JSON.stringify(updatedDoctors));
        toast({ title: "Doctor Added", description: `${newDoctor.firstName} ${newDoctor.lastName} has been added.` });
    } catch (error) {
        console.error("Error adding doctor to Firestore:", error);
        toast({ variant: 'destructive', title: 'Save Failed', description: 'Could not save doctor online.' });
    }
  }, [user, doctors, toast, getLocalKey]);

  const addDoctorsBulk = useCallback(async (doctorsData: Omit<Doctor, 'id'>[]) => {
    if (!user || !db) return;
    
    setLoading(true);
    try {
        const existingDoctors = new Set(doctors.map(d => `${d.firstName.toLowerCase()} ${d.lastName.toLowerCase()}`));
        const uniqueNewDoctorsData = doctorsData.filter(d => !existingDoctors.has(`${d.firstName.toLowerCase()} ${d.lastName.toLowerCase()}`));

        if (uniqueNewDoctorsData.length !== doctorsData.length) {
            const duplicateCount = doctorsData.length - uniqueNewDoctorsData.length;
            toast({
                variant: "destructive",
                title: "Duplicates Found",
                description: `${duplicateCount} doctor(s) were skipped as they are already in the masterlist.`,
            });
        }
        
        if (uniqueNewDoctorsData.length > 0) {
            const batch = writeBatch(db);
            uniqueNewDoctorsData.forEach(doctor => {
                const docRef = doc(collection(db, "doctors"));
                batch.set(docRef, { ...doctor, userId: user.uid });
            });
            await batch.commit();
            toast({ title: 'Upload Successful', description: `${uniqueNewDoctorsData.length} doctors were added.` });
            await fetchDoctorsFromFirestore();
        }
    } catch(error) {
        console.error("Error adding doctors in bulk:", error);
        toast({ variant: "destructive", title: "Bulk Upload Failed", description: "Could not save the new doctors."});
    } finally {
        setLoading(false);
    }
  }, [doctors, user, toast, fetchDoctorsFromFirestore]);


  const updateDoctor = useCallback(async (doctorData: Doctor) => {
    if (!user || !db) return;
    const { id, ...dataToUpdate } = doctorData;
    
    try {
        const docRef = doc(db, "doctors", id);
        await updateDoc(docRef, dataToUpdate);
        
        const updatedDoctors = doctors.map(d => d.id === id ? doctorData : d);
        setDoctors(updatedDoctors);
        localStorage.setItem(getLocalKey(), JSON.stringify(updatedDoctors));
        toast({ title: "Doctor Updated", description: `${doctorData.firstName} ${doctorData.lastName}'s details have been updated.` });
    } catch (error) {
        console.error("Error updating doctor:", error);
        toast({ variant: "destructive", title: "Update Failed", description: "Could not update doctor details online."});
    }
  }, [user, doctors, toast, getLocalKey]);

  const deleteDoctor = useCallback(async (id: string) => {
    if (!user || !db) return;

    const doctorToDelete = doctors.find(d => d.id === id);
    try {
        await deleteDoc(doc(db, "doctors", id));
        const updatedDoctors = doctors.filter(d => d.id !== id);
        setDoctors(updatedDoctors);
        localStorage.setItem(getLocalKey(), JSON.stringify(updatedDoctors));
        if (doctorToDelete) {
            toast({ variant: 'destructive', title: "Doctor Deleted", description: `${doctorToDelete.firstName} ${doctorToDelete.lastName} has been removed.` });
        }
    } catch (error) {
        console.error("Error deleting doctor:", error);
        toast({ variant: "destructive", title: "Delete Failed", description: "Could not delete doctor online."});
    }
  }, [doctors, toast, getLocalKey, user]);

  return { doctors, addDoctor, addDoctorsBulk, updateDoctor, deleteDoctor, loading };
};
