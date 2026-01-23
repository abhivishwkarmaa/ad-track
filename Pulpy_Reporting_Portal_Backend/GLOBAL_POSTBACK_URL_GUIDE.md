# 🌐 Global Postback URL Guide

## Overview

Global Postback URLs allow publishers to receive notifications whenever conversions occur on their offers, even when no assignment-specific postback URL is configured. This provides a fallback mechanism and ensures publishers always get notified of successful conversions.

## How It Works

### Postback Priority Order

1. **Assignment-Specific URL** (highest priority)
   - Configured per publisher-offer assignment
   - Takes precedence if available

2. **Global Postback URL** (fallback)
   - Configured on the publisher profile
   - Used when no assignment URL exists
   - Ensures publishers always receive notifications

### Enhanced Features

✅ **Dual Postback Support**: Send to both assignment AND global URLs when both exist
✅ **Comprehensive Logging**: All postback attempts logged to `affiliate_postback_logs` table
✅ **Success/Failure Tracking**: Metrics for postback delivery success rates
✅ **Macro Replacement**: Dynamic URL parameter substitution
✅ **Error Handling**: Graceful failure handling without affecting conversions

## Setting Up Global Postback URLs

### 1. Via Admin API

**Create Publisher with Global Postback URL:**

```bash
POST /api/admin/publishers
Content-Type: application/json
Authorization: Bearer <your-token>

{
  "email": "publisher@example.com",
  "first_name": "John",
  "company_name": "Media Corp",
  "country": "US",
  "password": "securepassword123",
  "global_postback_url": "https://publisher.com/postback?click_id={click_id}&conversion_id={conversion_id}&payout={payout}&status={status}"
}
```

**Update Existing Publisher:**

```bash
PUT /api/admin/publishers/{publisher_id}
Content-Type: application/json
Authorization: Bearer <your-token>

{
  "global_postback_url": "https://publisher.com/postback?click_id={click_id}&conversion_id={conversion_id}&payout={payout}&status={status}"
}
```

### 2. Via Admin Panel

Navigate to Publisher Management → Edit Publisher → Set "Global Postback URL" field.

## Available Macros

The following macros are automatically replaced in postback URLs:

| Macro | Description | Example Value |
|-------|-------------|---------------|
| `{click_id}` | Original click UUID | `abc123-def456` |
| `{conversion_id}` | Conversion UUID | `conv789-xyz000` |
| `{rcid}` | Revenue Center ID | `rc123` |
| `{amount}` | Conversion amount | `100.00` |
| `{payout}` | Publisher payout | `10.00` |
| `{status}` | Conversion status | `approved` |
| `{affiliate_click_id}` | Affiliate's click ID | `aff_click_123` |

## Example URLs

### Basic Postback
```
https://publisher.com/postback?click_id={click_id}&conversion_id={conversion_id}&amount={amount}&status={status}
```
**Becomes:**
```
https://publisher.com/postback?click_id=abc123-def456&conversion_id=conv789-xyz000&amount=100.00&status=approved
```

### Advanced with Custom Parameters
```
https://api.publisher.com/v2/conversions?aff_click_id={affiliate_click_id}&revenue={amount}&commission={payout}&conversion_status={status}
```

## Monitoring & Analytics

### Postback Metrics

Access postback success/failure metrics:

```bash
GET /metrics/postback
```

Response:
```json
{
  "processed": 1500,
  "redis_hits": 1200,
  "redis_misses": 300,
  "duplicates": 15,
  "postback_success": 1450,
  "postback_failure": 50,
  "hit_rate": "80.00%",
  "error_rate": "3.33%"
}
```

### Postback Logs

View detailed postback attempt logs:

```bash
GET /api/admin/postback-logs?publisher_id={publisher_id}
```

Response includes:
- Fired URL (with macros replaced)
- HTTP status code
- Response body (truncated)
- Execution time
- Success/failure status
- Error messages (if any)

## Best Practices

### 1. URL Validation
- Always include protocol (`https://`)
- Test URLs before deploying
- Use URL encoding for special characters

### 2. Macro Usage
- Use `{click_id}` for primary tracking
- Include `{status}` to filter approved conversions
- Add `{conversion_id}` for deduplication

### 3. Error Handling
- Postback failures don't affect conversions
- Monitor failure rates via metrics endpoint
- Check logs for detailed error information

### 4. Security
- Use HTTPS URLs only
- Validate incoming postback data
- Implement proper authentication if needed

## Troubleshooting

### Postbacks Not Sending

1. **Check Global URL Configuration:**
   ```sql
   SELECT global_postback_url FROM publishers WHERE id = {publisher_id};
   ```

2. **Verify Assignment Override:**
   ```sql
   SELECT callback_url FROM assignments WHERE publisher_id = {publisher_id} AND offer_id = {offer_id};
   ```

3. **Check Worker Logs:**
   ```bash
   pm2 logs postback-worker
   ```

### Common Issues

**Issue:** Macros not replaced
**Solution:** Ensure correct macro syntax with curly braces `{macro_name}`

**Issue:** URLs timing out
**Solution:** Postback requests have 5-second timeout. Optimize receiving endpoints.

**Issue:** Duplicate postbacks
**Solution:** Use `{conversion_id}` for deduplication on receiving end.

## Advanced Configuration

### Custom Macros

For custom macro requirements, modify the `replaceMacros` method in `postback-worker.js`:

```javascript
const url = replaceMacros(callbackUrl, {
  click_id: conversion.click_uuid,
  custom_field: conversion.custom_data,
  // Add your custom macros here
});
```

### Conditional Postbacks

To send postbacks only for certain conditions:

```javascript
// In postback-worker.js sendPublisherPostbackIfNeeded method
if (conversionData.status === 'approved' && conversionData.amount > 0) {
  // Send postback
}
```

### Rate Limiting

Postbacks are sent immediately upon conversion processing. For high-volume scenarios, consider queuing postbacks or implementing rate limiting on the receiving end.

## Migration Guide

If upgrading from assignment-only postbacks:

1. **Audit Existing Assignments:** Check which assignments lack callback URLs
2. **Configure Global URLs:** Set global_postback_url on publishers
3. **Test Postbacks:** Use the test script to verify functionality
4. **Monitor Metrics:** Watch postback success rates during rollout

## API Reference

### Publisher Endpoints

- `POST /api/admin/publishers` - Create publisher with global_postback_url
- `PUT /api/admin/publishers/{id}` - Update publisher global_postback_url
- `GET /api/admin/publishers` - List publishers with global URLs
- `GET /api/admin/publishers/{id}` - Get publisher details including global URL

### Monitoring Endpoints

- `GET /metrics/postback` - Postback success/failure metrics
- `GET /api/admin/postback-logs` - Detailed postback attempt logs

---

**Result:** Publishers now receive reliable conversion notifications via global postback URLs, with comprehensive tracking and monitoring capabilities! 🎯