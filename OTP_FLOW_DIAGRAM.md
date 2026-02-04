# Contact Form OTP Flow Diagram

## Complete User Journey

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER FILLS CONTACT FORM                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  First Name: John                                             │  │
│  │  Last Name: Doe                                               │  │
│  │  Email: john@example.com                                      │  │
│  │  Message: I would like to know more...                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND: POST /api/contact/send-otp              │
│  {                                                                   │
│    "firstName": "John",                                              │
│    "lastName": "Doe",                                                │
│    "email": "john@example.com",                                      │
│    "message": "I would like to know more..."                         │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND: contactController.sendOtp()              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  1. Validate form data (email, message length, etc.)          │  │
│  │  2. Check rate limiting (60s cooldown)                        │  │
│  │  3. Generate 6-digit OTP (e.g., 774524)                       │  │
│  │  4. Store in Redis with 5-min TTL:                            │  │
│  │     Key: otp:contact:john@example.com                         │  │
│  │     Value: { otp, firstName, lastName, email, message, ... }  │  │
│  │  5. Send OTP email via emailService                           │  │
│  │  6. Return success response                                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│   REDIS STORAGE (5 min)     │   │    EMAIL SERVICE            │
│  ┌─────────────────────────┐│   │  ┌─────────────────────────┐│
│  │ otp:contact:john@...    ││   │  │ To: john@example.com    ││
│  │ {                       ││   │  │ Subject: Verify Your    ││
│  │   "otp": "774524",      ││   │  │          Contact Request││
│  │   "firstName": "John",  ││   │  │                         ││
│  │   "attempts": 0,        ││   │  │ Your OTP: 774524        ││
│  │   ...                   ││   │  │ Expires in 5 minutes    ││
│  │ }                       ││   │  └─────────────────────────┘│
│  │ TTL: 300 seconds        ││   │                             │
│  └─────────────────────────┘│   └─────────────────────────────┘
└─────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND: OTP MODAL OPENS                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Enter the 6-digit code sent to your email:                  │  │
│  │  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐                        │  │
│  │  │ 7 │ │ 7 │ │ 4 │ │ 5 │ │ 2 │ │ 4 │                        │  │
│  │  └───┘ └───┘ └───┘ └───┘ └───┘ └───┘                        │  │
│  │                                                               │  │
│  │  Time remaining: 04:32                                        │  │
│  │  [Verify OTP]  [Resend OTP]                                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  FRONTEND: POST /api/contact/verify-otp              │
│  {                                                                   │
│    "email": "john@example.com",                                      │
│    "otp": "774524"                                                   │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  BACKEND: contactController.verifyOtp()              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  1. Validate email and OTP format                            │  │
│  │  2. Retrieve OTP data from Redis                             │  │
│  │  3. Check if expired (5 minutes)                             │  │
│  │  4. Check attempts (max 3)                                   │  │
│  │  5. Verify OTP matches                                       │  │
│  │  6. Save to database (contact_submissions)                   │  │
│  │  7. Send admin notification email                            │  │
│  │  8. Send user confirmation email                             │  │
│  │  9. Delete OTP from Redis (one-time use)                     │  │
│  │  10. Return success response                                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   DATABASE      │ │  ADMIN EMAIL    │ │  USER EMAIL     │
│  ┌─────────────┐│ │ ┌─────────────┐ │ │ ┌─────────────┐ │
│  │ INSERT INTO ││ │ │ To: admin@  │ │ │ │ To: john@   │ │
│  │ contact_    ││ │ │ Subject:    │ │ │ │ Subject:    │ │
│  │ submissions ││ │ │ New Contact │ │ │ │ Thank You   │ │
│  │             ││ │ │             │ │ │ │             │ │
│  │ id: 123     ││ │ │ Name: John  │ │ │ │ We received │ │
│  │ first_name  ││ │ │ Email: ...  │ │ │ │ your message│ │
│  │ last_name   ││ │ │ Message: .. │ │ │ │ and will    │ │
│  │ email       ││ │ │ Verified ✓  │ │ │ │ respond in  │ │
│  │ message     ││ │ │             │ │ │ │ 24 hours    │ │
│  │ status: new ││ │ └─────────────┘ │ │ └─────────────┘ │
│  └─────────────┘│ └─────────────────┘ └─────────────────┘
└─────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND: SUCCESS MESSAGE                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ✅ Success!                                                  │  │
│  │                                                               │  │
│  │  Your message has been sent successfully!                    │  │
│  │  We'll get back to you within 24 hours.                      │  │
│  │                                                               │  │
│  │  [Close]                                                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ERROR SCENARIOS                              │
└─────────────────────────────────────────────────────────────────────┘

1. INVALID EMAIL FORMAT
   User Input: "invalid-email"
   ↓
   Backend: Validate email format
   ↓
   Response: 400 "Invalid email address format"
   ↓
   Frontend: Show error message

2. RATE LIMITING
   User: Requests OTP twice within 60 seconds
   ↓
   Backend: Check Redis rate limit key
   ↓
   Response: 429 "Please wait before requesting another OTP"
   ↓
   Frontend: Show cooldown message

3. INVALID OTP
   User: Enters wrong OTP (e.g., 000000)
   ↓
   Backend: Compare with stored OTP
   ↓
   Backend: Increment attempts counter
   ↓
   Response: 400 "Invalid OTP. 2 attempts remaining."
   ↓
   Frontend: Show error, allow retry

4. OTP EXPIRED
   User: Enters OTP after 5 minutes
   ↓
   Backend: Check Redis (key not found)
   ↓
   Response: 400 "OTP expired or not found"
   ↓
   Frontend: Show error, offer to resend

5. MAX ATTEMPTS EXCEEDED
   User: Enters wrong OTP 3 times
   ↓
   Backend: Check attempts >= 3
   ↓
   Backend: Delete OTP from Redis
   ↓
   Response: 400 "Maximum verification attempts exceeded"
   ↓
   Frontend: Disable verify, offer to resend
```

---

## Security Features

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SECURITY LAYERS                              │
└─────────────────────────────────────────────────────────────────────┘

Layer 1: INPUT VALIDATION
  ├─ Email format validation (regex)
  ├─ Message length validation (min 10 chars)
  ├─ OTP format validation (6 digits)
  └─ SQL injection prevention (parameterized queries)

Layer 2: RATE LIMITING
  ├─ 60-second cooldown per email
  ├─ Redis key: otp:ratelimit:{email}
  └─ Prevents spam and abuse

Layer 3: ATTEMPT TRACKING
  ├─ Maximum 3 verification attempts
  ├─ Counter stored in Redis
  └─ OTP deleted after max attempts

Layer 4: TIME EXPIRATION
  ├─ 5-minute validity window
  ├─ Automatic cleanup via Redis TTL
  └─ Prevents replay attacks

Layer 5: ONE-TIME USE
  ├─ OTP deleted after successful verification
  ├─ Cannot be reused
  └─ Prevents token reuse attacks

Layer 6: AUDIT LOGGING
  ├─ IP address tracking
  ├─ User agent logging
  ├─ Referer tracking
  └─ Complete audit trail
```

---

## Data Flow Summary

```
User Form → Send OTP API → Validate → Generate OTP → Store Redis → Send Email
                                                                        ↓
User Email ← OTP Code (774524) ← Email Service ← SMTP Server ← Backend
                                                                        ↓
User Enters OTP → Verify API → Retrieve Redis → Check Expiry → Verify Match
                                                                        ↓
Success → Save DB → Send Admin Email → Send User Email → Delete OTP → Response
```

---

## Key Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SYSTEM COMPONENTS                            │
└─────────────────────────────────────────────────────────────────────┘

FRONTEND (React)
  └─ ContactPage.jsx
     ├─ Form submission
     ├─ OTP modal
     └─ Success/error handling

BACKEND (Node.js/Fastify)
  ├─ contactController.js
  │  ├─ sendOtp()
  │  └─ verifyOtp()
  ├─ emailService.js
  │  ├─ sendContactOtpEmail()
  │  └─ getContactOtpEmailTemplate()
  └─ contact.js (routes)
     ├─ POST /api/contact/send-otp
     └─ POST /api/contact/verify-otp

STORAGE
  ├─ Redis (OTP storage, rate limiting)
  └─ MySQL (contact_submissions table)

EMAIL
  └─ SMTP (GoDaddy)
     ├─ OTP email (to user)
     ├─ Admin notification (to admin)
     └─ User confirmation (to user)
```

---

**Created**: February 4, 2026  
**Status**: ✅ PRODUCTION READY  
**Version**: 1.0.0
