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

/**
 * Initializes Firebase services with the provided configuration.
 * Uses a singleton pattern to ensure only one instance of each service exists.
 */
export function initializeFirebase(): FirebaseServices {
  let firebaseApp: FirebaseApp;

  if (getApps().length === 0) {
    // Use the explicit config object for consistent behavior in both local and production environments
    firebaseApp = initializeApp(firebaseConfig);
  } else {
    firebaseApp = getApp();
  }

  // Directly obtain service instances from the initialized app
  const authInstance = getAuth(firebaseApp);
  const firestoreInstance = getFirestore(firebaseApp);

  return {
    firebaseApp,
    auth: authInstance,
    firestore: firestoreInstance,
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
