# Error Diagnostic Document - Reachinbox Email Sending Failure

## Error Summary

**Error Type:** 500 Internal Server Error from Reachinbox API  
**Error Message:** `"Something went wrong! 🤦"`  
**Location:** `api/reachinbox.ts:195` - `sendEmail()` function  
**Timestamp:** 2025-11-20T21:32:33.728Z

---

## Error Details

### Error Response from Reachinbox API
```json
{
  "status": 500,
  "message": "Something went wrong! 🤦"
}
```

### Server Console Logs
```
2025-11-20T21:32:29.391Z - POST /webhooks/reachinbox
Processing webhook: message_id=<CALJdVSsjCXGoOZZ7GhA7KqRiTmsMz6wewPdKSzbhpKxfsHfp+Q@mail.gmail.com>, thread_id=<440b5faa-2737-d75d-86da-c23dd30a131d@alphahire.me>
Using email_replied_body from webhook (length: 15)
Failed to send reply: Error: Reachinbox send error: 500 - Internal Server Error ({"status":500,"message":"Something went wrong! 🤦 "})
    at sendEmail (C:\Users\JMS\Desktop\alphahire-autoresponder\api\reachinbox.ts:195:13)
    at processTicksAndRejections (node:internal/task_queues:103:5)
    at async handleReachinboxWebhook (C:\Users\JMS\Desktop\alphahire-autoresponder\handlers\webhookHandler.ts:241:7)
```

### Slack Alert Details
```json
{
  "event": "error",
  "thread_id": "<440b5faa-2737-d75d-86da-c23dd30a131d@alphahire.me>",
  "message_id": "<CALJdVSsjCXGoOZZ7GhA7KqRiTmsMz6wewPdKSzbhpKxfsHfp+Q@mail.gmail.com>",
  "template_id": "INTERESTED",
  "error": "Reachinbox send error: 500 - Internal Server Error ({\"status\":500,\"message\":\"Something went wrong! 🤦 \"})"
}
```

---

## Test Request Payload

### Postman Request
**Method:** POST  
**URL:** `https://a33f724a5cc2.ngrok-free.app/webhooks/reachinbox`

**Request Body:**
```json
{
  "event": "REPLY_RECEIVED",
  "message_id": "<CALJdVSsjCXGoOZZ7GhA7KqRiTmsMz6wewPdKSzbhpKxfsHfp+Q@mail.gmail.com>",
  "thread_id": "<440b5faa-2737-d75d-86da-c23dd30a131d@alphahire.me>",
  "email_account": "sophia@alphahire.me",
  "lead_email": "raeessajidali10@gmail.com",
  "lead_name": "Raees Sajid ali",
  "lead_company": "Test Company",
  "email_replied_body": "i am interested"
}
```

---

## Relevant Code Sections

### 1. sendEmail() Function - api/reachinbox.ts (Lines 158-201)

```typescript
export async function sendEmail(emailData: SendEmailRequest): Promise<any> {
  try {
    // Convert body to HTML if it's plain text
    const htmlBody = emailData.body.includes('<') 
      ? emailData.body 
      : `<p>${emailData.body.replace(/\n/g, '</p><p>')}</p>`;

    // Prepare emaildata JSON object according to API spec
    const emaildata = {
      to: Array.isArray(emailData.to) ? emailData.to : [emailData.to],
      from: emailData.from,
      subject: emailData.subject,
      body: htmlBody,
      cc: emailData.cc || [],
      bcc: emailData.bcc || [],
      references: emailData.references || [],
      inReplyTo: emailData.inReplyTo || null,
      originalMessageId: emailData.originalMessageId || null,
    };

    // Create FormData for multipart/form-data request
    const formData = new FormData();
    formData.append('emaildata', JSON.stringify(emaildata));

    // Make the request with multipart/form-data
    const response = await reachinboxClient.post('/api/v1/onebox/send', formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    return response.data;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const errorData = error.response?.data;
      throw new Error(
        `Reachinbox send error: ${status} - ${statusText || error.message}${errorData ? ` (${JSON.stringify(errorData)})` : ''}`
      );
    }
    throw error;
  }
}
```

