import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { startOfWeek, isSameWeek, startOfMonth, isBefore, subDays, subMonths } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns the ISO string for the start of the current period.
 * If forceAllWeek is true, returns 7 days ago. 
 * Default: Returns start of last month for historical context.
 * REDUCED: Window narrowed from 6 months to 2 months to prevent "Quota Exceeded" errors.
 */
export function getQueryStartDateISO(forceAllWeek?: boolean): string {
  const now = new Date();
  if (forceAllWeek) {
      return subDays(now, 7).toISOString();
  }
  // Show data from the last 2 months (current month + 1 previous)
  return subMonths(startOfMonth(now), 1).toISOString();
}

/**
 * Returns true if the provided date is within the current week.
 * Week starts on Monday.
 */
export function isCurrentWeek(date: Date): boolean {
  return isSameWeek(date, new Date(), { weekStartsOn: 1 });
}

/**
 * Returns true if the provided date is before the current week.
 */
export function isPastWeek(date: Date): boolean {
  const startOfThisWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
  const startOfTargetWeek = startOfWeek(date, { weekStartsOn: 1 });
  return isBefore(startOfTargetWeek, startOfThisWeek);
}

/**
 * Gets the Monday of the week for a given date.
 */
export function getWeekMonday(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}
