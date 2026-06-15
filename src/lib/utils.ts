import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { startOfWeek, isSameWeek, startOfMonth, isBefore, format, endOfMonth, parseISO, isValid } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Robust date parser that handles ISO strings, Firestore Timestamps, and Date objects.
 * Prevents runtime crashes when dealing with legacy data formats.
 */
export function parseAnyDate(date: any): Date | null {
  if (!date) return null;
  
  // Handle ISO Strings
  if (typeof date === 'string') {
    const d = parseISO(date);
    return isValid(d) ? d : null;
  }
  
  // Handle Firestore Timestamps
  if (date && typeof date.toDate === 'function') {
    try {
      const d = date.toDate();
      return isValid(d) ? d : null;
    } catch (e) {
      return null;
    }
  }
  
  // Handle Date Objects
  if (date instanceof Date) {
    return isValid(date) ? date : null;
  }

  // Fallback for number (timestamp)
  if (typeof date === 'number') {
    const d = new Date(date);
    return isValid(d) ? d : null;
  }
  
  return null;
}

/**
 * Philippine Holidays for 2026
 */
export const PH_HOLIDAYS_2026: Record<string, string> = {
  "2026-01-01": "New Year's Day",
  "2026-01-02": "Special Non-working Day",
  "2026-02-17": "Chinese New Year",
  "2026-02-25": "EDSA People Power Revolution Anniversary",
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
  "2026-12-24": "Christmas Eve",
  "2026-12-25": "Christmas Day",
  "2026-12-30": "Rizal Day",
  "2026-12-31": "Last Day of the Year",
};

/**
 * Returns the name of the holiday if the date is a holiday.
 */
export function getHolidayName(date: Date): string | null {
  const key = format(date, 'yyyy-MM-dd');
  return PH_HOLIDAYS_2026[key] || null;
}

/**
 * Returns the ISO string for the start of the current calendar year.
 */
export function getStartOfYearISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1).toISOString();
}

/**
 * Returns the ISO range for a specific month YYYY-MM
 */
export function getMonthRangeISO(monthStr?: string): { start: string, end: string } {
    const date = monthStr ? new Date(monthStr + "-01") : new Date();
    const start = startOfMonth(date).toISOString();
    const end = endOfMonth(date).toISOString();
    return { start, end };
}

/**
 * Gets the Monday of the week for a given date.
 */
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
