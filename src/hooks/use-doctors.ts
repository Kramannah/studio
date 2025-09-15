
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Doctor } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from './use-auth';

const DOCTORS_LOCAL_KEY = 'sfe-offline-coverage-doctors-local';

export const useDoctors = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  const getLocalKey = useCallback(() => `${DOCTORS_LOCAL_KEY}_${user?.uid}`, [user]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      try {
        const localData = localStorage.getItem(getLocalKey());
        if (localData) {
          setDoctors(JSON.parse(localData));
        }
      } catch (error) {
        console.error("Error reading doctors from local storage:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load local doctor masterlist." });
      } finally {
        setLoading(false);
      }
    } else {
      setDoctors([]);
      setLoading(false);
    }
  }, [user, getLocalKey, toast]);

  const updateLocalStorage = (updatedDoctors: Doctor[]) => {
    setDoctors(updatedDoctors);
    localStorage.setItem(getLocalKey(), JSON.stringify(updatedDoctors));
  };

  const addDoctor = useCallback((doctorData: Omit<Doctor, 'id'>) => {
    if (!user) return;
    const newDoctor: Doctor = { ...doctorData, id: crypto.randomUUID(), userId: user.uid };
    const updatedDoctors = [...doctors, newDoctor];
    updateLocalStorage(updatedDoctors);
    toast({ title: "Doctor Added", description: `${newDoctor.firstName} ${newDoctor.lastName} has been added.` });
  }, [user, doctors, toast, getLocalKey]);

  const addDoctorsBulk = useCallback((doctorsData: Omit<Doctor, 'id'>[]) => {
    if (!user) return;

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
      const newDoctors: Doctor[] = uniqueNewDoctorsData.map(d => ({ ...d, id: crypto.randomUUID(), userId: user.uid }));
      const updatedDoctors = [...doctors, ...newDoctors];
      updateLocalStorage(updatedDoctors);
      toast({ title: 'Upload Successful', description: `${newDoctors.length} doctors were added.` });
    }
  }, [doctors, user, toast, getLocalKey]);

  const updateDoctor = useCallback((doctorData: Doctor) => {
    if (!user) return;
    const updatedDoctors = doctors.map(d => d.id === doctorData.id ? doctorData : d);
    updateLocalStorage(updatedDoctors);
    toast({ title: "Doctor Updated", description: `${doctorData.firstName} ${doctorData.lastName}'s details have been updated.` });
  }, [user, doctors, toast, getLocalKey]);

  const deleteDoctor = useCallback((id: string) => {
    if (!user) return;
    const doctorToDelete = doctors.find(d => d.id === id);
    const updatedDoctors = doctors.filter(d => d.id !== id);
    updateLocalStorage(updatedDoctors);
    if (doctorToDelete) {
      toast({ variant: 'destructive', title: "Doctor Deleted", description: `${doctorToDelete.firstName} ${doctorToDelete.lastName} has been removed.` });
    }
  }, [user, doctors, toast, getLocalKey]);

  return { doctors, addDoctor, addDoctorsBulk, updateDoctor, deleteDoctor, loading };
};
