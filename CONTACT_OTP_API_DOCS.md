# Contact Form OTP API Documentation

## Base URL
```
http://localhost:5001/api
```

---

## Endpoints

### 1. Send OTP

Generate and send OTP to user's email for contact form verification.

**Endpoint**: `POST /contact/send-otp`

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "message": "I would like to know more about your services"
}
```

**Field Validation**:
- `firstName`: Required, 1-100 characters
- `lastName`: Required, 1-100 characters
- `email`: Required, valid email format
- `message`: Required, minimum 10 characters, maximum 5000 characters

**Success Response** (200 OK):
```json
{
  "success": true,
  "message": "OTP sent successfully to your email"
}
```

**Error Responses**:

**400 Bad Request** - Validation Error:
```json
{
  "success": false,
  "message": "All fields are required: firstName, lastName, email, message"
}
```

**400 Bad Request** - Invalid Email:
```json
{
  "success": false,
  "message": "Invalid email address format"
}
```

**400 Bad Request** - Message Too Short:
```json
{
  "success": false,
  "message": "Message must be at least 10 characters long"
}
```

**429 Too Many Requests** - Rate Limited:
```json
{
  "success": false,
  "message": "Please wait before requesting another OTP. Check your email."
}
```

**500 Internal Server Error** - Email Failure:
```json
{
  "success": false,
  "message": "Failed to send OTP email. Please try again."
}
```

**Rate Limiting**: 
- 90-second cooldown between OTP requests per email address

**OTP Details**:
- Format: 6-digit numeric code
- Expiration: 5 minutes
- Storage: Redis with automatic cleanup

---

### 2. Verify OTP

Verify OTP and submit contact form to admin.

**Endpoint**: `POST /contact/verify-otp`

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "email": "john.doe@example.com",
  "otp": "123456"
}
```

**Field Validation**:
- `email`: Required, valid email format
- `otp`: Required, exactly 6 digits

**Success Response** (200 OK):
```json
{
  "success": true,
  "message": "Your message has been sent successfully!"
}
```

**Error Responses**:

**400 Bad Request** - Missing Fields:
```json
{
  "success": false,
  "message": "Email and OTP are required"
}
```

**400 Bad Request** - Invalid OTP Format:
```json
{
  "success": false,
  "message": "Invalid OTP format. Must be 6 digits."
}
```

**400 Bad Request** - OTP Expired:
```json
{
  "success": false,
  "message": "OTP expired or not found. Please request a new OTP."
}
```

**400 Bad Request** - Invalid OTP:
```json
{
  "success": false,
  "message": "Invalid OTP. 2 attempts remaining."
}
```

**400 Bad Request** - Max Attempts Exceeded:
```json
{
  "success": false,
  "message": "Maximum verification attempts exceeded. Please request a new OTP."
}
```

**500 Internal Server Error**:
```json
{
  "success": false,
  "message": "An error occurred while verifying OTP. Please try again later."
}
```

**Attempt Tracking**:
- Maximum 3 verification attempts per OTP
- OTP deleted after max attempts exceeded

**On Success**:
- Contact submission saved to database
- Admin notification email sent
- User confirmation email sent
- OTP deleted from Redis (one-time use)

---

## Complete Flow Example

### Step 1: User Fills Contact Form

```javascript
const response = await fetch('http://localhost:5001/api/contact/send-otp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    message: 'I would like to know more about your services',
  }),
});

const data = await response.json();
// { success: true, message: "OTP sent successfully to your email" }
```

### Step 2: User Receives Email

Email contains:
- 6-digit OTP code (e.g., `123456`)
- 5-minute expiration warning
- Security reminders

### Step 3: User Enters OTP

```javascript
const response = await fetch('http://localhost:5001/api/contact/verify-otp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'john.doe@example.com',
    otp: '123456',
  }),
});

const data = await response.json();
// { success: true, message: "Your message has been sent successfully!" }
```

### Step 4: Emails Sent

1. **Admin Email**: Notification with contact details
2. **User Email**: Confirmation that message was received

---

## Testing with cURL

### Send OTP
```bash
curl -X POST http://localhost:5001/api/contact/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "message": "This is a test message for OTP verification"
  }'
```

### Verify OTP
```bash
curl -X POST http://localhost:5001/api/contact/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "otp": "123456"
  }'
```

---

## Security Features

1. **Rate Limiting**: 60-second cooldown between OTP requests
2. **Attempt Tracking**: Maximum 3 verification attempts
3. **Time Expiration**: OTP valid for 5 minutes
4. **One-Time Use**: OTP deleted after successful verification
5. **Input Validation**: Email format, OTP format, message length
6. **IP Tracking**: Logs IP address, user agent, referer

---

## Email Templates

### OTP Email (to user)
- Subject: "Verify Your Contact Request - TrackMyAds"
- Contains: 6-digit OTP code
- Expiration: 5 minutes
- Branding: TrackMyAds styling

### Admin Notification (to admin)
- Subject: "New Contact Form Submission - [Name]"
- Contains: Full contact details
- Note: Email verified via OTP

### User Confirmation (to user)
- Subject: "Thank You for Contacting TrackMyAds"
- Contains: Confirmation message
- Next steps: What to expect

---

## Error Handling

All endpoints return consistent error format:

```json
{
  "success": false,
  "message": "Human-readable error message"
}
```

HTTP Status Codes:
- `200`: Success
- `400`: Bad Request (validation errors)
- `429`: Too Many Requests (rate limited)
- `500`: Internal Server Error

---

## Database Schema

Contact submissions are stored in `contact_submissions` table:

```sql
CREATE TABLE contact_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  referer VARCHAR(500),
  status ENUM('new', 'read', 'replied', 'archived') DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## Redis Keys

### OTP Storage
- **Key**: `otp:contact:{email}`
- **Value**: JSON string with OTP, form data, attempts
- **TTL**: 300 seconds (5 minutes)

### Rate Limiting
- **Key**: `otp:ratelimit:{email}`
- **Value**: "1" (flag)
- **TTL**: 60 seconds

---

## Environment Variables

Required SMTP configuration (already set in `.env`):

```env
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=support@track-myads.com
SMTP_PASSWORD='Bbipin#1234'
SMTP_FROM=support@track-myads.com
CONTACT_ADMIN_EMAIL=support@track-myads.com
```

---

## Monitoring & Logging

All operations are logged:

```
📧 OTP generated for contact form
✅ OTP email sent successfully
✅ OTP verified successfully
✅ Contact submission saved to database
⚠️ Invalid OTP attempt
❌ Failed to send OTP email
```

---

## Support

For issues or questions:
- Check server logs for detailed error messages
- Verify Redis connection
- Confirm SMTP settings
- Test with provided cURL commands
