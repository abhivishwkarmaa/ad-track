
import emailService from './emailService.js';
import logger from '../utils/logger.js';

// Setup basic logger mock if running standalone
if (!global.logger) {
    global.logger = {
        info: console.log,
        error: console.error,
        warn: console.warn
    };
}

async function testEmail() {
    console.log('🧪 Starting email test...');
    console.log('Sending from:', process.env.SMTP_USER || 'support@track-myads.com');

    try {
        await emailService.initialize();

        await emailService.sendEmail({
            to: 'support@track-myads.com', // Send to self to test
            subject: 'Test Email from Nodemailer',
            html: '<h1>It Works!</h1><p>This is a test email sent from the Pulpy Reporting Portal backend using GoDaddy SMTP.</p>'
        });

        console.log('✅ Test email sent successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Email test failed:', error);
        process.exit(1);
    }
}

// Load env vars if running standalone (requires dotenv if not already loaded by runner)
// But since we are likely running via `node -r dotenv/config` or similar in a real env, 
// for this test script let's assume env is loaded or we run with dotenv
import 'dotenv/config';

testEmail();
