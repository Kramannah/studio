
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { startOfWeek, isSameWeek, startOfMonth, isBefore, subDays, subMonths } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns the ISO string for the start of the current calendar year.
 * Used for high-performance inventory and summary scans.
 */
export function getStartOfYearISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1).toISOString();
}

/**
 * Returns the ISO string for the start of the current period.
 * Defaulting to 6 months for general visibility.
 */
export function getQueryStartDateISO(forceAllWeek?: boolean): string {
  const now = new Date();
  if (forceAllWeek) {
      return subDays(now, 7).toISOString();
  }
  return subMonths(startOfMonth(now), 5).toISOString();
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
