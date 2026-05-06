'use client';

/**
 * Consolidated Firebase Initialization
 * This file uses the shared initialization logic from @/firebase/index.ts
 * to ensure that all hooks and providers use the same singleton instance.
 */
import { initializeFirebase } from "@/firebase";

// Initialize services once and export the singleton instances
const services = initializeFirebase();

export const app = services.firebaseApp;
export const db = services.firestore;
export const auth = services.auth;
