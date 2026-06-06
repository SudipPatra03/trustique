/**
 * Email Utility — Send OTP emails via EmailJS REST API
 * Falls back to console logging in development when credentials are not configured.
 */

/**
 * Send an OTP email to the user
 * @param {string} toEmail - Recipient email address
 * @param {string} toName - Recipient name
 * @param {string} otp - The 6-digit OTP code
 * @param {string} purpose - 'verification' | 'password_reset'
 * @returns {Promise<boolean>} - Whether the email was sent successfully
 */
async function sendOtpEmail(toEmail, toName, otp, purpose = 'verification') {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'Trustique';

  const subject = purpose === 'verification'
    ? 'Trustique — Verify Your Email'
    : 'Trustique — Password Reset Code';

  const introMessage = purpose === 'verification'
    ? 'Welcome to Trustique! Please use the verification code below to complete your registration.'
    : 'We received a request to reset your password. Use the verification code below to proceed.';

  const textBody = purpose === 'verification'
    ? `Hi ${toName},\n\nWelcome to Trustique! Your verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\n— Trustique`
    : `Hi ${toName},\n\nYour password reset code is: ${otp}\n\nThis code expires in 10 minutes. If you did not request this, please ignore this email.\n\n— Trustique`;

  // HTML template for elegant presentation
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; padding: 32px; background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); }
        .header { font-size: 24px; font-weight: bold; color: #38bdf8; margin-bottom: 24px; text-align: center; letter-spacing: 1px; }
        .message { font-size: 16px; line-height: 1.6; color: #cbd5e1; margin-bottom: 32px; }
        .otp-container { text-align: center; margin: 30px 0; }
        .otp-card { background-color: #0f172a; border: 2px dashed #38bdf8; border-radius: 8px; padding: 15px 30px; display: inline-block; }
        .otp-code { font-size: 36px; font-weight: 800; color: #38bdf8; letter-spacing: 6px; font-family: 'Courier New', Courier, monospace; }
        .footer { font-size: 12px; color: #64748b; margin-top: 32px; border-top: 1px solid #334155; padding-top: 16px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">TRUSTIQUE</div>
        <div class="message">
          <p>Hi ${toName},</p>
          <p>${introMessage}</p>
          <div class="otp-container">
            <div class="otp-card">
              <span class="otp-code">${otp}</span>
            </div>
          </div>
          <p style="font-size: 14px; color: #94a3b8; margin-top: 24px;">This code is valid for <strong>10 minutes</strong>. If you did not request this, you can safely ignore this email.</p>
        </div>
        <div class="footer">
          This is an automated security message from Trustique. Please do not reply.
        </div>
      </div>
    </body>
    </html>
  `;

  // Fallback to console logging if credentials are missing or default
  if (!apiKey || apiKey === 'your_brevo_api_key_here' || !senderEmail || senderEmail === 'your_verified_sender_email_here') {
    console.log('\n═══════════════════════════════════════════');
    console.log(`📧 [LOCAL FALLBACK] OTP EMAIL (${purpose.toUpperCase()})`);
    console.log(`   To: ${toEmail} (${toName})`);
    console.log(`   OTP: ${otp}`);
    console.log(`   Expires in 10 minutes`);
    console.log('═══════════════════════════════════════════\n');
    return true;
  }

  // Send via Brevo API v3
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail
        },
        to: [
          {
            email: toEmail,
            name: toName
          }
        ],
        subject: subject,
        htmlContent: htmlBody,
        textContent: textBody
      })
    });

    if (response.ok) {
      console.log(`📧 OTP email successfully sent to ${toEmail} via Brevo (${purpose})`);
      return true;
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error(`❌ Brevo API error: ${response.status} — ${JSON.stringify(errorData)}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to send OTP email via Brevo:', error.message);
    return false;
  }
}

/**
 * Generate a 6-digit numeric OTP
 * @returns {string} - 6-digit OTP string
 */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = { sendOtpEmail, generateOtp };
