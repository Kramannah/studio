'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

export interface FirebaseServices {
  firebaseApp: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

let services: FirebaseServices | null = null;

/**
 * Initializes Firebase services with the provided configuration.
 * Safe for SSR - returns null if window is undefined.
 */
export function initializeFirebase(): FirebaseServices | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (services) return services;

  try {
    const firebaseApp = getApps().length === 0 
      ? initializeApp(firebaseConfig) 
      : getApp();

    services = {
      firebaseApp,
      auth: getAuth(firebaseApp),
      firestore: getFirestore(firebaseApp),
    };

    return services;
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    return null;
  }
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
