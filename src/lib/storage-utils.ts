'use client';

import { ref, getDownloadURL, deleteObject, uploadString } from "firebase/storage";
import { storage, auth } from "./firebase";

/**
 * Uploads a Base64 string to Firebase Storage and returns the URL.
 * Uses 'data_url' format for maximum compatibility with Auth headers.
 */
export async function uploadBase64ToStorage(base64: string, path: string): Promise<string> {
    if (!storage) throw new Error("storage/not-initialized");
    if (!base64 || !base64.startsWith('data:image')) return base64; 

    // Verify Auth State and Force Token Refresh if necessary
    const user = auth?.currentUser;
    if (!user) {
        console.warn("Storage upload attempted without active user session.");
        throw new Error("storage/unauthorized");
    }

    try {
        const storageRef = ref(storage, path);
        
        // Metadata for organizational tracking
        const metadata = {
            contentType: base64.split(';')[0].split(':')[1] || 'image/png',
            customMetadata: {
                'userId': user.uid,
                'uploadedAt': new Date().toISOString()
            }
        };

        // uploadString with 'data_url' is the most robust method for Base64 captures
        console.log(`Starting DataURL upload to: ${path}`);
        const snapshot = await uploadString(storageRef, base64, 'data_url', metadata);
        const downloadUrl = await getDownloadURL(snapshot.ref);
        console.log("Upload successful:", downloadUrl);
        
        return downloadUrl;
    } catch (error: any) {
        console.error("Firebase Storage Upload Error:", error.code, error.message);
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
        console.warn("Storage cleanup note: File already gone or inaccessible.");
    }
}

/**
 * Identifies if a string is a Base64 image.
 */
export function isBase64Image(str: string | null | undefined): boolean {
    return !!str && str.startsWith('data:image');
}

export async function uploadFileToStorage(file: File, path: string): Promise<string> {
    if (!storage) throw new Error("storage/not-initialized");
    const { uploadBytes } = await import("firebase/storage");
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    return getDownloadURL(snapshot.ref);
}
