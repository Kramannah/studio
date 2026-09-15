'use server';

/**
 * EMAIL ENGINE - MANUAL MODE
 * Background delivery service is disabled (No API Key).
 * This file is maintained for structure but returns a redirection hint.
 */
export async function sendApprovalReminderEmail(email: string, managerName: string, pmrs: string[], count: number) {
  // Logic moved to client-side mailto to avoid API key requirements
  return { success: false, error: "Please use the manual email trigger." };
}
