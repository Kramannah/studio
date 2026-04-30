import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { startOfWeek, isSameWeek, parseISO, isValid, startOfMonth } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns the ISO string for the start of the current period.
 * Defaulting to the start of the month for broad visibility without restrictions.
 */
export function getQueryStartDateISO(): string {
  const now = new Date();
  return startOfMonth(now).toISOString();
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
