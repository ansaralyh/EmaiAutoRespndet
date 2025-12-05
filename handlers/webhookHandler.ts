/**
 * Webhook handler for Reachinbox REPLY_RECEIVED events
 * Main business logic for email classification and auto-reply
 */

import { Request, Response } from 'express';
import { incrementLoop, isProcessed, markProcessed, getLastTemplateId, setLastTemplateId, getLoopCount, isUnsubscribed, markAsUnsubscribed, getAutoRepliesSent, incrementAutoRepliesSent, isAgreementSent, markAgreementSent, isManualOwner, markAsManualOwner, getLockedRoles, addLockedRole, setLockedRoles, getLastFrom, setLastFrom } from '../state/threadState';
import { fetchThread, getLatestMessage, getMessageText, sendEmail } from '../api/reachinbox';
import { classifyEmail, EmailMeta } from '../api/openai';
import { sendAgreement } from '../api/esign';
import { sendAlert } from '../api/slack';
import { getScript, requiresESignature, AUTO_SEND_TEMPLATES, getFollowUpEmailText } from '../config/scripts';

/**
 * Whitelist of template_ids allowed after first auto-reply
 * After 1 auto-reply, only allow automation again if the next classification is clearly one of:
 * - YES_SEND: They want the agreement
 * - ASK_AGREEMENT: They explicitly ask for agreement
 * - NOT_HIRING: They say they're not hiring (hard stop - no reply)
 * - NOT_INTERESTED_GENERAL: They're not interested (hard stop - no reply)
 * - UNSUBSCRIBE: They want to unsubscribe (hard stop - no reply)
 * - DONE_ALL_SET: They say "we're all set" (hard stop - no reply)
 * Everything else → manual review + no further email
 */
const ALLOWED_AFTER_FIRST_REPLY = new Set<string>([
  'YES_SEND',
  'ASK_AGREEMENT',
  'NOT_HIRING',
  'NOT_INTERESTED_GENERAL',
  'UNSUBSCRIBE',
  'DONE_ALL_SET',
]);

/**
 * Date when bot marker feature was deployed
 * Only check for manual replies in messages sent after this date
 * Messages before this date don't have bot markers, so we skip the check
 * Set to today's date - all messages from this point forward will work with automation
 */
const BOT_MARKER_FEATURE_DATE = new Date('2025-12-06T00:00:00Z'); // Today's date - automation works from now onward

/**
 * Handle REPLY_RECEIVED webhook from Reachinbox
 * @param req - Express request object
 * @param res - Express response object
 */
