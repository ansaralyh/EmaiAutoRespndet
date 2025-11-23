#!/bin/bash

# Test script for webhook endpoint
# Usage: ./test-webhook.sh [scenario]
# Scenarios: yes_send, unsubscribe, not_interested, too_expensive, interested, duplicate

NGROK_URL="https://unmaddened-necole-expugnable.ngrok-free.dev"
WEBHOOK_URL="${NGROK_URL}/webhooks/reachinbox"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Testing webhook: ${WEBHOOK_URL}${NC}\n"

case "${1:-yes_send}" in
  "yes_send")
    echo -e "${GREEN}Test 1: YES_SEND (prospect says 'yes, send it')${NC}"
    curl -X POST "${WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d '{
        "event": "REPLY_RECEIVED",
        "message_id": "test-msg-yes-1",
        "thread_id": "test-thread-yes-1",
        "email_account": "emily@alphahire.com",
        "lead_email": "lead@example.com",
        "lead_name": "Alex Smith",
        "lead_company": "Acme Corp",
        "email_replied_body": "Yes, send it over."
      }'
    ;;
  
  "unsubscribe")
    echo -e "${GREEN}Test 2: UNSUBSCRIBE (prospect wants to unsubscribe)${NC}"
    curl -X POST "${WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d '{
        "event": "REPLY_RECEIVED",
        "message_id": "test-msg-unsub-1",
        "thread_id": "test-thread-unsub-1",
        "email_account": "emily@alphahire.com",
        "lead_email": "lead@example.com",
        "lead_name": "John Doe",
        "lead_company": "Test Corp",
        "email_replied_body": "Please unsubscribe me from your emails."
      }'
    ;;
  
  "not_interested")
    echo -e "${GREEN}Test 3: NOT_INTERESTED${NC}"
    curl -X POST "${WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d '{
        "event": "REPLY_RECEIVED",
        "message_id": "test-msg-not-1",
        "thread_id": "test-thread-not-1",
        "email_account": "emily@alphahire.com",
        "lead_email": "lead@example.com",
        "lead_name": "Jane Smith",
        "lead_company": "Example Inc",
        "email_replied_body": "Not interested, thanks."
      }'
    ;;
  
  "too_expensive")
    echo -e "${GREEN}Test 4: TOO_EXPENSIVE${NC}"
    curl -X POST "${WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d '{
        "event": "REPLY_RECEIVED",
        "message_id": "test-msg-expensive-1",
        "thread_id": "test-thread-expensive-1",
        "email_account": "emily@alphahire.com",
        "lead_email": "lead@example.com",
        "lead_name": "Bob Johnson",
        "lead_company": "Tech Corp",
        "email_replied_body": "This is too expensive for us."
      }'
    ;;
  
  "interested")
    echo -e "${GREEN}Test 5: INTERESTED (default case)${NC}"
    curl -X POST "${WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d '{
        "event": "REPLY_RECEIVED",
        "message_id": "test-msg-interested-1",
        "thread_id": "test-thread-interested-1",
        "email_account": "emily@alphahire.com",
        "lead_email": "lead@example.com",
        "lead_name": "Sarah Williams",
        "lead_company": "Startup Co",
        "email_replied_body": "This sounds interesting, tell me more."
      }'
    ;;
  
  "agreement")
    echo -e "${GREEN}Test 6: ASK_AGREEMENT${NC}"
    curl -X POST "${WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d '{
        "event": "REPLY_RECEIVED",
        "message_id": "test-msg-agreement-1",
        "thread_id": "test-thread-agreement-1",
        "email_account": "emily@alphahire.com",
        "lead_email": "lead@example.com",
        "lead_name": "Mike Davis",
        "lead_company": "Business Inc",
        "email_replied_body": "Can you send me the agreement?"
      }'
    ;;
  
  "duplicate")
    echo -e "${YELLOW}Test 7: DUPLICATE DETECTION (send same message_id twice)${NC}"
    echo "First request:"
    curl -X POST "${WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d '{
        "event": "REPLY_RECEIVED",
        "message_id": "test-msg-duplicate",
        "thread_id": "test-thread-duplicate",
        "email_account": "emily@alphahire.com",
        "lead_email": "lead@example.com",
        "lead_name": "Test User",
        "lead_company": "Test Corp",
        "email_replied_body": "Test message"
      }'
    echo -e "\n\nSecond request (should be rejected as duplicate):"
    curl -X POST "${WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d '{
        "event": "REPLY_RECEIVED",
        "message_id": "test-msg-duplicate",
        "thread_id": "test-thread-duplicate",
        "email_account": "emily@alphahire.com",
        "lead_email": "lead@example.com",
        "lead_name": "Test User",
        "lead_company": "Test Corp",
        "email_replied_body": "Test message"
      }'
    ;;
  
  "health")
    echo -e "${GREEN}Health Check${NC}"
    curl -X GET "${NGROK_URL}/health"
    ;;
  
  "all")
    echo -e "${BLUE}Running all tests...${NC}\n"
    ./test-webhook.sh yes_send
    echo -e "\n"
    sleep 1
    ./test-webhook.sh unsubscribe
    echo -e "\n"
    sleep 1
    ./test-webhook.sh not_interested
    echo -e "\n"
    sleep 1
    ./test-webhook.sh too_expensive
    echo -e "\n"
    sleep 1
    ./test-webhook.sh interested
    echo -e "\n"
    sleep 1
    ./test-webhook.sh agreement
    ;;
  
  *)
    echo "Usage: $0 [scenario]"
    echo ""
    echo "Available scenarios:"
    echo "  yes_send      - Test YES_SEND template"
    echo "  unsubscribe   - Test UNSUBSCRIBE template"
    echo "  not_interested - Test NOT_INTERESTED template"
    echo "  too_expensive - Test TOO_EXPENSIVE template"
    echo "  interested    - Test INTERESTED template (default)"
    echo "  agreement     - Test ASK_AGREEMENT template"
    echo "  duplicate     - Test duplicate detection"
    echo "  health        - Check server health"
    echo "  all           - Run all tests"
    ;;
esac

echo ""

