/**
 * Contact Controller
 * Handles contact form submissions
 */

import emailService from '../services/emailService.js';
import logger from '../utils/logger.js';
import pool from '../db/connection.js';

class ContactController {
  /**
   * Handle contact form submission
   * POST /api/contact
   */
  async submitContact(request, reply) {
    try {
      const { firstName, lastName, email, message } = request.body;

      // Validate required fields
      if (!firstName || !lastName || !email || !message) {
        return reply.code(400).send({
          success: false,
          message: 'All fields are required: firstName, lastName, email, message',
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return reply.code(400).send({
          success: false,
          message: 'Invalid email address format',
        });
      }

      // Validate message length
      if (message.trim().length < 10) {
        return reply.code(400).send({
          success: false,
          message: 'Message must be at least 10 characters long',
        });
      }

      // Prepare contact data
      const contactData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        message: message.trim(),
        submittedAt: new Date().toISOString(),
        ip: request.ip || request.headers['x-forwarded-for'] || 'unknown',
        userAgent: request.headers['user-agent'] || null,
        referer: request.headers.referer || null,
      };

      logger.info('📧 Contact form submission received', {
        email: contactData.email,
        name: `${contactData.firstName} ${contactData.lastName}`,
      });

      // Save to database
      let submissionId = null;
      try {
        const [insertResult] = await pool.query(
          `INSERT INTO contact_submissions 
           (first_name, last_name, email, message, ip_address, user_agent, referer, status) 
           VALUES (?, ?, ?, ?, ?, ?, ?, 'new')`,
          [
            contactData.firstName,
            contactData.lastName,
            contactData.email,
            contactData.message,
            contactData.ip,
            contactData.userAgent,
            contactData.referer,
          ]
        );
        submissionId = insertResult.insertId;
        logger.info('✅ Contact submission saved to database', {
          submissionId,
          email: contactData.email,
        });
      } catch (dbError) {
        // Log error but don't fail the request if table doesn't exist yet
        logger.error('❌ Failed to save contact submission to database:', dbError);
        // Continue with email sending even if DB save fails
      }

      // Send emails asynchronously (don't block response)
      Promise.all([
        emailService.sendContactNotification(contactData).catch((err) => {
          logger.error('❌ Failed to send notification email:', err);
        }),
        emailService.sendContactConfirmation(contactData).catch((err) => {
          logger.error('❌ Failed to send confirmation email:', err);
        }),
      ]).then(() => {
        logger.info('✅ Contact form emails processed', {
          email: contactData.email,
        });
      }).catch((err) => {
        logger.error('❌ Error processing contact form emails:', err);
      });

      // Return success immediately (emails sent asynchronously)
      return reply.code(200).send({
        success: true,
        message: 'Thank you for contacting us! We have received your message and will get back to you within 24 hours.',
      });
    } catch (error) {
      logger.error('❌ Contact form submission error:', error);
      return reply.code(500).send({
        success: false,
        message: 'An error occurred while processing your request. Please try again later.',
      });
    }
  }
}

export default new ContactController();
