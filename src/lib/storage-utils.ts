'use client';

import { ref, getDownloadURL, deleteObject, uploadString } from "firebase/storage";
import { storage, auth } from "./firebase";

/**
 * Uploads a Base64 string to Firebase Storage and returns the URL.
 * Reverted to uploadString with 'data_url' for maximum compatibility with Auth token propagation.
 */
export async function uploadBase64ToStorage(base64: string, path: string): Promise<string> {
    if (!storage) throw new Error("Cloud Storage was not ready.");
    if (!base64 || !base64.startsWith('data:image')) return base64; 

    // SECURE SESSION VERIFICATION
    let user = auth?.currentUser;
    
    // Attempt one quick retry if user is null (auth state might be resolving)
    if (!user) {
        await new Promise(resolve => setTimeout(resolve, 500));
        user = auth?.currentUser;
    }

    if (!user) {
        throw new Error("storage/unauthorized");
    }

    try {
        const storageRef = ref(storage, path);
        
        // FORCE AUTH PROPAGATION: A small delay helps the Storage service acknowledge the Auth token
        await new Promise(resolve => setTimeout(resolve, 300));

        // Use 'data_url' format which handles the Base64 header automatically
        const snapshot = await uploadString(storageRef, base64, 'data_url', {
            contentType: base64.includes('png') ? 'image/png' : 'image/jpeg',
            customMetadata: {
                'userId': user.uid,
                'uploadedAt': new Date().toISOString()
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
