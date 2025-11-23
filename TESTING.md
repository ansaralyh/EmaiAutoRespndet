# Testing Without API Keys

You can test the autoresponder service **without real API keys** by using mock implementations.

## How to Enable Mock Mode

### Option 1: Environment Variable (Recommended)

Add this to your `.env` file:

```env
USE_MOCKS=true
```

### Option 2: Set NODE_ENV to test

```env
NODE_ENV=test
```

## What Mocks Do

When `USE_MOCKS=true`, the system uses fake implementations that:

- ✅ **Reachinbox API**: Returns fake thread data with sample messages
- ✅ **OpenAI API**: Classifies emails using simple keyword matching (no real API calls)
- ✅ **SignWell API**: Simulates sending agreements (just logs to console)
- ✅ **Slack API**: Logs alerts to console instead of sending to Slack

## Testing the Webhook

### 1. Start the Server

```bash
npm run dev
```

You should see:
```
🚀 Server running on port 3000
✅ Ready to receive webhooks at http://localhost:3000/webhooks/reachinbox
[MOCK] Mode enabled - using mock APIs
```

### 2. Test with curl

**Test "YES_SEND" template:**
```bash
curl -X POST http://localhost:3000/webhooks/reachinbox \
  -H "Content-Type: application/json" \
  -d '{
    "event": "REPLY_RECEIVED",
    "message_id": "test-msg-1",
    "thread_id": "test-thread-1",
    "email_account": "emily@alphahire.com",
    "lead_email": "lead@example.com",
    "lead_name": "Alex Smith",
    "lead_company": "Acme Corp"
  }'
```

**Test "UNSUBSCRIBE" template:**
```bash
curl -X POST http://localhost:3000/webhooks/reachinbox \
  -H "Content-Type: application/json" \
  -d '{
    "event": "REPLY_RECEIVED",
    "message_id": "test-msg-2",
    "thread_id": "test-thread-2",
    "email_account": "emily@alphahire.com",
    "lead_email": "lead@example.com",
    "lead_name": "John Doe",
    "lead_company": "Test Corp"
  }'
```

### 3. Check Console Output

You'll see logs like:
```
[MOCK] Fetching thread: test-thread-1
[MOCK] Classifying email: Yes, send it over...
[MOCK] Sending email: { thread_id: 'test-thread-1', ... }
[MOCK] Sending agreement: { clientEmail: 'lead@example.com', ... }
[MOCK] Slack Alert: Success message
```

## Mock Classification Rules

The mock classifier uses simple keyword matching:

- **"yes", "sure", "send"** → `YES_SEND`
- **"unsubscribe", "remove me", "stop"** → `UNSUBSCRIBE`
- **"not interested", "no thanks"** → `NOT_INTERESTED`
- **"agreement", "contract", "terms"** → `ASK_AGREEMENT`
- **"too expensive", "too high"** → `TOO_EXPENSIVE`
- **Default** → `INTERESTED`

## Testing Different Scenarios

### Test Duplicate Detection
Send the same `message_id` twice - second request should be rejected.

### Test Loop Limit
Send multiple messages with "wants_more_info" flag - should stop after 3 loops.

### Test Safeguards
Send messages that trigger unsubscribe/abuse flags - should stop automation.

## Switching to Real APIs

When you have real API keys:

1. Remove `USE_MOCKS=true` from `.env`
2. Add real API keys to `.env`
3. Restart the server

The system will automatically use real APIs instead of mocks.