export async function handleReachinboxWebhook(req: Request, res: Response): Promise<void> {
  try {
    // Basic sanity check - only handle REPLY_RECEIVED events
    if (req.body.event !== 'REPLY_RECEIVED') {
      console.log(`Ignoring event type: ${req.body.event}`);
      res.status(200).json({ message: 'Event ignored' });
      return;
    }

    // Extract fields from Reachinbox webhook payload
    // Note: Reachinbox sends original_message_id instead of thread_id
    const {
      message_id,
      original_message_id, // This is the thread_id in Reachinbox webhooks
      email_account,
      lead_email,
      lead_first_name,
      lead_last_name,
      email_replied_body,
      email_subject,
    } = req.body;

    // Use original_message_id as thread_id (Reachinbox doesn't send thread_id)
    const thread_id = original_message_id;

    // Combine first and last name if available
    const lead_name = lead_first_name || lead_last_name 
      ? `${lead_first_name || ''} ${lead_last_name || ''}`.trim() 
      : undefined;

    // lead_company is not in Reachinbox webhook, so it will be undefined
    const lead_company = undefined;

    // Validate required fields
    if (!message_id) {
      console.error('Missing required field: message_id');
      res.status(400).json({ error: 'Missing required field: message_id' });
      return;
    }

    // thread_id (original_message_id) is optional - use message_id as fallback if missing
    const effectiveThreadId = thread_id || message_id;

    console.log(`Processing webhook: message_id=${message_id}, thread_id=${effectiveThreadId}`);

    // Duplicate prevention: Check if message was already processed
    if (isProcessed(message_id)) {
      console.log(`Message already processed, skipping: ${message_id}`);
      res.status(200).json({ message: 'Message already processed' });
      return;
    }

    // 1.5. Check if lead is unsubscribed (Do Not Contact) - skip all processing
    if (isUnsubscribed(lead_email)) {
      console.log(`Lead is unsubscribed (DNC), skipping all processing: ${lead_email}`);
      res.status(200).json({ 
        message: 'Lead is unsubscribed - no reply sent',
        lead_email,
      });
      markProcessed(message_id);
      return;
    }

    // 1.6. Check if thread is manually owned (human has taken over) - skip automation
    if (isManualOwner(effectiveThreadId)) {
      console.log(`Thread is manually owned, skipping automation: thread_id=${effectiveThreadId}`);
      res.status(200).json({ 
        message: 'Thread is manually owned - no automation',
        thread_id: effectiveThreadId,
      });
      markProcessed(message_id);
      return;
    }

    // 2. Get message text - prefer email_replied_body from webhook, but always fetch thread for threading info
    let messageText: string = '';
    let latestMessage: any = null;
    let threadSubject: string = 'Your inquiry';
    let threadFrom: string = lead_email || '';

    // Try to use email_replied_body from webhook first (most reliable)
    if (email_replied_body && email_replied_body.trim().length > 0) {
      messageText = email_replied_body.trim();
      console.log(`Using email_replied_body from webhook (length: ${messageText.length})`);
    }

    // Always fetch thread data to get proper threading information (subject, references, etc.)
    let threadData;
    try {
      console.log(`Fetching thread for threading info: ${effectiveThreadId}`);
      if (!email_account) {
        throw new Error('email_account is required to fetch thread');
      }
      threadData = await fetchThread(email_account, effectiveThreadId);
      
      // Extract latest message from thread
      latestMessage = getLatestMessage(threadData);
      if (latestMessage) {
        // Use thread data for subject and from if we don't have email_replied_body
        if (!messageText) {
          messageText = getMessageText(latestMessage);
        }
        // Use email_subject from webhook if available, otherwise use from thread
        threadSubject = email_subject || latestMessage.subject || 'Your inquiry';
        threadFrom = latestMessage.fromEmail || latestMessage.from || lead_email || '';
        
        // Check if last outbound message (from us) was manual (doesn't have bot marker)
        // Look through thread messages to find the last one sent from our email account
        // IMPORTANT: Only check messages sent AFTER bot marker feature was deployed
        if (threadData.messages && Array.isArray(threadData.messages)) {
          const botMarker = 'X-Autobot: alphahire-v1';
          const ourEmailAccount = email_account?.toLowerCase();
          
          // Find last outbound message (from our account)
          for (let i = threadData.messages.length - 1; i >= 0; i--) {
            const msg = threadData.messages[i];
            const msgFrom = (msg.fromEmail || msg.from || '').toLowerCase();
            
            // If this message is from our account
            if (ourEmailAccount && msgFrom === ourEmailAccount.toLowerCase()) {
              // Check message date - only check messages sent after bot marker feature was deployed
              const messageDate = msg.timestamp 
                ? new Date(msg.timestamp) 
                : msg.created_at 
                  ? new Date(msg.created_at) 
                  : null;
              
              // If message is old (before bot marker feature), skip the check
              // Old messages don't have markers, so we can't determine if they were manual
              if (messageDate && messageDate < BOT_MARKER_FEATURE_DATE) {
                console.log(`Skipping manual detection for old message (before bot marker feature): ${messageDate.toISOString()}, thread_id=${effectiveThreadId}`);
                // Don't mark as manual - this is an old message without markers
                break;
              }
              
              // Only check recent messages (after bot marker feature) for bot marker
              const msgBody = getMessageText(msg) || msg.body || msg.text || msg.html || '';
              // If last outbound message doesn't have bot marker, it was manual
              if (!msgBody.includes(botMarker)) {
                console.log(`Manual reply detected in thread history (no bot marker), marking as manual owner: thread_id=${effectiveThreadId}`);
                markAsManualOwner(effectiveThreadId);
                res.status(200).json({ 
                  message: 'Manual reply detected - thread marked as manually owned',
                  thread_id: effectiveThreadId,
                });
                markProcessed(message_id);
                return;
              }
              // Found our last message with bot marker (it was auto), stop searching
              break;
            }
          }
        }
      }
    } catch (error: any) {
      console.warn('Failed to fetch thread (non-fatal):', error.message);
      // Don't fail - we'll try to proceed with what we have
      // Removed Slack notification - client wants only agreement sent and manual review alerts
    }

    // 3.5. Check for blank/empty messages - classify as AUTO_REPLY_BLANK
    if (!messageText || messageText.trim().length === 0) {
      console.log(`Blank/empty message detected, treating as AUTO_REPLY_BLANK: message_id=${message_id}`);
      // Treat as blank auto-reply - skip classification and go straight to handler
      res.status(200).json({
        message: 'Blank auto-reply detected - no reply sent',
        template_id: 'AUTO_REPLY_BLANK',
      });
      markProcessed(message_id);
      return;
    }

    // 4. Classify Email with OpenAI
    const meta: EmailMeta = {
      lead_email,
      lead_name,
      lead_company,
    };

    let classification;
    try {
      classification = await classifyEmail(messageText, meta);
    } catch (error: any) {
      console.error('Classification failed:', error);
      // Removed Slack notification - client wants only agreement sent and manual review alerts
      res.status(500).json({ error: 'Classification failed' });
      return;
    }

    let { template_id, vars, flags } = classification;

    // 4.3. Extract and lock roles when clearly stated
    // If message clearly states a role (e.g., "Estimator", "Project Manager", etc.), lock it
    if (vars.role) {
      addLockedRole(effectiveThreadId, vars.role);
      console.log(`Role locked: ${vars.role} for thread ${effectiveThreadId}`);
    }
    // Also check if role1 or role2 are explicitly mentioned (not inferred)
    // Note: We'll rely on OpenAI to distinguish explicit mentions vs inferences

    // 4.3.5. Fallback OOO detection (in case OpenAI misses it)
    const oooPatterns = [
      /out of office/i,
      /ooo/i,
      /currently out/i,
      /will return/i,
      /will respond upon/i,
      /will respond when/i,
      /automatic reply/i,
      /auto-reply/i,
      /away from office/i,
      /on vacation/i,
      /currently unavailable/i,
    ];
    const isOOO = oooPatterns.some(pattern => pattern.test(messageText));
    if (isOOO && template_id !== 'OUT_OF_OFFICE') {
      console.log(`Fallback OOO detection triggered: message contains OOO pattern but was classified as ${template_id}`);
      // Override classification to OUT_OF_OFFICE
      template_id = 'OUT_OF_OFFICE';
      classification.template_id = 'OUT_OF_OFFICE';
      console.log(`Overriding classification to OUT_OF_OFFICE`);
    }

    // 4.4. Thread-level stop rule: If thread has already gotten ONE auto-response, stop unless whitelisted
    const currentAutoReplies = getAutoRepliesSent(effectiveThreadId);
    if (currentAutoReplies >= 1 && !ALLOWED_AFTER_FIRST_REPLY.has(template_id)) {
      console.log(`Thread-level stop rule triggered: autoRepliesSent=${currentAutoReplies}, template_id=${template_id}, message_id=${message_id}`);
      
      // Determine reason for manual review
      let reason = 'Human conversation detected - autoresponder stopped';
      if (template_id === 'INTERESTED') {
        reason = 'ambiguous / skeptical / multi-role';
      } else if (template_id === 'NOT_HIRING' || template_id === 'NOT_INTERESTED_GENERAL') {
        reason = 'not interested after initial reply';
      } else if (template_id === 'TOO_EXPENSIVE' || template_id === 'PERCENT_TOO_HIGH') {
        reason = 'pricing concern after initial reply';
      } else {
        reason = `template_id: ${template_id} - not whitelisted after first reply`;
      }
      
      // Commented out - client wants only agreement sent notifications
      // await sendAlert(`⚠️ Human Conversation Detected — autoresponder stopped`, {
      //   event: 'manual_review',
      //   thread_id: effectiveThreadId,
      //   message_id,
      //   lead_email,
      //   lead_name,
      //   lead_company,
      //   template_id,
      //   auto_replies_sent: currentAutoReplies,
      //   reason,
      // });
      
      res.status(200).json({
        message: 'Human conversation detected - manual review required',
        template_id,
        reason,
        auto_replies_sent: currentAutoReplies,
      });
      markProcessed(message_id);
      return;
    }

    // 4.5. Handle OUT_OF_OFFICE - Do not send any reply
    if (template_id === 'OUT_OF_OFFICE') {
      console.log(`Out of office detected, skipping reply: message_id=${message_id}`);
      // Removed Slack notification - client wants only agreement sent and manual review alerts
      res.status(200).json({
        message: 'Out of office detected - no reply sent',
        template_id,
      });
      markProcessed(message_id);
      return;
    }

    // 4.5b. Handle AUTO_REPLY_BLANK - Do not send any reply
    if (template_id === 'AUTO_REPLY_BLANK') {
      console.log(`Blank auto-reply detected, skipping reply: message_id=${message_id}`);
      // Don't treat blank auto-reply sender as new contact - don't update lastFrom
      // Removed Slack notification - client wants only agreement sent and manual review alerts
      res.status(200).json({
        message: 'Blank auto-reply detected - no reply sent',
        template_id,
      });
      markProcessed(message_id);
      return;
    }

    // 4.5.1. Track active contact (last sender) - update on every inbound message
    // Use threadFrom (sender email) or lead_email as fallback
    // Don't update for OOO or blank auto-replies (already handled above)
    const senderEmail = threadFrom || lead_email;
    if (senderEmail) {
      setLastFrom(effectiveThreadId, senderEmail);
      console.log(`Active contact updated: ${senderEmail} for thread ${effectiveThreadId}`);
    }

    // 4.5a. Handle UNSUBSCRIBE - Do not send any reply, mark as DNC
    if (template_id === 'UNSUBSCRIBE') {
      console.log(`Unsubscribe detected, marking as DNC and skipping reply: message_id=${message_id}, lead_email=${lead_email}`);
      
      // Mark lead as unsubscribed (Do Not Contact)
      if (lead_email) {
        markAsUnsubscribed(lead_email);
      }
      
      // Removed Slack notification - client wants only agreement sent and manual review alerts
      
      res.status(200).json({
        message: 'Unsubscribe detected - lead marked as DNC, no reply sent',
        template_id,
        lead_email,
      });
      markProcessed(message_id);
      return;
    }

    // 4.5c. Handle NOT_HIRING - Hard stop, no reply
    if (template_id === 'NOT_HIRING') {
      console.log(`Not hiring detected, skipping reply: message_id=${message_id}`);
      res.status(200).json({
        message: 'Not hiring detected - no reply sent',
        template_id,
      });
      markProcessed(message_id);
      return;
    }

    // 4.5d. Handle NOT_INTERESTED_GENERAL - Hard stop, no reply
    if (template_id === 'NOT_INTERESTED_GENERAL') {
      console.log(`Not interested detected, skipping reply: message_id=${message_id}`);
      res.status(200).json({
        message: 'Not interested detected - no reply sent',
        template_id,
      });
      markProcessed(message_id);
      return;
    }

    // 4.5e. Handle DONE_ALL_SET - Hard stop, no reply (polite soft-no)
    if (template_id === 'DONE_ALL_SET') {
      console.log(`Done/all set detected, skipping reply: message_id=${message_id}`);
      res.status(200).json({
        message: 'Done/all set detected - no reply sent',
        template_id,
      });
      markProcessed(message_id);
      return;
    }

    // 4.6. Handle WRONG_PERSON_NO_CONTACT - Do not send reply, alert for manual review
    if (template_id === 'WRONG_PERSON_NO_CONTACT') {
      console.log(`Wrong person, no contact provided, skipping reply: message_id=${message_id}`);
      // Commented out - client wants only agreement sent notifications
      // await sendAlert(`⚠️ Manual Review Required: Wrong person, no contact provided`, {
      //   event: 'manual_review',
      //   thread_id: effectiveThreadId,
      //   message_id,
      //   lead_email,
      //   lead_name,
      //   lead_company,
      //   template_id,
      //   reason: 'Wrong person - no contact information provided',
      // });
      res.status(200).json({
        message: 'Wrong person, no contact - manual review required',
        template_id,
        reason: 'No contact information provided',
      });
      markProcessed(message_id);
      return;
    }

    // 4.7. Validate WRONG_PERSON_WITH_CONTACT - ensure contact_email is different from lead_email AND sender_email
    if (template_id === 'WRONG_PERSON_WITH_CONTACT') {
      const contactEmail = vars.contact_email;
      const senderEmail = threadFrom || lead_email; // Use threadFrom (sender) or fallback to lead_email
      
      // Normalize emails for comparison
      const normalizedContactEmail = contactEmail?.toLowerCase().trim();
      const normalizedLeadEmail = lead_email?.toLowerCase().trim();
      const normalizedSenderEmail = senderEmail?.toLowerCase().trim();
      
      // Reject if contact_email is same as lead_email OR sender_email
      if (!contactEmail || 
          normalizedContactEmail === normalizedLeadEmail || 
          normalizedContactEmail === normalizedSenderEmail) {
        // Same email bug detected - downgrade to WRONG_PERSON_NO_CONTACT
        console.log(`Same email bug detected: contact_email=${contactEmail}, lead_email=${lead_email}, sender_email=${senderEmail}, downgrading to WRONG_PERSON_NO_CONTACT`);
        // Commented out - client wants only agreement sent notifications
        // await sendAlert(`⚠️ Manual Review Required: Wrong person - same email detected`, {
        //   event: 'manual_review',
        //   thread_id: effectiveThreadId,
        //   message_id,
        //   lead_email,
        //   lead_name,
        //   lead_company,
        //   template_id: 'WRONG_PERSON_WITH_CONTACT',
        //   contact_email: contactEmail,
        //   reason: 'Contact email same as lead email - invalid contact',
        // });
        const reason = normalizedContactEmail === normalizedLeadEmail 
          ? 'Contact email same as lead email' 
          : 'Contact email same as sender email';
        
        res.status(200).json({
          message: 'Wrong person - same email detected, manual review required',
          template_id: 'WRONG_PERSON_NO_CONTACT',
          reason,
        });
        markProcessed(message_id);
        return;
      }
    }

    // 5. Check for duplicate template_id BEFORE sending (FIX: Issue 1)
    const lastTemplateId = getLastTemplateId(effectiveThreadId);
    if (template_id === lastTemplateId && lastTemplateId !== undefined) {
      console.log(`Duplicate template_id detected: ${template_id}, message_id=${message_id}`);
      // Commented out - client wants only agreement sent notifications
      // await sendAlert(`⚠️ Manual Review Required: Repeated template_id: ${template_id}`, {
      //   event: 'manual_review',
      //   thread_id: effectiveThreadId,
      //   message_id,
      //   lead_email,
      //   lead_name,
      //   lead_company,
      //   template_id,
      //   last_template_id: lastTemplateId,
      //   reason: `Repeated template_id: ${template_id} - Same message would be sent twice`,
      // });
      res.status(200).json({
        message: 'Manual review required - duplicate template_id',
        template_id,
        reason: 'Repeated template_id detected',
      });
      return;
    }

    // 6. Check for manual review conditions (other casess)
    // Get current loop count before incrementing (if applicable)
    const currentLoopCount = getLoopCount(effectiveThreadId);
    const moreInfoCount = flags.wants_more_info ? currentLoopCount + 1 : currentLoopCount;
    
    const needsManualReview = 
      template_id === 'UNCLASSIFIED' ||
      (flags.wants_more_info && moreInfoCount >= 2) ||
      flags.unsubscribe ||
      flags.abuse ||
      flags.bounce;

    if (needsManualReview) {
      let reason = 'Manual review required';
      if (template_id === 'UNCLASSIFIED') {
        reason = 'UNCLASSIFIED template_id';
      } else if (flags.wants_more_info && moreInfoCount >= 2) {
        reason = `MORE_INFO loop count >= 2 (current: ${moreInfoCount})`;
      } else if (flags.unsubscribe) {
        reason = 'Unsubscribe flag detected';
      } else if (flags.abuse) {
        reason = 'Abuse flag detected';
      } else if (flags.bounce) {
        reason = 'Bounce flag detected';
      }

      console.log(`Manual review required: ${reason}, message_id=${message_id}`);
      
      // Commented out - client wants only agreement sent notifications
      // await sendAlert(`⚠️ Manual Review Required: ${reason}`, {
      //   event: 'manual_review',
      //   thread_id: effectiveThreadId,
      //   message_id,
      //   lead_email,
      //   lead_name,
      //   lead_company,
      //   template_id: template_id || 'UNKNOWN',
      //   last_template_id: lastTemplateId,
      //   more_info_count: moreInfoCount,
      //   flags: JSON.stringify(flags),
      //   reason,
      // });

      res.status(200).json({
        message: 'Manual review required',
        template_id,
        reason,
      });
      return;
    }

    // 7. Check if contact info is provided and skip reply if appropriate (FIX: Issue 3 & 4)
    if (template_id === 'NOT_HIRING_CONTACT' && flags.contact_info_provided) {
      // Contact info already provided - send acknowledgment instead of asking again
      console.log(`Contact info already provided for NOT_HIRING_CONTACT, sending acknowledgment`);
    }

    // 8. Check for unknown/invalid template_id (fallback for edge cases)
    if (!template_id || flags.needs_human) {
      console.log(`Unknown classification or needs human: template_id=${template_id}`);
      // Commented out - client wants only agreement sent notifications
      // await sendAlert(`⚠️ Manual Review Required: Unknown classification or needs human`, {
      //   event: 'manual_review',
      //   thread_id: effectiveThreadId,
      //   message_id,
      //   lead_email,
      //   template_id: template_id || 'UNKNOWN',
      //   flags: JSON.stringify(flags),
      //   reason: 'Unknown classification or needs_human flag',
      // });
      res.status(200).json({
        message: 'Unknown classification, needs human review',
        template_id,
      });
      return;
    }

    // 9. Increment MORE_INFO loop counter if applicable
    if (flags.wants_more_info) {
      incrementLoop(effectiveThreadId);
      console.log(`MORE_INFO loop detected: thread_id=${effectiveThreadId}, count=${getLoopCount(effectiveThreadId)}`);
    }

    // 9.5. Check if roles are locked and prevent role guessing
    const lockedRolesList = getLockedRoles(effectiveThreadId);
    if (lockedRolesList.length > 0 && template_id === 'NO_JOB_POST') {
      console.log(`Roles are locked (${lockedRolesList.join(', ')}), using ROLE_CONFIRMED_FOLLOWUP instead of NO_JOB_POST`);
      template_id = 'ROLE_CONFIRMED_FOLLOWUP';
      // Update vars to include locked roles (as string for template)
      vars.locked_roles = lockedRolesList.join(' and ');
      vars.role = lockedRolesList[0]; // Use first locked role as primary
    }

    // 10. Generate Reply Script (with flags for conditional logic)
    let replyText;
    try {
      // Map classification flags to template flags
      const templateFlags = {
        unsubscribe: flags.unsubscribe,
        contact_info_provided: flags.contact_info_provided,
      };
      replyText = getScript(template_id, vars, templateFlags);
    } catch (error: any) {
      console.error('Failed to get script:', error);
      // Removed Slack notification - client wants only agreement sent and manual review alerts
      res.status(500).json({ error: 'Failed to generate reply script' });
      return;
    }

    // 11. Send Reply via Reachinbox
    try {
      // Build threading information
      let inReplyTo: string | undefined;
      let references: string[] = [];
      let originalMessageId: string | undefined;

      if (latestMessage) {
        // Use the current message_id as inReplyTo (we're replying to this message)
        inReplyTo = latestMessage.messageId || latestMessage.id;
        
        // originalMessageId should be the first message in the thread
        // Use effectiveThreadId (which is original_message_id from webhook) as the original message ID
        originalMessageId = latestMessage.originalMessageId || effectiveThreadId;
        
        // Build references array from message
        if (latestMessage.references) {
          // references might be a string or array
          if (Array.isArray(latestMessage.references)) {
            // If it's an array, check if first element is a space-separated string
            if (latestMessage.references.length > 0 && typeof latestMessage.references[0] === 'string' && latestMessage.references[0].includes(' ')) {
              // Split space-separated string into array
              references = latestMessage.references[0].split(' ').filter((ref: string) => ref.trim().length > 0);
            } else {
              references = latestMessage.references;
            }
          } else if (typeof latestMessage.references === 'string') {
            // If it's a string, split by spaces if it contains multiple IDs
            if (latestMessage.references.includes(' ')) {
              references = latestMessage.references.split(' ').filter((ref: string) => ref.trim().length > 0);
            } else {
              references = [latestMessage.references];
            }
          }
        }
        
        // Add originalMessageId to references if not already there
        if (originalMessageId && !references.includes(originalMessageId)) {
          references.push(originalMessageId);
        }
        
        // Add inReplyTo to references if not already there
        if (inReplyTo && !references.includes(inReplyTo)) {
          references.push(inReplyTo);
        }
      } else {
        // Fallback: use effectiveThreadId as originalMessageId and message_id as inReplyTo
        inReplyTo = message_id;
        originalMessageId = effectiveThreadId; // effectiveThreadId is the original message ID
        references = message_id ? [message_id] : [];
        if (effectiveThreadId && !references.includes(effectiveThreadId)) {
          references.unshift(effectiveThreadId); // Add thread_id at the beginning
        }
      }

      if (!email_account) {
        throw new Error('email_account is required to send email');
      }

      // Validate the recipient email before calling sendEmail
      const toEmail = lead_email || threadFrom;
      if (!toEmail || !toEmail.trim()) {
        throw new Error('Recipient email address is required for sending the reply');
      }

      // Add bot marker to email body to identify auto-replies
      const botMarker = '\n\n<!-- X-Autobot: alphahire-v1 -->';
      const replyTextWithMarker = replyText + botMarker;

      await sendEmail({
        from: email_account, // Required: sender's email address
        to: toEmail, // Use the validated recipient
        subject: threadSubject.startsWith('Re:') ? threadSubject : `Re: ${threadSubject}`,
        body: replyTextWithMarker,
        inReplyTo: inReplyTo,
        references: references,
        originalMessageId: originalMessageId,
      });
      console.log(`Reply sent successfully: template_id=${template_id}, thread_id=${effectiveThreadId}`);
      
      // Increment auto-replies sent counter for this thread
      incrementAutoRepliesSent(effectiveThreadId);
    } catch (error: any) {
      console.error('Failed to send reply:', error);
      // Removed Slack notification - client wants only agreement sent and manual review alerts
      res.status(500).json({ error: 'Failed to send reply' });
      return;
    }

    // 12. Send E-Signature if Required (with guardrails)
    if (AUTO_SEND_TEMPLATES.has(template_id)) {
      // Check if agreement was already sent for this thread
      if (isAgreementSent(effectiveThreadId)) {
        console.log(`Agreement already sent for thread ${effectiveThreadId}, skipping duplicate send`);
        // Don't send again, but continue with the rest of the flow
      }
      // Check for blocking flags
      else if (flags.wants_resume_first) {
        console.log(`Lead wants resume first, skipping agreement send: template_id=${template_id}, thread_id=${effectiveThreadId}`);
        // Don't send agreement, escalate to manual review or use specific script
      }
      else if (flags.wants_call_first) {
        console.log(`Lead wants call first, skipping agreement send: template_id=${template_id}, thread_id=${effectiveThreadId}`);
        // Don't send agreement, should respond with call-scheduling script
      }
      else if (flags.already_signed) {
        console.log(`Lead already signed agreement, skipping duplicate send: template_id=${template_id}, thread_id=${effectiveThreadId}`);
        // Mark as sent to prevent future sends
        markAgreementSent(effectiveThreadId);
        // Don't send agreement again
      }
      // All checks passed - send agreement
      else {
        try {
          // Use active contact (lastFrom) instead of original lead_email
          // This ensures agreements go to the latest human respondent, not always the original recipient
          const recipientEmail = getLastFrom(effectiveThreadId) || lead_email || '';
          
          await sendAgreement({
            clientEmail: recipientEmail,
            clientName: lead_name,
            companyName: lead_company,
          });
          console.log(`Agreement sent successfully: template_id=${template_id}, thread_id=${effectiveThreadId}`);
          
          // Mark agreement as sent for this thread
          markAgreementSent(effectiveThreadId);
          
          // Agreement sent alert: Success case
          await sendAlert(`📄 Agreement sent successfully: ${template_id}`, {
            event: 'agreement_sent',
            thread_id: effectiveThreadId,
            message_id,
            template_id,
            lead_email,
            lead_name,
            lead_company,
          });

          // Send follow-up email after agreement is sent (for YES_SEND and ASK_AGREEMENT)
          if (template_id === 'YES_SEND' || template_id === 'ASK_AGREEMENT') {
            try {
            const followUpText = getFollowUpEmailText();
            
            // Build threading information for follow-up email (same as main reply)
            let followUpInReplyTo: string | undefined;
            let followUpReferences: string[] = [];
            let followUpOriginalMessageId: string | undefined;

            if (latestMessage) {
              followUpInReplyTo = latestMessage.messageId || latestMessage.id;
              followUpOriginalMessageId = latestMessage.originalMessageId || effectiveThreadId;
              
              if (latestMessage.references) {
                if (Array.isArray(latestMessage.references)) {
                  if (latestMessage.references.length > 0 && typeof latestMessage.references[0] === 'string' && latestMessage.references[0].includes(' ')) {
                    followUpReferences = latestMessage.references[0].split(' ').filter((ref: string) => ref.trim().length > 0);
                  } else {
                    followUpReferences = latestMessage.references;
                  }
                } else if (typeof latestMessage.references === 'string') {
                  if (latestMessage.references.includes(' ')) {
                    followUpReferences = latestMessage.references.split(' ').filter((ref: string) => ref.trim().length > 0);
                  } else {
                    followUpReferences = [latestMessage.references];
                  }
                }
              }
              
              if (followUpOriginalMessageId && !followUpReferences.includes(followUpOriginalMessageId)) {
                followUpReferences.push(followUpOriginalMessageId);
              }
              
              if (followUpInReplyTo && !followUpReferences.includes(followUpInReplyTo)) {
                followUpReferences.push(followUpInReplyTo);
              }
            } else {
              followUpInReplyTo = message_id;
              followUpOriginalMessageId = effectiveThreadId;
              followUpReferences = message_id ? [message_id] : [];
              if (effectiveThreadId && !followUpReferences.includes(effectiveThreadId)) {
                followUpReferences.unshift(effectiveThreadId);
              }
            }
            
            const toEmail = lead_email || threadFrom;
            if (toEmail && email_account) {
              // Add bot marker to follow-up email body
              const botMarker = '\n\n<!-- X-Autobot: alphahire-v1 -->';
              const followUpTextWithMarker = followUpText + botMarker;
              
              await sendEmail({
                from: email_account,
                to: toEmail,
                subject: threadSubject.startsWith('Re:') ? threadSubject : `Re: ${threadSubject}`,
                body: followUpTextWithMarker,
                inReplyTo: followUpInReplyTo,
                references: followUpReferences,
                originalMessageId: followUpOriginalMessageId,
              });
              console.log(`Follow-up email sent successfully after agreement: template_id=${template_id}, thread_id=${effectiveThreadId}`);
            }
            } catch (error: any) {
              console.error('Failed to send follow-up email:', error);
              // Don't fail the whole request if follow-up email fails, just log
            }
          }
        } catch (error: any) {
          console.error('Failed to send agreement:', error);
          // Removed Slack notification - client wants only agreement sent (success) and manual review alerts
          // Don't fail the whole request if e-sign fails, just log
        }
      }
    }

    // 13. Store last template_id for this thread (for repeat detection)
    setLastTemplateId(effectiveThreadId, template_id);

    // 14. Mark message as processed (only after successful completion)
    markProcessed(message_id);

    // 15. Success Response
    res.status(200).json({
      message: 'Webhook processed successfully',
      template_id,
      reply_sent: true,
      agreement_sent: requiresESignature(template_id),
    });
  } catch (error: any) {
    console.error('Unexpected error in webhook handler:', error);
    // Removed Slack notification - client wants only agreement sent and manual review alerts
    res.status(500).json({ error: 'Internal server error' });
  }
}

