
"use client"

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, doc, setDoc, deleteDoc, FirestoreError } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserProfile } from "@/lib/types";
import { useToast } from "./use-toast";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export function useUserProfiles() {
    const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    const fetchProfiles = useCallback(async () => {
        if (!db) return;
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
            setProfiles(data);
        } catch (error) {
            // Handled via errorEmitter
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProfiles();
    }, [fetchProfiles]);

    const addProfile = async (data: { userId: string; firstName: string; lastName: string; code: string; managerId?: string; email?: string }) => {
        if (!db) return false;
        const docRef = doc(db, "userProfiles", data.userId);
        const payload = {
            ...data,
            updatedAt: new Date().toISOString()
        };
        try {
            await setDoc(docRef, payload, { merge: true });
            setProfiles(prev => ({
                ...prev,
                [data.userId]: { id: data.userId, ...payload } as UserProfile
            }));
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

    const updateProfile = async (userId: string, firstName: string, lastName: string, managerId?: string, email?: string) => {
        if (!db) return false;
        
        const docId = userId; 
        const docRef = doc(db, "userProfiles", docId);
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

        if (email) {
            payload.email = email;
        }

        try {
            await setDoc(docRef, payload, { merge: true });
            setProfiles(prev => ({
                ...prev,
                [userId]: { id: docId, ...payload } as UserProfile
            }));
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

    return { profiles, loading, addProfile, updateProfile, deleteProfile, refetch: fetchProfiles };
}