### 2. Webhook Handler - handlers/webhookHandler.ts (Lines 207-262)

```typescript
// 9. Send Reply via Reachinbox
try {
  // Build threading information if we have latestMessage
  let inReplyTo: string | undefined;
  let references: string[] = [];
  let originalMessageId: string | undefined;

  if (latestMessage) {
    inReplyTo = latestMessage.messageId || latestMessage.id;
    originalMessageId = latestMessage.originalMessageId || latestMessage.messageId || latestMessage.id;
    // Build references array from message
    if (latestMessage.references) {
      // references might be a string or array
      references = Array.isArray(latestMessage.references) 
        ? latestMessage.references 
        : typeof latestMessage.references === 'string' 
          ? [latestMessage.references] 
          : [];
    }
    // Add originalMessageId to references if not already there
    if (originalMessageId && !references.includes(originalMessageId)) {
      references.push(originalMessageId);
    }
  } else if (message_id) {
    // Fallback: use message_id as inReplyTo if we don't have thread data
    inReplyTo = message_id;
    originalMessageId = message_id;
    references = [message_id];
  }

  if (!email_account) {
    throw new Error('email_account is required to send email');
  }

  await sendEmail({
    from: email_account, // Required: sender's email address
    to: lead_email || threadFrom || '',
    subject: threadSubject.startsWith('Re:') ? threadSubject : `Re: ${threadSubject}`,
    body: replyText,
    inReplyTo: inReplyTo,
    references: references,
    originalMessageId: originalMessageId,
  });
  console.log(`Reply sent successfully: template_id=${template_id}, thread_id=${thread_id}`);
} catch (error: any) {
  console.error('Failed to send reply:', error);
  await sendErrorAlert('Failed to send reply via Reachinbox', {
    event: 'error',
    thread_id,
    message_id,
    template_id,
    error: error.message,
  });
  res.status(500).json({ error: 'Failed to send reply' });
  return;
}
```

### 3. Interface Definitions - api/reachinbox.ts (Lines 50-61)

```typescript
export interface SendEmailRequest {
  from: string; // Required: sender's email address (must be a connected account)
  to: string | string[]; // Recipient email(s) - can be string or array
  subject: string;
  body: string; // HTML body content
  cc?: string[]; // Optional CC recipients
  bcc?: string[]; // Optional BCC recipients
  references?: string[]; // Array of message IDs in thread
  inReplyTo?: string; // Message ID being replied to
  originalMessageId?: string; // First message ID in thread
  thread_id?: string; // For backward compatibility
}
```

---

## Actual Payload Being Sent to Reachinbox API

Based on the code flow, here's what is likely being sent:

### Expected emaildata JSON (before stringification):
```json
{
  "to": ["raeessajidali10@gmail.com"],
  "from": "sophia@alphahire.me",
  "subject": "Re: Testing Flow",
  "body": "<p>Great — happy to get those over to you.</p><p>Just so you have everything upfront: we work at a flat 10% of first-year base salary with a 6-month replacement guarantee.</p><p>Before I send the agreement, is this for the this role position or the this role position?</p>",
  "cc": [],
  "bcc": [],
  "references": ["<CALJdVSsjCXGoOZZ7GhA7KqRiTmsMz6wewPdKSzbhpKxfsHfp+Q@mail.gmail.com>"],
  "inReplyTo": "<CALJdVSsjCXGoOZZ7GhA7KqRiTmsMz6wewPdKSzbhpKxfsHfp+Q@mail.gmail.com>",
  "originalMessageId": "<CALJdVSsjCXGoOZZ7GhA7KqRiTmsMz6wewPdKSzbhpKxfsHfp+Q@mail.gmail.com>"
}
```

### HTTP Request Details:
- **Method:** POST
- **URL:** `{baseUrl}/api/v1/onebox/send`
- **Content-Type:** `multipart/form-data`
- **Authorization:** `Bearer {apiKey}`
- **Form Field:** `emaildata` (JSON string)

---

## API Documentation Reference

### Reachinbox Send Email API Specification

**Endpoint:** `POST /api/v1/onebox/send`  
**Content-Type:** `multipart/form-data`

