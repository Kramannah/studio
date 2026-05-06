'use client';

/**
 * This file provides a simple, shared singleton instance of Firebase services
 * for standard client-side components and hooks.
 */
import { initializeFirebase } from "@/firebase";

// Helper to safely get services on the client side only
const getClientServices = () => {
  if (typeof window === 'undefined') return null;
  return initializeFirebase();
};

const services = getClientServices();

export const app = services?.firebaseApp;
export const db = services?.firestore;
export const auth = services?.auth;
