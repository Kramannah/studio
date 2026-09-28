'use client';

import { ref, getDownloadURL, deleteObject, uploadBytes } from "firebase/storage";
import { storage, auth } from "./firebase";

/**
 * Client-side utility to resize and compress images before storage or local caching.
 * Targets ~100KB-150KB per photo and <20KB for signatures.
 */
export async function compressImage(base64: string, maxWidth: number = 800, quality: number = 0.5): Promise<string> {
    if (typeof window === 'undefined' || !base64 || !base64.startsWith('data:image')) return base64;
    
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(base64);
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            // Convert to JPEG for consistent high compression
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(base64);
    });
}

/**
 * Converts a Base64 string to a Blob for reliable binary upload.
 */
async function base64ToBlob(base64: string): Promise<Blob> {
    const response = await fetch(base64);
    return await response.blob();
}

/**
 * Uploads a Base64 string to Firebase Storage using binary Blobs and returns the URL.
 * Binary uploads (uploadBytes) are much more reliable than string uploads (uploadString).
 */
export async function uploadBase64ToStorage(base64: string, path: string): Promise<string> {
    if (!storage) throw new Error("Cloud Storage was not ready.");
    if (!base64 || !base64.startsWith('data:image')) return base64; 

    // VERIFY SESSION
    const user = auth?.currentUser;
    if (!user) {
        console.warn("Storage attempt blocked: No active authentication session.");
        throw new Error("Your session expired. Please log out and back in to sync.");
    }

    try {
        const storageRef = ref(storage, path);
        const blob = await base64ToBlob(base64);
        
        // Use binary upload (uploadBytes) which is more robust against 'unauthorized' errors
        const snapshot = await uploadBytes(storageRef, blob, {
            contentType: 'image/jpeg',
            customMetadata: {
                'userId': user.uid,
                'uploadedAt': new Date().toISOString()
            }
        });
        
        return await getDownloadURL(snapshot.ref);
    } catch (error: any) {
        if (error.code === 'storage/unauthorized') {
            console.warn("Firebase Storage permission denied. Simplified rules V7 deployed.");
        }
        throw error; 
    }
}

/**
 * Uploads a raw File object to Firebase Storage and returns the download URL.
 */
export async function uploadFileToStorage(file: File, path: string): Promise<string> {
    if (!storage) throw new Error("Firebase Storage is not initialized.");
    if (!auth?.currentUser) throw new Error("Unauthorized: No active session.");

    const storageRef = ref(storage, path);
    try {
        await uploadBytes(storageRef, file);
        return await getDownloadURL(storageRef);
    } catch (error: any) {
        console.error("Storage Upload Error:", error);
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