**Required Fields in emaildata:**
- `to`: `array[string]` - Array of recipient email addresses
- `from`: `string` - Sender's email address (must be a connected account)
- `subject`: `string` - Subject line
- `body`: `string` - HTML body content

**Optional Fields:**
- `cc`: `array[string]` - CC recipients
- `bcc`: `array[string]` - BCC recipients
- `references`: `array[string]` - Array of message IDs in thread
- `inReplyTo`: `string` - Message ID being replied to
- `originalMessageId`: `string` - First message ID in thread

**Example from Documentation:**
```json
{
  "to": ["jane.smith@example.com"],
  "from": "john.doe@example.com",
  "subject": "Re: Project Update",
  "body": "<p>Hi Jane,</p><p>Following up with the latest details.</p>",
  "cc": [],
  "bcc": [],
  "references": ["<original-message-id-a@example.com>", "<prev-reply-id@example.com>"],
  "inReplyTo": "<prev-reply-id@example.com>",
  "originalMessageId": "<original-message-id-a@example.com>"
}
```

---

## Potential Issues Identified

### Issue 1: Null Values for Optional Fields
**Location:** `api/reachinbox.ts:174-175`
```typescript
inReplyTo: emailData.inReplyTo || null,
originalMessageId: emailData.originalMessageId || null,
```
**Problem:** Sending `null` values may not be accepted by the API. The documentation shows these as optional strings, but doesn't specify if `null` is valid or if fields should be omitted entirely.

**Potential Fix:** Omit fields when undefined instead of sending `null`:
```typescript
const emaildata: any = {
  to: Array.isArray(emailData.to) ? emailData.to : [emailData.to],
  from: emailData.from,
  subject: emailData.subject,
  body: htmlBody,
  cc: emailData.cc || [],
  bcc: emailData.bcc || [],
  references: emailData.references || [],
};
if (emailData.inReplyTo) emaildata.inReplyTo = emailData.inReplyTo;
if (emailData.originalMessageId) emaildata.originalMessageId = emailData.originalMessageId;
```

### Issue 2: Empty Arrays for Optional Fields
**Location:** `api/reachinbox.ts:171-173`
```typescript
cc: emailData.cc || [],
bcc: emailData.bcc || [],
references: emailData.references || [],
```
**Problem:** Sending empty arrays `[]` may cause issues. The API might prefer these fields to be omitted when empty.

**Potential Fix:** Only include fields if they have values:
```typescript
const emaildata: any = {
  to: Array.isArray(emailData.to) ? emailData.to : [emailData.to],
  from: emailData.from,
  subject: emailData.subject,
  body: htmlBody,
};
if (emailData.cc && emailData.cc.length > 0) emaildata.cc = emailData.cc;
if (emailData.bcc && emailData.bcc.length > 0) emaildata.bcc = emailData.bcc;
if (emailData.references && emailData.references.length > 0) emaildata.references = emailData.references;
```

### Issue 3: Empty String for `to` Field
**Location:** `handlers/webhookHandler.ts:243`
```typescript
to: lead_email || threadFrom || '',
```
**Problem:** If both `lead_email` and `threadFrom` are empty, this sends `to: ['']` which is invalid.

**Potential Fix:** Validate `to` field before sending:
```typescript
const toEmail = lead_email || threadFrom;
if (!toEmail || !toEmail.trim()) {
  throw new Error('Recipient email address is required');
}
await sendEmail({
  from: email_account,
  to: toEmail,
  // ...
});
```

### Issue 4: References Array Format
**Location:** `handlers/webhookHandler.ts:218-225`
**Problem:** The API response shows `references` as an array with a single string containing space-separated message IDs:
```json
"references": ["<id1> <id2> <id3>"]
```
The code treats this as an array, but may need to split the string if it contains multiple IDs.

### Issue 5: Missing Thread Data
**Location:** `handlers/webhookHandler.ts:214-235`
**Problem:** When `email_replied_body` is provided, the code doesn't fetch thread data, so `latestMessage` is null. It falls back to using `message_id` directly, which may not be the correct format for threading fields.

