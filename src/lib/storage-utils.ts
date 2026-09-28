'use client';

import { ref, getDownloadURL, deleteObject, uploadBytes } from "firebase/storage";
import { storage, auth } from "./firebase";

/**
 * Converts a Base64 string to a Blob for reliable binary upload.
 * Uses a hybrid approach to ensure compatibility across all mobile browsers.
 */
async function base64ToBlob(base64: string): Promise<Blob> {
    try {
        // Primary method: Use browser fetch
        const response = await fetch(base64);
        if (!response.ok) throw new Error("Fetch failed");
        return await response.blob();
    } catch (e) {
        // Fallback: Manual conversion for strict security environments
        const parts = base64.split(';base64,');
        const contentType = parts[0].split(':')[1];
        const raw = window.atob(parts[1]);
        const uInt8Array = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
        }
        return new Blob([uInt8Array], { type: contentType });
    }
}

/**
 * Uploads a Base64 string to Firebase Storage using binary Blobs and returns the URL.
 * Binary uploads (uploadBytes) are much more reliable than string uploads (uploadString).
 * Note: COMPRESSION REMOVED - Preserves 100% original quality.
 */
export async function uploadBase64ToStorage(base64: string, path: string): Promise<string> {
    if (!storage) throw new Error("Cloud Storage was not ready.");
    if (!base64 || !base64.startsWith('data:image')) return base64; 

    // VERIFY SESSION
    const user = auth?.currentUser;
    if (!user) {
        throw new Error("Your session expired. Please log out and back in to sync.");
    }

    try {
        const storageRef = ref(storage, path);
        const blob = await base64ToBlob(base64);
        
        // Use binary upload (uploadBytes) which is the most robust method against 'unauthorized' errors
        const snapshot = await uploadBytes(storageRef, blob, {
            contentType: 'image/png', // Native format for highest clarity
            customMetadata: {
                'userId': user.uid,
                'uploadedAt': new Date().toISOString(),
                'originalPath': path
            }
        });
        
        return await getDownloadURL(snapshot.ref);
    } catch (error: any) {
        console.warn("Storage upload attempt failed:", error.code);
        throw error; 
    }
}

/**
 * Deletes a file from Firebase Storage given its download URL.
 */
export async function deleteStorageFile(url: string | null | undefined) {
    if (!storage || !url || !url.startsWith('https://firebasestorage')) return;
    
    try {
        const storageRef = ref(storage, url);
        await deleteObject(storageRef);
    } catch (error) {
        // Silently fail to allow database cleanup to proceed
        console.warn("Storage cleanup note: File already gone or inaccessible.");
    }
}

/**
 * Identifies if a string is a Base64 image.
 */
export function isBase64Image(str: string | null | undefined): boolean {
    return !!str && str.startsWith('data:image');
}
