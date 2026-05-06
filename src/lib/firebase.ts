'use client';

/**
 * This file provides a simple, shared singleton instance of Firebase services
 * for standard client-side components and hooks.
 */
import { initializeFirebase } from "@/firebase";

const services = initializeFirebase();

export const app = services.firebaseApp;
export const db = services.firestore;
export const auth = services.auth;
