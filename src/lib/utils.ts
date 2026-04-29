import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getHours, startOfWeek, isSameWeek, parseISO, isValid, startOfDay } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns true if the current time is between 8:00 PM and 5:00 AM.
 * This is the window for historical data syncing and reporting.
 */
export function isSyncWindowOpen(): boolean {
  const currentHour = getHours(new Date());
  return currentHour >= 20 || currentHour < 5;
}

/**
 * Returns the ISO string for the start of the current period based on the 8 PM rule.
 * During the day: Start of Today.
 * During the sync window: Start of the Week.
 */
export function getQueryStartDateISO(forceAllWeek: boolean = false): string {
  const now = new Date();
  if (forceAllWeek || isSyncWindowOpen()) {
    return startOfWeek(now, { weekStartsOn: 1 }).toISOString();
  }
  return startOfDay(now).toISOString();
}

/**
 * Returns true if the provided ISO date string is within the current week.
 * Week starts on Monday.
 */
export function isCurrentWeek(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  try {
    const date = parseISO(dateStr);
    if (!isValid(date)) return false;
    return isSameWeek(date, new Date(), { weekStartsOn: 1 });
  } catch (e) {
    return false;
  }
}
