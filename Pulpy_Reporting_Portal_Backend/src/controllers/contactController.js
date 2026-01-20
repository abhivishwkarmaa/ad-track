/**
 * Contact Controller
 * Handles contact form submissions and admin viewing
 */

import emailService from '../services/emailService.js';
import logger from '../utils/logger.js';
import pool from '../db/connection.js';

class ContactController {
  /**
   * Get all contact submissions (Admin only)
   * GET /api/admin/contact-submissions
   */
  async getAllContactSubmissions(request, reply) {
    try {
      // Only super admins can view contact submissions
      if (!request.admin || !request.admin.isSuperAdmin) {
        return reply.code(403).send({
          success: false,
          error: 'Forbidden',
          message: 'Only super admins can view contact submissions',
        });
      }

      // Pagination parameters
      const page = parseInt(request.query.page) || 1;
      const limit = parseInt(request.query.limit) || 50;
      const offset = (page - 1) * limit;
      const status = request.query.status || null;
      const search = request.query.search || null;

      // Build query
      let whereClause = '';
      const params = [];

      if (status && ['new', 'read', 'replied', 'archived'].includes(status)) {
        whereClause = 'WHERE status = ?';
        params.push(status);
      }

      if (search) {
        if (whereClause) {
          whereClause += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR message LIKE ?)';
        } else {
          whereClause = 'WHERE (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR message LIKE ?)';
        }
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern);
      }

      // Get total count
      const [countResult] = await pool.query(
        `SELECT COUNT(*) as total FROM contact_submissions ${whereClause}`,
        params
      );
      const total = countResult[0].total;

      // Get submissions with pagination
      const [submissions] = await pool.query(
        `SELECT 
          id, first_name, last_name, email, message, 
          ip_address, user_agent, referer, status, 
          created_at, updated_at
         FROM contact_submissions 
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      logger.info('✅ Contact submissions retrieved by admin', {
        adminId: request.admin.id,
        total,
        page,
        limit,
      });

      return reply.code(200).send({
        success: true,
        data: submissions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error('❌ Error fetching contact submissions:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to fetch contact submissions',
      });
    }
  }

  /**
   * Get single contact submission (Admin only)
   * GET /api/admin/contact-submissions/:id
   */
  async getContactSubmission(request, reply) {
    try {
      // Only super admins can view contact submissions
      if (!request.admin || !request.admin.isSuperAdmin) {
        return reply.code(403).send({
          success: false,
          error: 'Forbidden',
          message: 'Only super admins can view contact submissions',
        });
      }

      const { id } = request.params;

      const [submissions] = await pool.query(
        `SELECT 
          id, first_name, last_name, email, message, 
          ip_address, user_agent, referer, status, 
          created_at, updated_at
         FROM contact_submissions 
         WHERE id = ?`,
        [id]
      );

      if (!submissions || submissions.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Contact submission not found',
        });
      }

      // Mark as read if currently new
      if (submissions[0].status === 'new') {
        await pool.query(
          'UPDATE contact_submissions SET status = ? WHERE id = ?',
          ['read', id]
        );
        submissions[0].status = 'read';
      }

      logger.info('✅ Contact submission viewed by admin', {
        adminId: request.admin.id,
        submissionId: id,
      });

      return reply.code(200).send({
        success: true,
        data: submissions[0],
      });
    } catch (error) {
      logger.error('❌ Error fetching contact submission:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to fetch contact submission',
      });
    }
  }

  /**
   * Update contact submission status (Admin only)
   * PATCH /api/admin/contact-submissions/:id/status
   */
  async updateContactStatus(request, reply) {
    try {
      // Only super admins can update contact submissions
      if (!request.admin || !request.admin.isSuperAdmin) {
        return reply.code(403).send({
          success: false,
          error: 'Forbidden',
          message: 'Only super admins can update contact submissions',
        });
      }

      const { id } = request.params;
      const { status } = request.body;

      // Validate status
      if (!status || !['new', 'read', 'replied', 'archived'].includes(status)) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Invalid status. Must be one of: new, read, replied, archived',
        });
      }

      // Update status
      const [result] = await pool.query(
        'UPDATE contact_submissions SET status = ? WHERE id = ?',
        [status, id]
      );

      if (result.affectedRows === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Contact submission not found',
        });
      }

      logger.info('✅ Contact submission status updated by admin', {
        adminId: request.admin.id,
        submissionId: id,
        newStatus: status,
      });

      return reply.code(200).send({
        success: true,
        message: 'Contact submission status updated successfully',
      });
    } catch (error) {
      logger.error('❌ Error updating contact submission status:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to update contact submission status',
      });
    }
  }

  /**
   * Delete contact submission (Admin only)
   * DELETE /api/admin/contact-submissions/:id
   */
  async deleteContactSubmission(request, reply) {
    try {
      // Only super admins can delete contact submissions
      if (!request.admin || !request.admin.isSuperAdmin) {
        return reply.code(403).send({
          success: false,
          error: 'Forbidden',
          message: 'Only super admins can delete contact submissions',
        });
      }

      const { id } = request.params;

      const [result] = await pool.query(
        'DELETE FROM contact_submissions WHERE id = ?',
        [id]
      );

      if (result.affectedRows === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Contact submission not found',
        });
      }

      logger.info('✅ Contact submission deleted by admin', {
        adminId: request.admin.id,
        submissionId: id,
      });

      return reply.code(200).send({
        success: true,
        message: 'Contact submission deleted successfully',
      });
    } catch (error) {
      logger.error('❌ Error deleting contact submission:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to delete contact submission',
      });
    }
  }

  /**
   * Get contact submissions statistics (Admin only)
   * GET /api/admin/contact-submissions/stats
   */
  async getContactStats(request, reply) {
    try {
      // Only super admins can view contact stats
      if (!request.admin || !request.admin.isSuperAdmin) {
        return reply.code(403).send({
          success: false,
          error: 'Forbidden',
          message: 'Only super admins can view contact statistics',
        });
      }

      // Get stats by status
      const [statusStats] = await pool.query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM contact_submissions
        GROUP BY status
      `);

      // Get total count
      const [totalResult] = await pool.query(
        'SELECT COUNT(*) as total FROM contact_submissions'
      );

      // Get recent submissions count (last 7 days)
      const [recentResult] = await pool.query(`
        SELECT COUNT(*) as recent 
        FROM contact_submissions 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      `);

      // Format stats
      const stats = {
        total: totalResult[0].total,
        recent: recentResult[0].recent,
        byStatus: {
          new: 0,
          read: 0,
          replied: 0,
          archived: 0,
        },
      };

      statusStats.forEach(stat => {
        stats.byStatus[stat.status] = stat.count;
      });

      logger.info('✅ Contact stats retrieved by admin', {
        adminId: request.admin.id,
      });

      return reply.code(200).send({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('❌ Error fetching contact stats:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to fetch contact statistics',
      });
    }
  }

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
