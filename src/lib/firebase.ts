'use client';

import { initializeFirebase } from "@/firebase";

/**
 * Singleton service access.
 * Returns null during server-side rendering to prevent crashes.
 */
let services: any = null;

const getServices = () => {
  if (typeof window === 'undefined') return null;
  if (services) return services;
  try {
    services = initializeFirebase();
    return services;
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    return null;
  }
};

export const app = typeof window !== 'undefined' ? getServices()?.firebaseApp : null;
export const db = typeof window !== 'undefined' ? getServices()?.firestore : null;
export const auth = typeof window !== 'undefined' ? getServices()?.auth : null;