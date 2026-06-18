'use client';

import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebase";

/**
 * Uploads a Base64 string to Firebase Storage and returns the public download URL.
 * Update: Uses warnings instead of errors to prevent Next.js runtime crashes during batch migration.
 */
export async function uploadBase64ToStorage(base64: string, path: string): Promise<string> {
    if (!storage) throw new Error("Firebase Storage is not initialized.");
    if (!base64 || !base64.startsWith('data:image')) return base64; // Return as-is if not base64

    const storageRef = ref(storage, path);
    try {
        await uploadString(storageRef, base64, 'data_url');
        return await getDownloadURL(storageRef);
    } catch (error) {
        // Use console.warn to avoid triggering Next.js error overlays
        console.warn("Storage Upload Warning (Item Skipped):", error);
        throw error; // Still throw so the caller knows it failed, but caller must catch silently
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
