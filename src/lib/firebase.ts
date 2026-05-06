'use client';

/**
 * This file provides a simple, shared singleton instance of Firebase services
 * for standard client-side components and hooks.
 */
import { initializeFirebase } from "@/firebase";

const isClient = typeof window !== 'undefined';
const firebaseServices = isClient ? initializeFirebase() : null;

export const app = firebaseServices?.firebaseApp;
export const db = firebaseServices?.firestore;
export const auth = firebaseServices?.auth;
