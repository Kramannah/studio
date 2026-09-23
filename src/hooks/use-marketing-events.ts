'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MarketingEvent } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc, limit, orderBy } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { parseISO, format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

const EVENTS_CACHE_TTL = 10 * 60 * 1000; // 10 Minutes

/**
 * Sanitizes an object by removing undefined values.
 */
const sanitizeData = (data: any) => {
  return Object.fromEntries(
    Object.entries(data).filter(([_, v]) => v !== undefined)
  );
};

/**
 * Hook for managing Marketing Events (RTDs, Presentations).
 * Supports both individual PMR view and Global Admin oversight.
 */
export const useMarketingEvents = (active: boolean = true, selectedMonth?: string, userId?: string, isAdmin: boolean = false) => {
  const { toast } = useToast();
  const { user } = useAuth();
  
  // If a specific userId is passed, we use that. Otherwise, we default to the logged-in user.
  // For global admin view (isAdmin=true, userId=undefined), we fetch everything.
  const effectiveUserId = userId || user?.uid;
  
  const [events, setEvents] = useState<MarketingEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const lastFetchRef = useRef<number>(0);

  const fetchEvents = useCallback(async (force = false) => {
    if (!db || (!active && !force) || !navigator.onLine) return;
    
    // Safety: If not admin mode, we MUST have a userId to query.
    if (!isAdmin && !effectiveUserId) return;

    const now = Date.now();
    // Cache management: Skip fetch if data is fresh, unless forced.
    if (!force && (now - lastFetchRef.current < EVENTS_CACHE_TTL) && events.length > 0) return;

    setLoading(true);
    try {
      const refDate = selectedMonth ? parseISO(selectedMonth + "-01") : new Date();
      // Fetch current and previous month to capture overlapping batches
      const start = startOfMonth(subMonths(refDate, 1)).toISOString();
      const end = endOfMonth(refDate).toISOString();

      let q;
      if (isAdmin && !userId) {
        // GLOBAL ADMIN QUERY: Fetch all events across the organization
        q = query(
          collection(db, "marketingEvents"),
          where("eventDate", ">=", start),
          where("eventDate", "<=", end),
          orderBy("eventDate", "desc"),
          limit(3000)
        );
      } else {
        // PMR SPECIFIC QUERY: Fetch events for a single representative
        q = query(
          collection(db, "marketingEvents"),
          where("userId", "==", effectiveUserId),
          where("eventDate", ">=", start),
          where("eventDate", "<=", end),
          orderBy("eventDate", "desc"),
          limit(1000)
        );
      }

      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as MarketingEvent));
      setEvents(data);
      lastFetchRef.current = now;
    } catch (error: any) {
      console.error("Fetch marketing events failed:", error);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, active, selectedMonth, events.length, isAdmin, userId]);

  useEffect(() => {
    if (active && (effectiveUserId || isAdmin)) fetchEvents();
  }, [fetchEvents, active, effectiveUserId, isAdmin]);

  const addEvent = async (eventData: Omit<MarketingEvent, 'id' | 'userId'>) => {
    const targetUserId = effectiveUserId || user?.uid;
    if (!targetUserId || !db) return;
    
    const payload = { ...eventData, userId: targetUserId };
    const sanitized = sanitizeData(payload);

    return addDoc(collection(db, "marketingEvents"), sanitized)
      .then((docRef) => {
        setEvents(prev => [{ id: docRef.id, ...sanitized } as MarketingEvent, ...prev]);
        toast({ title: "Event Logged" });
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'marketingEvents',
          operation: 'create',
          requestResourceData: sanitized,
        }));
      });
  };

  const updateEvent = async (event: MarketingEvent) => {
    if (!db) return;
    const { id, ...data } = event;
    const docRef = doc(db, "marketingEvents", id);
    const sanitized = sanitizeData(data);

    return updateDoc(docRef, sanitized)
      .then(() => {
        setEvents(prev => prev.map(e => e.id === id ? { ...e, ...sanitized } : e));
        toast({ title: "Event Updated" });
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: docRef.path,
          operation: 'update',
          requestResourceData: sanitized,
        }));
      });
  };

  const deleteEvent = async (id: string) => {
    if (!db) return;
    const docRef = doc(db, "marketingEvents", id);
    return deleteDoc(docRef)
      .then(() => {
        setEvents(prev => prev.filter(e => e.id !== id));
        toast({ title: "Event Removed" });
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        }));
      });
  };

  return { events, loading, fetchEvents, addEvent, updateEvent, deleteEvent };
};