/**
 * Email Service
 * Handles SMTP email sending for contact form notifications
 */

import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  /**
   * Initialize SMTP transporter
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // SMTP configuration from environment variables
      const smtpConfig = {
        host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
        port: parseInt(process.env.SMTP_PORT || '465'), // GoDaddy often works better with 465 (SSL) or 587 (TLS)
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
        tls: {
          // Do not fail on invalid certs
          rejectUnauthorized: false
        }
      };

      // Validate required SMTP credentials
      if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
        logger.warn('⚠️ SMTP credentials not configured. Email service will be disabled.');
        this.initialized = false;
        return;
      }

      // Create transporter
      this.transporter = nodemailer.createTransport({
        ...smtpConfig,
        debug: true, // show debug output
        logger: true // log information in console
      });

      // Verify connection
      await this.transporter.verify();
      logger.info('✅ SMTP connection verified successfully');
      this.initialized = true;
    } catch (error) {
      logger.error('❌ Failed to initialize SMTP transporter:', error);
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Send email
   */
  async sendEmail(options) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.initialized || !this.transporter) {
      throw new Error('Email service not initialized. Check SMTP configuration.');
    }

    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER || 'support@track-myads.com',
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.htmlToText(options.html),
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info('✅ Email sent successfully', {
        to: options.to,
        subject: options.subject,
        messageId: info.messageId,
      });

      return info;
    } catch (error) {
      logger.error('❌ Failed to send email:', {
        to: options.to,
        subject: options.subject,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Convert HTML to plain text (fallback)
   */
  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  /**
   * Send contact form notification to admin
   */
  async sendContactNotification(contactData) {
    const adminEmail = process.env.CONTACT_ADMIN_EMAIL || process.env.SMTP_USER;

    if (!adminEmail) {
      logger.warn('⚠️ CONTACT_ADMIN_EMAIL not configured. Skipping notification email.');
      return;
    }

    const html = this.getNotificationEmailTemplate(contactData);

    return await this.sendEmail({
      to: adminEmail,
      subject: `New Contact Form Submission - ${contactData.firstName} ${contactData.lastName}`,
      html,
    });
  }

  /**
   * Send confirmation email to user
   */
  async sendContactConfirmation(contactData) {
    const html = this.getConfirmationEmailTemplate(contactData);

    return await this.sendEmail({
      to: contactData.email,
      subject: 'Thank You for Contacting TrackMyAds',
      html,
    });
  }

  /**
   * Send OTP email
   */
  async sendOtpEmail(email, otp) {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Password Reset OTP</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #ff6b35; margin: 0;">TrackMyAds</h1>
  </div>
  <div style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 30px; text-align: center;">
    <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>
    <p style="color: #666; font-size: 16px;">
      Your One-Time Password (OTP) for password reset is:
    </p>
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #2196F3; margin: 20px 0;">
      ${otp}
    </div>
    <p style="color: #666; font-size: 14px;">
      This OTP is valid for 10 minutes. Do not share this OTP with anyone.
    </p>
    <p style="color: #666; font-size: 14px;">
      If you did not request this OTP, please ignore this email.
    </p>
  </div>
</body>
</html>
    `;

    return await this.sendEmail({
      to: email,
      subject: 'Your Password Reset OTP - TrackMyAds',
      html,
    });
  }

  /**
   * Notification email template (to admin)
   */
  getNotificationEmailTemplate(data) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Contact Form Submission</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h2 style="color: #ff6b35; margin-top: 0;">New Contact Form Submission</h2>
    <p style="margin: 0; color: #666;">You have received a new contact form submission from TrackMyAds website.</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 10px 0; font-weight: bold; width: 150px; color: #333;">Name:</td>
        <td style="padding: 10px 0; color: #666;">${this.escapeHtml(data.firstName)} ${this.escapeHtml(data.lastName)}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-weight: bold; color: #333;">Email:</td>
        <td style="padding: 10px 0; color: #666;"><a href="mailto:${this.escapeHtml(data.email)}" style="color: #ff6b35; text-decoration: none;">${this.escapeHtml(data.email)}</a></td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-weight: bold; color: #333; vertical-align: top;">Message:</td>
        <td style="padding: 10px 0; color: #666; white-space: pre-wrap;">${this.escapeHtml(data.message)}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-weight: bold; color: #333;">Submitted:</td>
        <td style="padding: 10px 0; color: #666;">${new Date().toLocaleString()}</td>
      </tr>
    </table>
  </div>

  <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      This email was sent from the TrackMyAds contact form.<br>
      Please respond directly to the sender's email address.
    </p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Confirmation email template (to user)
   */
  getConfirmationEmailTemplate(data) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank You for Contacting TrackMyAds</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #ff6b35; margin: 0;">TrackMyAds</h1>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 30px;">
    <h2 style="color: #333; margin-top: 0;">Thank You for Contacting Us!</h2>
    
    <p style="color: #666; font-size: 16px;">
      Dear ${this.escapeHtml(data.firstName)},
    </p>

    <p style="color: #666; font-size: 16px;">
      Thank you for reaching out to TrackMyAds. We have successfully received your message and our team will review it shortly.
    </p>

    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0; color: #333; font-weight: bold;">What happens next?</p>
      <ul style="margin: 10px 0; padding-left: 20px; color: #666;">
        <li>Our team will review your inquiry within 24 hours</li>
        <li>We'll respond to you at <strong>${this.escapeHtml(data.email)}</strong></li>
        <li>If your inquiry is urgent, please call us directly</li>
      </ul>
    </div>

    <p style="color: #666; font-size: 16px;">
      We appreciate your interest in TrackMyAds and look forward to assisting you.
    </p>

    <p style="color: #666; font-size: 16px; margin-top: 30px;">
      Best regards,<br>
      <strong style="color: #ff6b35;">The TrackMyAds Team</strong>
    </p>
  </div>

  <div style="margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      <strong>TrackMyAds</strong><br>
      PARK SERENE, Gurgaon, Sector 37D<br>
      Haryana, India<br><br>
      Office Hours: Monday - Friday, 9:00 AM - 6:00 PM IST
    </p>
  </div>

  <div style="margin-top: 20px; text-align: center; color: #999; font-size: 12px;">
    <p style="margin: 0;">
      This is an automated confirmation email. Please do not reply to this message.<br>
      If you have any questions, please contact us through our website.
    </p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return String(text).replace(/[&<>"']/g, (m) => map[m]);
  }
}

export default new EmailService();
