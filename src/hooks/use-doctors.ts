
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Doctor } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from './use-auth';

const DOCTORS_KEY = 'sfe-offline-coverage-doctors';

export const useDoctors = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  const getLocalKey = useCallback(() => `${DOCTORS_KEY}_${user?.uid}`, [user]);

  useEffect(() => {
    if (user) {
        setLoading(true);
        try {
            const localData = localStorage.getItem(getLocalKey());
            if (localData) {
                setDoctors(JSON.parse(localData));
            } else {
                setDoctors([]);
            }
        } catch (error) {
            console.error("Failed to load doctors from local storage", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load doctor masterlist.' });
        }
        setLoading(false);
    } else {
        // Clear data if no user
        setDoctors([]);
        setLoading(false);
    }
  }, [user, getLocalKey, toast]);

  const updateLocalStorage = (updatedDoctors: Doctor[]) => {
    setDoctors(updatedDoctors);
    if (user) {
        localStorage.setItem(getLocalKey(), JSON.stringify(updatedDoctors));
    }
  };

  const addDoctor = useCallback((doctorData: Omit<Doctor, 'id'>) => {
    if (!user) return;
    const newDoctor: Doctor = { ...doctorData, userId: user.uid, id: crypto.randomUUID() };
    
    const updatedDoctors = [...doctors, newDoctor];
    updateLocalStorage(updatedDoctors);
    toast({ title: "Doctor Added", description: `${newDoctor.firstName} ${newDoctor.lastName} has been added.` });
  }, [user, doctors, toast, getLocalKey]);

  const addDoctorsBulk = useCallback((doctorsData: Omit<Doctor, 'id'>[]) => {
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
        const newDoctors: Doctor[] = uniqueNewDoctorsData.map(d => ({...d, userId: user.uid, id: crypto.randomUUID()}));
        const updatedDoctors = [...doctors, ...newDoctors];
        updateLocalStorage(updatedDoctors);
        toast({ title: 'Upload Successful', description: `${uniqueNewDoctorsData.length} doctors were added.` });
    }
    setLoading(false);
  }, [doctors, user, toast]);


  const updateDoctor = useCallback((doctorData: Doctor) => {
    if (!user) return;
    const updatedDoctors = doctors.map(d => d.id === doctorData.id ? doctorData : d);
    updateLocalStorage(updatedDoctors);
    toast({ title: "Doctor Updated", description: `${doctorData.firstName} ${doctorData.lastName}'s details have been updated.` });
  }, [user, doctors, toast]);

  const deleteDoctor = useCallback((id: string) => {
    const doctorToDelete = doctors.find(d => d.id === id);
    const updatedDoctors = doctors.filter(d => d.id !== id);
    updateLocalStorage(updatedDoctors);
    if (doctorToDelete) {
        toast({ variant: 'destructive', title: "Doctor Deleted", description: `${doctorToDelete.firstName} ${doctorToDelete.lastName} has been removed.` });
    }
  }, [doctors, toast]);

  return { doctors, addDoctor, addDoctorsBulk, updateDoctor, deleteDoctor, loading };
};
