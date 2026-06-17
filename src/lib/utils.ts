import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { startOfWeek, isSameWeek, isBefore, parseISO, isValid, format, startOfMonth, endOfMonth } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getWeekMonday(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

export function isCurrentWeek(date: Date): boolean {
  return isSameWeek(date, new Date(), { weekStartsOn: 1 });
}

export function isPastWeek(date: Date): boolean {
  const startOfThisWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
  const startOfTargetWeek = startOfWeek(date, { weekStartsOn: 1 });
  return isBefore(startOfTargetWeek, startOfThisWeek);
}

/**
 * Robust date parser that handles ISO strings, Date objects, and Firestore Timestamps.
 */
export function parseAnyDate(date: any): Date | null {
  if (!date) return null;
  if (date instanceof Date) return isValid(date) ? date : null;
  
  // Handle Firestore Timestamp objects
  if (typeof date === 'object' && date.seconds !== undefined) {
    const d = new Date(date.seconds * 1000);
    return isValid(d) ? d : null;
  }

  if (typeof date === 'string') {
    const parsed = parseISO(date);
    return isValid(parsed) ? parsed : null;
  }
  
  return null;
}

export const PH_HOLIDAYS_2026: Record<string, string> = {
  "2026-01-01": "New Year's Day",
  "2026-01-29": "Lunar New Year's Day",
  "2026-02-25": "People Power Anniversary",
  "2026-04-02": "Maundy Thursday",
  "2026-04-03": "Good Friday",
  "2026-04-04": "Black Saturday",
  "2026-04-09": "Araw ng Kagitingan",
  "2026-05-01": "Labor Day",
  "2026-06-12": "Independence Day",
  "2026-08-21": "Ninoy Aquino Day",
  "2026-08-31": "National Heroes Day",
  "2026-11-01": "All Saints' Day",
  "2026-11-02": "All Souls' Day",
  "2026-11-30": "Bonifacio Day",
  "2026-12-08": "Feast of the Immaculate Conception",
  "2026-12-25": "Christmas Day",
  "2026-12-30": "Rizal Day",
  "2026-12-31": "Last Day of the Year",
};

export function getHolidayName(date: Date): string | null {
  const dateString = format(date, 'yyyy-MM-dd');
  return PH_HOLIDAYS_2026[dateString] || null;
}

export function getMonthRangeISO(monthStr?: string) {
  const date = monthStr ? parseISO(monthStr + "-01") : new Date();
  return {
    start: startOfMonth(date).toISOString(),
    end: endOfMonth(date).toISOString(),
  };
}

/**
 * Safely sets an item in localStorage, handling QuotaExceeded errors gracefully.
 * Strips heavy caches if needed and fails silently to prevent app crashes.
 */
export function safeStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    const isQuotaError = e instanceof DOMException && 
      (e.code === 22 || e.code === 1014 || e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');

    if (isQuotaError) {
      // Purge all non-essential display caches to make room
      Object.keys(localStorage).forEach(k => {
        // Protect critical locally-saved offline entries (not yet synced to DB)
        if (k.startsWith('sfe-') && !k.includes('offline-coverage-entries')) {
          localStorage.removeItem(k);
        }
      });

      try {
        localStorage.setItem(key, value);
      } catch (retryError) {
        // If it still fails, the item itself is simply too large. 
        // We log it to the console but DON'T re-throw, allowing the app to continue using live data.
        console.warn('LocalStorage quota limit reached even after purge. This item will not be cached.');
      }
    }
  }
}

export function getStartOfYearISO() {
  return new Date(new Date().getFullYear(), 0, 1).toISOString();
}