'use client';

/**
 * STORAGE UTILITIES - DEPRECATED
 * Application is now using direct Base64 storage in Firestore to reduce complexity.
 * Functions are maintained as stubs to prevent import breakage.
 */

export async function uploadBase64ToStorage(base64: string, folder: string, fileName: string): Promise<string> {
    return base64; 
}

export async function deleteStorageFile(url: string | null | undefined) {
    return;
}

export function isBase64Image(str: string | null | undefined): boolean {
    return !!str && str.startsWith('data:image');
}

export async function uploadFileToStorage(file: File, path: string): Promise<string> {
    throw new Error("Storage uploads are currently disabled.");
}