# Root Cause Analysis - Autoresponder Issues

## Critical Issue: **NO AGREEMENTS BEING SENT**

### Root Cause:
The confidence system is **TOO RESTRICTIVE** and blocking almost all auto-responses:

1. **Confidence Threshold Too High (0.90)**
   - Current threshold: `0.90` (90%)
   - Most classifications score below this threshold
   - Result: Almost everything goes to manual review (confidence 0.00)

2. **Template Whitelist Too Narrow**
   - `AUTO_INTENT_WHITELIST` only includes: `YES_SEND`, `ASK_AGREEMENT`, `ASK_FEES_ONLY`, `INTERESTED`, `NOT_INTERESTED`
   - Many valid templates are NOT whitelisted (e.g., `ROLE_CONFIRMED_FOLLOWUP`, `NO_JOB_POST`)
   - Result: Even if classified correctly, blocked by "templateNotAutoEligible"

3. **Base Scores Too Low**
   - `YES_SEND: 0.55`, `ASK_AGREEMENT: 0.60`, `INTERESTED: 0.45`
   - Even with positive signals, scores struggle to reach 0.90
   - Result: Most responses blocked

4. **Over-Penalization**
   - `has_question: -0.35`, `multi_topic: -0.25`, `wants_resume_first: -0.6`
   - Any question mark drops score significantly
   - Result: Legitimate requests blocked

5. **User Requirement Not Implemented**
   - User said: **"whenever lead asks for kind of agreement just send it to him"**
   - Current: System requires very high confidence even for explicit agreement requests
   - Result: Leads asking for agreements don't get them

---

## Issue #2: **"Position, position" Bug**

### Root Cause:
Template text generation still has bugs in role/position handling:
- Likely in `NO_JOB_POST` or `INTERESTED` templates
- String concatenation issues when role text already contains "position"
- Need to check: `config/scripts.ts` lines 89-424

---

## Issue #3: **"The role and similar positions"**

### Root Cause:
Template still uses this phrase instead of explicit role lists:
- `NO_JOB_POST` template may still have this text
- Should use bullet points with explicit roles instead

---

## Issue #4: **Out of Office Detection Failing**

### Root Cause:
1. **Regex Not Comprehensive**
   - Current regex: `/(out of office|automatic reply|auto-?reply|vacation|away from the office)/i`
   - Missing patterns: "I'm out", "currently away", "will return", etc.
   - Result: OOO messages classified as other templates

2. **OpenAI Classification Not Prioritizing OOO**
   - Even with CRITICAL priority in prompt, OpenAI may misclassify
   - Need stronger fallback detection

---

## Issue #5: **Manual Reply Detection Failing**

### Root Cause:
1. **Bot Marker Detection Logic**
   - Checks for `<!-- X-Autobot: alphahire-v1 -->` in outbound messages
   - May not be checking all outbound messages correctly
   - Date filter (`BOT_MARKER_FEATURE_DATE`) might be excluding valid checks

2. **Manual Owner Flag Not Set**
   - When human replies detected, `markAsManualOwner()` should be called
   - May not be triggering correctly

---

## Issue #6: **Agreement Sent When It Shouldn't Be**

### Root Causes:
1. **Confidence System Not Blocking Properly**
   - Lines 290-293 in `confidence.ts` add blocking reasons but don't prevent agreement send
   - Agreement send happens at line 585-707 in `webhookHandler.ts`
   - The blocking reasons are checked, but if confidence passes, agreement still sends

2. **Signals Not Detected**
   - `wants_resume_first`, `wants_call_first`, `already_signed` signals may not be detected
   - Regex patterns may be too narrow

3. **"All Set" Not Blocking Agreement**
   - `DONE_ALL_SET` is a hard stop (no reply), but if misclassified, agreement might send

4. **Blank Replies Getting Agreements**
   - `AUTO_REPLY_BLANK` should be hard stop, but if misclassified, agreement might send

---

## Issue #7: **Agreement Sent Multiple Times**

### Root Cause:
1. **Check Happens After Classification**
   - `isAgreementSent()` check at line 587 happens AFTER confidence decision
   - If confidence system allows it, agreement might send even if already sent

2. **Race Condition**
   - Multiple webhooks for same thread might process simultaneously
   - `markAgreementSent()` might not be called before second request processes