**Current Behavior:**
- If `email_replied_body` exists → doesn't fetch thread → `latestMessage` is null
- Falls back to: `inReplyTo = message_id`, `originalMessageId = message_id`, `references = [message_id]`

**Issue:** This may not properly thread the email in the conversation.

---

## Thread Data Structure (from API Response)

From the actual thread data provided:
```json
{
  "account": "sophia@alphahire.me",
  "id": "<CALJdVSsjCXGoOZZ7GhA7KqRiTmsMz6wewPdKSzbhpKxfsHfp+Q@mail.gmail.com>",
  "messageId": "<CALJdVSsjCXGoOZZ7GhA7KqRiTmsMz6wewPdKSzbhpKxfsHfp+Q@mail.gmail.com>",
  "inReplyTo": "<CALJdVSvZiRUSFDaUA+nXMpju65=+N1vVEj0Y96ep57QW2bQS-A@mail.gmail.com>",
  "references": [
    "<440b5faa-2737-d75d-86da-c23dd30a131d@alphahire.me> <CALJdVSt=t4iVbPpXp5JKKFB+O9m3MmAMtLAKyf3qEyt4F1xrrA@mail.gmail.com> <CALJdVSu0y_9MEvBYjnnwOis=PKv+V8pseqkbDR_KW7LKoMFX6A@mail.gmail.com> <CALJdVSvZiRUSFDaUA+nXMpju65=+N1vVEj0Y96ep57QW2bQS-A@mail.gmail.com>"
  ],
  "originalMessageId": "<440b5faa-2737-d75d-86da-c23dd30a131d@alphahire.me>"
}
```

**Key Observations:**
- `references` is an array with ONE string containing space-separated message IDs
- `inReplyTo` points to the previous message in the thread
- `originalMessageId` is the first message in the thread

---

## Recommended Debugging Steps

1. **Add Logging Before API Call:**
   ```typescript
   console.log('Sending email with data:', JSON.stringify(emaildata, null, 2));
   console.log('FormData emaildata field:', JSON.stringify(emaildata));
   ```

2. **Check Actual Request:**
   - Use a network proxy (like Charles Proxy or Fiddler) to capture the exact HTTP request
   - Verify the multipart/form-data encoding
   - Check if the JSON string is properly escaped

3. **Test with Minimal Payload:**
   Try sending with only required fields:
   ```json
   {
     "to": ["raeessajidali10@gmail.com"],
     "from": "sophia@alphahire.me",
     "subject": "Test",
     "body": "<p>Test message</p>"
   }
   ```

4. **Verify Account Connection:**
   - Confirm `sophia@alphahire.me` is properly connected in Reachinbox
   - Check if the account has permission to send emails

5. **Check API Base URL:**
   - Verify `REACHINBOX_BASE_URL` is set to `https://api.reachinbox.ai`
   - Confirm API key is valid and has proper permissions

---

## Environment Configuration

Required environment variables (from `config/env.ts`):
- `REACHINBOX_API_KEY` - Bearer token for API authentication
- `REACHINBOX_BASE_URL` - Should be `https://api.reachinbox.ai`
- `OPENAI_API_KEY` - For email classification
- `SLACK_WEBHOOK_URL` - For error alerts
- `ESIGN_API_KEY` - For e-signature agreements
- `ESIGN_TEMPLATE_ID` - SignWell template ID
- `ESIGN_SENDER_EMAIL` - Sender email for agreements

---

## Additional Context

### Successful Flow (Before Error):
1. ✅ Webhook received and validated
2. ✅ Email body extracted from `email_replied_body`
3. ✅ Email classified by OpenAI as `INTERESTED`
4. ✅ Reply script generated successfully
5. ❌ Failed at sending email via Reachinbox API

### Classification Result:
- **Template ID:** `INTERESTED`
- **Variables:** `{ role: 'this role', location: '' }`
- **Flags:** All false (no unsubscribe, abuse, bounce, etc.)

---

## Next Steps for Diagnosis

1. Add detailed logging to capture the exact payload being sent
2. Test with minimal required fields only
3. Verify account connection status in Reachinbox
4. Check if the issue is specific to certain field combinations
5. Contact Reachinbox support with this error and payload details

