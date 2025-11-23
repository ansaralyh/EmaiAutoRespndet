# Postman Test Collection for Automation Fixes

## Setup Instructions

1. **Start your server** (if not already running):
   ```bash
   npm start
   ```

2. **Get your server URL**:
   - Local: `http://localhost:3000` (or your configured port)
   - If using ngrok: Use your ngrok URL

3. **Postman Configuration**:
   - Method: `POST`
   - URL: `http://localhost:3000/webhooks/reachinbox` (or your server URL)
   - Headers: `Content-Type: application/json`
   - Body: Select `raw` → `JSON`

---

## Test Cases

### Test 1: Duplicate Template Detection (Issue 1 Fix)
**Purpose:** Test that same template_id is not sent twice

**First Request:**
```json
{
  "event": "REPLY_RECEIVED",
  "message_id": "test-dup-msg-1",
  "original_message_id": "test-dup-thread-1",
  "email_account": "sophia@alphahire.me",
  "lead_email": "dzellers@rays.com",
  "lead_first_name": "David",
  "lead_last_name": "Zellers",
  "email_replied_body": "Yes, please send the agreement.",
  "email_subject": "Re: Recruitment Services"
}
```

**Second Request (Same thread, different message_id, but same content):**
```json
{
  "event": "REPLY_RECEIVED",
  "message_id": "test-dup-msg-2",
  "original_message_id": "test-dup-thread-1",
  "email_account": "sophia@alphahire.me",
  "lead_email": "dzellers@rays.com",
  "lead_first_name": "David",
  "lead_last_name": "Zellers",
  "email_replied_body": "Yes, please send the agreement.",
  "email_subject": "Re: Recruitment Services"
}
```

**Expected Result:** 
- First request: ✅ Sends reply successfully
- Second request: ⚠️ Flags for manual review (duplicate template_id detected), does NOT send

---

### Test 2: Out of Business Detection (Issue 2 Fix)
**Purpose:** Test that "out of business" messages don't ask for agreement

**Request:**
```json
{
  "event": "REPLY_RECEIVED",
  "message_id": "test-out-of-business-1",
  "original_message_id": "test-out-of-business-thread-1",
  "email_account": "sophia@alphahire.me",
  "lead_email": "ndaniels@tryalphahire.info",
  "lead_first_name": "Noah",
  "lead_last_name": "Daniels",
  "email_replied_body": "We are no longer in business, so we won't be needing your services.",
  "email_subject": "Re: Recruitment Services"
}
```

**Expected Result:** 
- Classifies as `NOT_INTERESTED` with `unsubscribe: true`
- Sends acknowledgment WITHOUT asking for agreement
- Response should NOT contain "Would you like me to send the agreement"

---

### Test 3: Contact Info Already Provided (Issue 3 & 4 Fix)
**Purpose:** Test that when contact info is provided, we don't ask again

**Request:**
```json
{
  "event": "REPLY_RECEIVED",
  "message_id": "test-contact-provided-1",
  "original_message_id": "test-contact-thread-1",
  "email_account": "sophia@alphahire.me",
  "lead_email": "jstomieroski@jimnnicks.com",
  "lead_first_name": "John",
  "lead_last_name": "Stomieroski",
  "email_replied_body": "I'm not the right person to contact. Please reach out to Sarah Johnson at sarah.johnson@jimnnicks.com instead.",
  "email_subject": "Re: Recruitment Services"
}
```

**Expected Result:**
- Classifies as `NOT_HIRING_CONTACT` with `contact_info_provided: true`
- Sends acknowledgment mentioning the contact info
- Response should NOT contain "Would you mind connecting me with the correct hiring contact?"

---

### Test 4: Contact Info NOT Provided (Normal Flow)
**Purpose:** Test normal flow when contact info is NOT provided

**Request:**
```json
{
  "event": "REPLY_RECEIVED",
  "message_id": "test-no-contact-1",
  "original_message_id": "test-no-contact-thread-1",
  "email_account": "sophia@alphahire.me",
  "lead_email": "test@example.com",
  "lead_first_name": "Test",
  "lead_last_name": "User",
  "email_replied_body": "I'm not the hiring manager, you should contact someone else.",
  "email_subject": "Re: Recruitment Services"
}
```

**Expected Result:**
- Classifies as `NOT_HIRING_CONTACT` with `contact_info_provided: false`
- Sends normal response asking for contact info
- Response SHOULD contain "Would you mind connecting me with the correct hiring contact?"

---

### Test 5: Normal YES_SEND Flow
**Purpose:** Test normal positive response

**Request:**
```json
{
  "event": "REPLY_RECEIVED",
  "message_id": "test-yes-send-1",
  "original_message_id": "test-yes-thread-1",
  "email_account": "sophia@alphahire.me",
  "lead_email": "test@example.com",
  "lead_first_name": "Test",
  "lead_last_name": "User",
  "email_replied_body": "Yes, please send the agreement.",
  "email_subject": "Re: Recruitment Services"
}
```

**Expected Result:**
- Classifies as `YES_SEND`
- Sends reply successfully
- Automatically sends agreement via SignWell

---

### Test 6: INTERESTED Template Bug Fix
**Purpose:** Test that INTERESTED template asks correctly about role vs role+location

**Request:**
```json
{
  "event": "REPLY_RECEIVED",
  "message_id": "test-interested-1",
  "original_message_id": "test-interested-thread-1",
  "email_account": "sophia@alphahire.me",
  "lead_email": "test@example.com",
  "lead_first_name": "Test",
  "lead_last_name": "User",
  "email_replied_body": "I'm interested in learning more about your services.",
  "email_subject": "Re: Recruitment Services"
}
```

**Expected Result:**
- Classifies as `INTERESTED`
- Response should ask: "is this for the {role} position or the {role + location} position?"
- Should NOT repeat the same role twice

---

## Quick Test Checklist

- [ ] Test 1: Duplicate detection prevents sending same template twice
- [ ] Test 2: Out of business doesn't ask for agreement
- [ ] Test 3: Contact info provided → acknowledgment (no asking again)
- [ ] Test 4: Contact info NOT provided → asks for contact
- [ ] Test 5: Normal YES_SEND flow works
- [ ] Test 6: INTERESTED template asks correctly

---

## Notes

- Make sure your server is running before testing
- Each test should use unique `message_id` values (except Test 1 second request)
- Check Slack alerts channel for manual review flags
- Check server console logs for processing details

