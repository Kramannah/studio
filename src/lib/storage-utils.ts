'use client';

import { ref, getDownloadURL, deleteObject, uploadBytes } from "firebase/storage";
import { storage, auth } from "./firebase";

/**
 * Helper to convert Base64 Data URL to a raw binary Blob.
 */
function base64ToBlob(base64: string): Blob {
    const parts = base64.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);

    for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
    }

    return new Blob([uInt8Array], { type: contentType });
}

/**
 * Uploads a Base64 string to Firebase Storage and returns the URL.
 * Enforces the use of the authenticated user's UID for the Storage path.
 */
export async function uploadBase64ToStorage(base64: string, folder: string, fileName: string): Promise<string> {
    if (!storage) throw new Error("storage/not-initialized");
    if (!base64 || !base64.startsWith('data:image')) return base64; 

    const user = auth?.currentUser;
    if (!user) {
        console.warn("Storage upload attempted without active user session.");
        throw new Error("storage/unauthorized");
    }

    try {
        // AUTH SOURCE OF TRUTH: 
        // We ignore any passed UIDs and use the real-time session UID to build the path.
        const path = `${folder}/${user.uid}/${fileName}`;
        
        // Diagnostic Logging for confirmation
        console.log("--- STORAGE UPLOAD INITIATED ---");
        console.log("Authenticated UID:", user.uid);
        console.log("Storage Bucket:", storage.app.options.storageBucket);
        console.log("Target Path:", path);
        console.log("--------------------------------");

        // Force a token refresh to ensure the Storage backend sees an active session
        await user.getIdToken(true);

        const storageRef = ref(storage, path);
        const blob = base64ToBlob(base64);
        
        const metadata = {
            contentType: blob.type,
            customMetadata: {
                'userId': user.uid,
                'uploadedAt': new Date().toISOString()
            }
        };

        // Binary transfer for maximum stability
        const snapshot = await uploadBytes(storageRef, blob, metadata);
        const downloadUrl = await getDownloadURL(snapshot.ref);
        
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

/**
 * Standard file upload (used for system templates).
 */
export async function uploadFileToStorage(file: File, path: string): Promise<string> {
    if (!storage) throw new Error("storage/not-initialized");
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    return getDownloadURL(snapshot.ref);
}
