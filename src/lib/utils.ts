import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { startOfWeek, isSameWeek, isBefore, startOfMonth, endOfMonth, parseISO, isValid, startOfYear } from "date-fns"

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

export function getMonthRangeISO(monthStr?: string) {
  const date = monthStr ? parseISO(monthStr + "-01") : new Date();
  return {
    start: startOfMonth(date).toISOString(),
    end: endOfMonth(date).toISOString()
  };
}

export function getStartOfYearISO() {
  return startOfYear(new Date()).toISOString();
}

export function parseAnyDate(date: any): Date | null {
  if (!date) return null;
  if (date instanceof Date) return isValid(date) ? date : null;
  if (typeof date === 'string') {
    const parsed = parseISO(date);
    return isValid(parsed) ? parsed : null;
  }
  if (typeof date.toDate === 'function') {
    const d = date.toDate();
    return isValid(d) ? d : null;
  }
  return null;
}

/**
 * Safely sets an item in localStorage, handling QuotaExceededError.
 * If quota is exceeded, it attempts to clear old SFE-related cache items.
 */
export function safeStorageSet(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch (e: any) {
        if (
            e instanceof DOMException &&
            (e.code === 22 ||
                e.code === 1014 ||
                e.name === 'QuotaExceededError' ||
                e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
        ) {
            console.warn("Storage quota exceeded. Purging old cache to free space.");
            try {
                // Purge old SFE cache items (excluding critical auth or offline-pending items)
                const keysToRemove: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith('sfe-') && !k.includes('offline-coverage')) {
                        keysToRemove.push(k);
                    }
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));
                
                // Retry once
                localStorage.setItem(key, value);
            } catch (retryError) {
                console.warn("Could not save to localStorage even after purge. App will remain functional but cache is disabled for this item.");
            }
        } else {
            console.error("LocalStorage error:", e);
        }
    }
}

export const PH_HOLIDAYS_2026: Record<string, string> = {
  "2026-01-01": "New Year's Day",
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
  "2026-12-25": "Christmas Day",
  "2026-12-30": "Rizal Day",
  "2026-12-31": "Last Day of the Year"
};

export function getHolidayName(date: Date): string | null {
  if (!date || !isValid(date)) return null;
  const key = date.toISOString().split('T')[0];
  return PH_HOLIDAYS_2026[key] || null;
}
