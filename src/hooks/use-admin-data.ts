
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { CoverageEntry, Doctor, Plan, NonCallDay, TimeLog, PlanningPermissionRequest } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';

export const useAdminData = () => {
    const { toast } = useToast();
    const [allEntries, setAllEntries] = useState<CoverageEntry[]>([]);
    const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
    const [allPlans, setAllPlans] = useState<Plan[]>([]);
    const [allNonCallDays, setAllNonCallDays] = useState<NonCallDay[]>([]);
    const [allTimeLogs, setAllTimeLogs] = useState<TimeLog[]>([]);
    const [allPlanningRequests, setAllPlanningRequests] = useState<PlanningPermissionRequest[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async (collectionName: string, setter: Function, orderByField?: string, sortDirection: 'asc' | 'desc' = 'desc') => {
        try {
            const q = orderByField 
                ? query(collection(db, collectionName), orderBy(orderByField, sortDirection))
                : query(collection(db, collectionName));

            const querySnapshot = await getDocs(q);
            const items: any[] = [];
            querySnapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() });
            });
            setter(items);
        } catch (error) {
            console.error(`Error fetching ${collectionName}:`, error);
            // Don't toast for index errors, but log them.
            if ((error as any)?.code !== 'failed-precondition') {
                 toast({ variant: "destructive", title: "Data Fetch Error", description: `Could not fetch ${collectionName}. Check Firestore rules.` });
            } else {
                 console.warn(`Query for ${collectionName} requires an index. Consider client-side sorting or creating the index in Firebase.`);
                 // Attempt to fetch without ordering
                 const fallbackQuery = query(collection(db, collectionName));
                 const fallbackSnapshot = await getDocs(fallbackQuery);
                 const fallbackItems: any[] = [];
                 fallbackSnapshot.forEach((doc) => {
                    fallbackItems.push({ id: doc.id, ...doc.data() });
                 });
                 // This will be unsorted, but better than nothing.
                 setter(fallbackItems);
            }
        }
    }, [toast]);

    const fetchAllData = useCallback(async () => {
        setLoading(true);
        await Promise.all([
            fetchData('coverageEntries', setAllEntries, 'submittedAt'),
            fetchData('doctors', setAllDoctors),
            fetchData('plans', setAllPlans, 'plannedDate'),
            fetchData('nonCallDays', setAllNonCallDays, 'date'),
            fetchData('timeLogs', setAllTimeLogs, 'timeIn'),
            fetchData('planningRequests', setAllPlanningRequests, 'requestedAt'),
        ]);
        setLoading(false);
    }, [fetchData]);


    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    const deleteEntry = useCallback(async (id: string, callback?: () => void) => {
        try {
            await deleteDoc(doc(db, "coverageEntries", id));
            setAllEntries(prev => prev.filter(e => e.id !== id));
            toast({ variant: 'destructive', title: "Entry Deleted", description: `A coverage entry has been removed.` });
            if(callback) callback();
        } catch (error) {
            toast({ variant: 'destructive', title: "Delete Failed", description: "Could not delete entry from server." });
        }
    }, [toast]);

    const updateNonCallDayStatus = useCallback(async (id: string, status: 'approved' | 'rejected') => {
        try {
            const nonCallDayRef = doc(db, 'nonCallDays', id);
            await updateDoc(nonCallDayRef, { status });
            setAllNonCallDays(prev => prev.map(ncd => ncd.id === id ? { ...ncd, status } : ncd));
            toast({ title: 'Status Updated', description: `The non-call day has been ${status}.` });
        } catch (error) {
            console.error("Error updating status:", error);
            toast({ variant: "destructive", title: "Update Failed", description: "Could not update the non-call day status." });
        }
    }, [toast]);

    const updatePlanningRequestStatus = useCallback(async (id: string, status: 'approved' | 'rejected') => {
        try {
            const requestRef = doc(db, 'planningRequests', id);
            await updateDoc(requestRef, { status });
            setAllPlanningRequests(prev => prev.map(req => req.id === id ? { ...req, status } : req));
            toast({ title: 'Request Status Updated', description: `The planning request has been ${status}.` });
        } catch (error) {
            console.error("Error updating planning request status:", error);
            toast({ variant: "destructive", title: "Update Failed", description: "Could not update the planning request status." });
        }
    }, [toast]);

    return { 
        allEntries, 
        allDoctors, 
        allPlans, 
        allNonCallDays,
        allTimeLogs,
        allPlanningRequests,
        loading, 
        fetchAllData, 
        deleteEntry, 
        updateNonCallDayStatus,
        updatePlanningRequestStatus,
    };
};
