import { Resend } from 'resend';

const FROM_EMAIL = process.env['RESEND_FROM_EMAIL'] ?? 'noreply@unlockhub.app';
const APP_NAME = 'UnlockHub';

function getResend(): Resend {
  const key = process.env['RESEND_API_KEY'];
  if (!key) throw new Error('RESEND_API_KEY no está configurado');
  return new Resend(key);
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${APP_NAME} — Reset your password`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px;background:#0f0f1a;color:#e5e7eb;border-radius:12px;">
        <h1 style="color:#6366f1;font-size:24px;margin-bottom:8px;">${APP_NAME}</h1>
        <h2 style="font-size:18px;color:#ffffff;margin-bottom:16px;">Reset your password</h2>
        <p style="color:#9ca3af;margin-bottom:24px;">
          We received a request to reset your password. Click the button below to choose a new one.
          This link expires in <strong style="color:#e5e7eb;">1 hour</strong>.
        </p>
        <a href="${resetUrl}"
           style="display:inline-block;background:#6366f1;color:#ffffff;font-weight:600;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;">
          Reset password
        </a>
        <p style="color:#6b7280;font-size:12px;margin-top:24px;">
          If you didn't request this, you can safely ignore this email. Your password won't change.
        </p>
        <p style="color:#6b7280;font-size:12px;">
          Or copy this URL into your browser:<br/>
          <span style="color:#9ca3af;word-break:break-all;">${resetUrl}</span>
        </p>
      </div>
    `,
    text: `Reset your ${APP_NAME} password\n\nClick the link below to reset your password (expires in 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
  });
}
