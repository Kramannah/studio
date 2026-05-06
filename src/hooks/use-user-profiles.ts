
"use client"

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, doc, setDoc, FirestoreError } from "firebase/firestore";
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
        
        if (managerId) {
            payload.managerId = managerId;
        }
        if (email) {
            payload.email = email;
        }

        try {
            await setDoc(docRef, payload, { merge: true });
            setProfiles(prev => ({
                ...prev,
                [userId]: { id: docId, ...payload }
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

    return { profiles, loading, updateProfile, refetch: fetchProfiles };
}
