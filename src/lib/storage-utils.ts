'use client';

import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebase";

/**
 * Client-side utility to resize and compress images before storage or local caching.
 * Targets ~100KB-150KB per photo and <20KB for signatures.
 */
export async function compressImage(base64: string, maxWidth: number = 1024, quality: number = 0.5): Promise<string> {
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
 * Uploads a Base64 string to Firebase Storage and returns the public download URL.
 */
export async function uploadBase64ToStorage(base64: string, path: string): Promise<string> {
    if (!storage) throw new Error("Firebase Storage is not initialized.");
    if (!base64 || !base64.startsWith('data:image')) return base64; 

    const storageRef = ref(storage, path);
    try {
        await uploadString(storageRef, base64, 'data_url');
        return await getDownloadURL(storageRef);
    } catch (error) {
        console.warn("Storage Upload Warning:", error);
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
        console.warn("Storage Cleanup Warning (Ignored):", error);
    }
}

/**
 * Identifies if a string is a Base64 image.
 */
export function isBase64Image(str: string | null | undefined): boolean {
    return !!str && str.startsWith('data:image');
}
