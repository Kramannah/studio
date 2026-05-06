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
 * Uses a singleton pattern to ensure only one instance of each service exists.
 */
export function initializeFirebase(): FirebaseServices {
  if (typeof window === 'undefined') {
    throw new Error('initializeFirebase must be called on the client side.');
  }

  if (services) return services;

  const firebaseApp = getApps().length === 0 
    ? initializeApp(firebaseConfig) 
    : getApp();

  services = {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp),
  };

  return services;
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
