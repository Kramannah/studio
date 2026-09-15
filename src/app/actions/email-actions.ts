'use server';

import { Resend } from 'resend';

/**
 * Sends a background reminder to a District Sales Manager regarding pending approvals.
 * Uses the Resend service for high-reputation delivery.
 */
export async function sendApprovalReminderEmail(email: string, managerName: string, pmrs: string[], count: number) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
      console.error("CRITICAL: RESEND_API_KEY is not configured in environment variables.");
      return { success: false, error: "System email service is not configured." };
  }

  try {
    const resend = new Resend(apiKey);
    
    const { data, error } = await resend.emails.send({
      from: 'SFE Notifications <notifications@hovidinc.com>',
      to: [email],
      subject: `URGENT: ${count} Pending Non-Call Day Approvals`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; color: #1e293b;">
          <div style="background-color: #10b981; padding: 32px 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">Action Required</h1>
            <p style="color: #d1fae5; margin: 8px 0 0 0; font-weight: 500;">Pending Approval Requests</p>
          </div>
          
          <div style="padding: 32px 24px; background-color: #ffffff;">
            <p style="margin-top: 0; font-size: 16px;">Hi <strong>${managerName}</strong>,</p>
            <p style="font-size: 15px; line-height: 1.6;">There are currently <strong>${count} pending</strong> Non-Call Day requests from your territory team that require your review in the SFE Dashboard.</p>
            
            <div style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <p style="margin-top: 0; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">Affected Representatives:</p>
              <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px;">
                ${pmrs.map(name => `<li style="margin-bottom: 6px; font-weight: 600;">${name}</li>`).join('')}
              </ul>
            </div>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="https://hovidcoverage.web.app/admin" style="background-color: #1e293b; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block;">Log In to Approve</a>
            </div>
            
            <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">Best regards,<br/><strong>Administration Team</strong></p>
          </div>
          
          <div style="background-color: #f1f5f9; padding: 20px; text-align: center;">
            <p style="margin: 0; font-size: 11px; color: #94a3b8;">This is a system-generated message from the SFE Offline App.<br/>Please do not reply to this automated email.</p>
          </div>
        </div>
      `,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    return { success: false, error: err.message || "Internal server error during email dispatch." };
  }
}
