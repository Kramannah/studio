
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { Doctor } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";

const DOCTORS_KEY = 'hovidcoverage-doctors';

export const useDoctors = () => {
  const { toast } = useToast();
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedDoctors = localStorage.getItem(DOCTORS_KEY);
        if (storedDoctors) {
          setDoctors(JSON.parse(storedDoctors));
        }
      } catch (error) {
        console.error("Failed to parse doctors from localStorage", error);
        toast({
          variant: 'destructive',
          title: 'Error loading data',
          description: 'Could not load your doctor masterlist.',
        });
      }
    }
  }, [toast]);

  const updateLocalStorage = (updatedDoctors: Doctor[]) => {
    localStorage.setItem(DOCTORS_KEY, JSON.stringify(updatedDoctors));
  };

  const addDoctor = useCallback((doctorData: Omit<Doctor, 'id'>) => {
    const newDoctor: Doctor = {
      ...doctorData,
      id: crypto.randomUUID(),
    };
    const updatedDoctors = [...doctors, newDoctor];
    setDoctors(updatedDoctors);
    updateLocalStorage(updatedDoctors);
    toast({ title: "Doctor Added", description: `${newDoctor.firstName} ${newDoctor.lastName} has been added to your masterlist.` });
  }, [doctors, toast]);

  const addDoctorsBulk = useCallback((doctorsData: Omit<Doctor, 'id'>[]) => {
    const newDoctors: Doctor[] = doctorsData.map(d => ({...d, id: crypto.randomUUID(), frequency: d.frequency || '1x'}));
    
    const existingDoctors = new Set(doctors.map(d => `${d.firstName.toLowerCase()} ${d.lastName.toLowerCase()}`));
    const uniqueNewDoctors = newDoctors.filter(d => !existingDoctors.has(`${d.firstName.toLowerCase()} ${d.lastName.toLowerCase()}`));

    if (uniqueNewDoctors.length !== newDoctors.length) {
        const duplicateCount = newDoctors.length - uniqueNewDoctors.length;
        toast({
            variant: "destructive",
            title: "Duplicates Found",
            description: `${duplicateCount} doctor(s) from the uploaded file were already in the masterlist and have been skipped.`,
        });
    }

    if (uniqueNewDoctors.length > 0) {
        const updatedDoctors = [...doctors, ...uniqueNewDoctors];
        setDoctors(updatedDoctors);
        updateLocalStorage(updatedDoctors);
    }
  }, [doctors, toast]);


  const updateDoctor = useCallback((doctorData: Doctor) => {
    const updatedDoctors = doctors.map(d => d.id === doctorData.id ? doctorData : d);
    setDoctors(updatedDoctors);
    updateLocalStorage(updatedDoctors);
    toast({ title: "Doctor Updated", description: `${doctorData.firstName} ${doctorData.lastName}'s details have been updated.` });
  }, [doctors, toast]);

  const deleteDoctor = useCallback((id: string) => {
    const doctorToDelete = doctors.find(d => d.id === id);
    const updatedDoctors = doctors.filter(d => d.id !== id);
    setDoctors(updatedDoctors);
    updateLocalStorage(updatedDoctors);
    if (doctorToDelete) {
        toast({ variant: 'destructive', title: "Doctor Deleted", description: `${doctorToDelete.firstName} ${doctorToDelete.lastName} has been removed.` });
    }
  }, [doctors, toast]);

  return { doctors, addDoctor, addDoctorsBulk, updateDoctor, deleteDoctor };
};
