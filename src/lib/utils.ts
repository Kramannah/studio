import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { startOfWeek, isSameWeek, isBefore, parseISO, isValid } from "date-fns"

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

export function parseAnyDate(date: any): Date | null {
  if (!date) return null;
  if (date instanceof Date) return isValid(date) ? date : null;
  if (typeof date === 'string') {
    const parsed = parseISO(date);
    return isValid(parsed) ? parsed : null;
  }
  return null;
}