3. **Follow-up Emails Triggering New Agreements**
   - When follow-up email is sent after agreement, if lead replies, system might send another agreement
   - Need to check if follow-up email replies are being handled correctly

---

## Issue #8: **Not Stopping After Agreement Sent**

### Root Cause:
1. **Hard Stop Check Location**
   - Hard stop at line 252 in `confidence.ts` should work
   - BUT: If `agreementSent` flag is not set correctly, hard stop won't trigger
   - Need to verify `markAgreementSent()` is being called correctly

2. **State Not Persisting**
   - `agreementSent` is in-memory Map
   - If server restarts, state is lost
   - Result: After restart, system might respond again

---

## Issue #9: **Wrong Person - Same Email as Sender**

### Root Cause:
1. **Validation Logic**
   - Lines 419-453 in `webhookHandler.ts` check for same email
   - BUT: This check happens AFTER confidence decision
   - If confidence system allows it, wrong template might be used

2. **OpenAI Extracting Wrong Contact**
   - OpenAI might extract sender's own email as "new contact"
   - Need stronger validation in OpenAI prompt

---

## Issue #10: **Incorrect Template Selection**

### Root Causes:
1. **OpenAI Misclassification**
   - Many cases show wrong templates being selected
   - Need to review OpenAI prompt and examples

2. **Confidence System Not Catching Errors**
   - Even wrong classifications might pass confidence threshold
   - Need stricter template-specific rules

---

## Issue #11: **Leads Asking Questions Not Getting Answers**

### Root Cause:
1. **Questions Blocking Auto-Response**
   - `has_question: -0.35` penalty
   - `INTERESTED` template blocked if `has_question` (line 347)
   - Result: Questions trigger manual review instead of answers

2. **Templates Not Designed for Q&A**
   - Many templates don't handle questions well
   - Need question-answering templates

---

## Issue #12: **"Stop" / "No" in Subject Not Respected**

### Root Cause:
1. **Subject Line Not Checked**
   - System only checks email body text
   - Subject line with "stop" or "no" is ignored
   - Need to check subject line for unsubscribe/stop signals

---

## Issue #13: **Agreement Sent to Wrong Recipient**

### Root Cause:
1. **Active Contact Tracking**
   - Uses `getLastFrom()` for recipient (line 611)
   - If email is forwarded, `lastFrom` might be wrong
   - Need better logic to determine correct recipient

---

## Issue #14: **"Already Signed" Not Detected**

### Root Cause:
1. **Signal Not Detected**
   - `already_signed` signal not in Signal type or regex patterns
   - Need to add detection for "already signed", "signed it", "completed", etc.

---

## Summary of Critical Fixes Needed:

1. **LOWER CONFIDENCE THRESHOLD** - From 0.90 to 0.70 or 0.75
2. **EXPAND AUTO_INTENT_WHITELIST** - Add more templates that should auto-respond
3. **INCREASE BASE SCORES** - Make it easier to reach threshold
4. **REDUCE QUESTION PENALTY** - Don't block everything with questions
5. **FIX TEMPLATE TEXT BUGS** - "position position", "the role and similar positions"
6. **STRENGTHEN OOO DETECTION** - Better regex + fallback
7. **FIX MANUAL REPLY DETECTION** - Ensure bot markers work correctly
8. **ADD SUBJECT LINE CHECKING** - Check for "stop", "no", unsubscribe in subject
9. **ADD "ALREADY_SIGNED" SIGNAL** - Detect when lead already signed
10. **FIX AGREEMENT SEND LOGIC** - Ensure checks happen BEFORE sending, not after
11. **ENSURE AGREEMENT SENT FLAG SET IMMEDIATELY** - Before any other processing
12. **BETTER RECIPIENT DETECTION** - Handle forwarded emails correctly

---

## Priority Order:

**P0 (Critical - Blocking All Agreements):**
1. Lower confidence threshold
2. Expand whitelist
3. Increase base scores
4. Reduce question penalty

**P1 (High - Causing Bad Replies):**
5. Fix template text bugs
6. Strengthen OOO detection
7. Fix manual reply detection
8. Add subject line checking

**P2 (Medium - Quality Issues):**
9. Add "already_signed" signal
10. Fix agreement send logic
11. Better recipient detection
