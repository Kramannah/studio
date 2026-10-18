import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { startOfWeek, isSameWeek, isBefore, parseISO, isValid, format, startOfMonth, endOfMonth, isSameMonth, isAfter, endOfDay, addDays } from "date-fns"

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
 * Returns the end of Friday (23:59:59) for the week containing the provided date.
 */
export function getWeekFridayDeadline(date: Date): Date {
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  const friday = addDays(monday, 4);
  return endOfDay(friday);
}

/**
 * Robust date parser that handles ISO strings, Date objects, and Firestore Timestamps.
 */
export function parseAnyDate(date: any): Date | null {
  if (!date) return null;
  if (date instanceof Date) return isValid(date) ? date : null;
  
  // Handle Firestore Timestamp objects
  if (typeof date === 'object' && (date as any).seconds !== undefined) {
    const d = new Date((date as any).seconds * 1000);
    return isValid(d) ? d : null;
  }

  if (typeof date === 'string') {
    const parsed = parseISO(date);
    return isValid(parsed) ? parsed : null;
  }
  
  return null;
}

export const PH_HOLIDAYS: Record<string, string> = {
  // 2024 Holidays
  "2024-01-01": "New Year's Day",
  "2024-02-09": "Chinese New Year",
  "2024-02-10": "Chinese New Year",
  "2024-02-25": "People Power Anniversary",
  "2024-03-28": "Maundy Thursday",
  "2024-03-29": "Good Friday",
  "2024-03-30": "Black Saturday",
  "2024-04-09": "Araw ng Kagitingan",
  "2024-04-10": "Eid'l Fitr",
  "2024-05-01": "Labor Day",
  "2024-06-12": "Independence Day",
  "2024-06-17": "Eid'l Adha",
  "2024-08-21": "Ninoy Aquino Day",
  "2024-08-26": "National Heroes Day",
  "2024-11-01": "All Saints' Day",
  "2024-11-02": "All Souls' Day",
  "2024-11-30": "Bonifacio Day",
  "2024-12-08": "Feast of the Immaculate Conception",
  "2024-12-25": "Christmas Day",
  "2024-12-30": "Rizal Day",
  "2024-12-31": "Last Day of the Year",
  
  // 2025 Holidays
  "2025-01-01": "New Year's Day",
  "2025-01-29": "Chinese New Year",
  "2025-02-25": "People Power Anniversary",
  "2025-03-31": "Eid'l Fitr",
  "2025-04-17": "Maundy Thursday",
  "2025-04-18": "Good Friday",
  "2025-04-19": "Black Saturday",
  "2025-04-09": "Araw ng Kagitingan",
  "2025-05-01": "Labor Day",
  "2025-06-07": "Eid'l Adha",
  "2025-06-12": "Independence Day",
  "2025-08-21": "Ninoy Aquino Day",
  "2025-08-25": "National Heroes Day",
  "2025-11-01": "All Saints' Day",
  "2025-11-30": "Bonifacio Day",
  "2025-12-08": "Feast of the Immaculate Conception",
  "2025-12-25": "Christmas Day",
  "2025-12-30": "Rizal Day",
  "2025-12-31": "Last Day of the Year",

  // 2026 Holidays
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
  return PH_HOLIDAYS[dateString] || null;
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
 */
export function safeStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    const isQuotaError = e instanceof DOMException && 
      (e.code === 22 || e.code === 1014 || e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');

    if (isQuotaError) {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sfe-') && !k.includes('offline-coverage-entries')) {
          localStorage.removeItem(k);
        }
      });
      try {
        localStorage.setItem(key, value);
      } catch (retryError) {
        console.warn('LocalStorage quota limit reached even after purge.');
      }
    }
  }
}

export function getStartOfYearISO() {
  return new Date(new Date().getFullYear(), 0, 1).toISOString();
}

/**
 * Returns the ISO string for the start of the current calendar quarter.
 */
export function getStartOfQuarterISO() {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3);
  const startOfQuarter = new Date(now.getFullYear(), quarter * 3, 1);
  return startOfQuarter.toISOString();
}

/**
 * Calculates the Levenshtein distance between two strings.
 */
export function getLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
      }
  }
  return matrix[a.length][b.length];
}

/**
 * Checks if two strings are similar based on a threshold (default 85%).
 */
export function isSimilarString(a: string, b: string, threshold = 0.85): boolean {
  const sa = a.toLowerCase().trim();
  const sb = b.toLowerCase().trim();
  if (sa === sb) return true;
  if (sa === "" || sb === "") return false;
  const distance = getLevenshteinDistance(sa, sb);
  const similarity = 1 - distance / Math.max(sa.length, sb.length);
  return similarity >= threshold;
}
