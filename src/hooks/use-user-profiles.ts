"use client"

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, doc, setDoc, deleteDoc, FirestoreError } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

// SINGLETON CACHE: Prevents re-reading the entire user list on every tab switch
let cachedProfiles: Record<string, UserProfile> | null = null;
let lastFetch: number = 0;
const PROFILES_CACHE_TTL = 15 * 60 * 1000; // 15 Minutes

export function useUserProfiles() {
    const [profiles, setProfiles] = useState<Record<string, UserProfile>>(cachedProfiles || {});
    const [loading, setLoading] = useState(!cachedProfiles);
    const { toast } = useToast();

    const fetchProfiles = useCallback(async (force = false) => {
        if (!db) return;
        
        const now = Date.now();
        if (!force && cachedProfiles && (now - lastFetch < PROFILES_CACHE_TTL)) {
            setProfiles(cachedProfiles);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const snapshot = await getDocs(query(collection(db, "userProfiles")))
              .catch(async (e: FirestoreError) => {
                  errorEmitter.emit('permission-error', new FirestorePermissionError({
                      path: 'userProfiles',
                      operation: 'list',
                  }));
                  throw e;
              });
              
            const data: Record<string, UserProfile> = {};
            snapshot.forEach(d => {
                const p = { id: d.id, ...d.data() } as UserProfile;
                data[p.userId] = p;
            });

            cachedProfiles = data;
            lastFetch = now;
            setProfiles(data);
        } catch (error) {
            console.error("Profiles fetch error:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProfiles();
    }, [fetchProfiles]);

    const addProfile = async (data: { userId: string; firstName: string; lastName: string; code: string; role?: 'Admin' | 'Manager' | 'PMR' | 'Marketing' | 'HR'; managerId?: string; email?: string }) => {
        if (!db) return false;
        const docRef = doc(db, "userProfiles", data.userId);
        const payload = {
            ...data,
            updatedAt: new Date().toISOString()
        };
        try {
            await setDoc(docRef, payload, { merge: true });
            const newProfile = { id: data.userId, ...payload } as UserProfile;
            
            if (cachedProfiles) cachedProfiles[data.userId] = newProfile;
            setProfiles(prev => ({ ...prev, [data.userId]: newProfile }));
            
            toast({ title: "Account Created", description: "Successfully added new personnel record." });
            return true;
        } catch (serverError: any) {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'write',
                requestResourceData: payload,
            }));
            return false;
        }
    };

    const updateProfile = async (userId: string, firstName: string, lastName: string, managerId?: string, email?: string, role?: 'Admin' | 'Manager' | 'PMR' | 'Marketing' | 'HR') => {
        if (!db) return false;
        
        const docRef = doc(db, "userProfiles", userId);
        const payload: any = {
            userId,
            firstName,
            lastName,
            updatedAt: new Date().toISOString()
        };
        
        if (managerId && managerId !== 'none') {
            payload.managerId = managerId;
        } else if (managerId === 'none') {
            payload.managerId = null;
        }

        if (email) payload.email = email;
        if (role) payload.role = role;

        try {
            await setDoc(docRef, payload, { merge: true });
            const updatedProfile = { id: userId, ...payload } as UserProfile;
            
            if (cachedProfiles) cachedProfiles[userId] = updatedProfile;
            setProfiles(prev => ({ ...prev, [userId]: updatedProfile }));
            
            toast({ title: "Account Updated", description: "The employee record has been successfully modified." });
            return true;
        } catch (serverError: any) {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'write',
                requestResourceData: payload,
            }));
            return false;
        }
    };

    const deleteProfile = async (userId: string) => {
        if (!db) return false;
        const docRef = doc(db, "userProfiles", userId);
        try {
            await deleteDoc(docRef);
            
            if (cachedProfiles) delete cachedProfiles[userId];
            setProfiles(prev => {
                const next = { ...prev };
                delete next[userId];
                return next;
            });
            
            toast({ variant: 'destructive', title: "Account Removed", description: "Personnel record has been deleted." });
            return true;
        } catch (serverError: any) {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'delete',
            }));
            return false;
        }
    };

    return { profiles, loading, addProfile, updateProfile, deleteProfile, refetch: () => fetchProfiles(true) };
}