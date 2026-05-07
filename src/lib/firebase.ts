'use client';

import { initializeFirebase } from "@/firebase";

/**
 * Singleton service access.
 * Returns null during server-side rendering to prevent crashes.
 */
const getServices = () => {
  if (typeof window === 'undefined') return null;
  try {
    return initializeFirebase();
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    return null;
  }
};

const currentServices = getServices();

export const app = currentServices?.firebaseApp || null;
export const db = currentServices?.firestore || null;
export const auth = currentServices?.auth || null;
