/**
 * Webhook handler for Reachinbox REPLY_RECEIVED events
 * Main business logic for email classification and auto-reply
 */

import { Request, Response } from 'express';
import { incrementLoop, isProcessed, markProcessed, getLastTemplateId, setLastTemplateId, getLoopCount } from '../state/threadState';
import { fetchThread, getLatestMessage, getMessageText, sendEmail } from '../api/reachinbox';
import { classifyEmail, EmailMeta } from '../api/openai';
import { sendAgreement } from '../api/esign';
import { sendAlert, sendErrorAlert, sendWarningAlert } from '../api/slack';
import { getScript, requiresESignature, AUTO_SEND_TEMPLATES } from '../config/scripts';

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
      }
    } catch (error: any) {
      console.warn('Failed to fetch thread (non-fatal):', error.message);
      // Don't fail - we'll try to proceed with what we have
      await sendWarningAlert('Could not fetch thread from Reachinbox, using webhook data only', {
        event: 'warning',
        thread_id: effectiveThreadId,
        message_id,
        error: error.message,
      });
    }

    // Validate we have message text
    if (!messageText || messageText.trim().length === 0) {
      console.error('Empty message text - cannot proceed');
      await sendErrorAlert('Empty message text - cannot classify email', {
        event: 'error',
        thread_id: effectiveThreadId,
        message_id,
        has_email_replied_body: !!email_replied_body,
      });
      res.status(500).json({ error: 'Empty message text' });
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
      await sendErrorAlert('OpenAI classification failed', {
        event: 'error',
        thread_id: effectiveThreadId,
        message_id,
        error: error.message,
      });
      res.status(500).json({ error: 'Classification failed' });
      return;
    }

    const { template_id, vars, flags } = classification;

    // 5. Check for duplicate template_id BEFORE sending (FIX: Issue 1)
    const lastTemplateId = getLastTemplateId(effectiveThreadId);
    if (template_id === lastTemplateId && lastTemplateId !== undefined) {
      console.log(`Duplicate template_id detected: ${template_id}, message_id=${message_id}`);
      await sendAlert(`⚠️ Manual Review Required: Repeated template_id: ${template_id}`, {
        event: 'manual_review',
        thread_id: effectiveThreadId,
        message_id,
        lead_email,
        lead_name,
        lead_company,
        template_id,
        last_template_id: lastTemplateId,
        reason: `Repeated template_id: ${template_id} - Same message would be sent twice`,
      });
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
      
      await sendAlert(`⚠️ Manual Review Required: ${reason}`, {
        event: 'manual_review',
        thread_id: effectiveThreadId,
        message_id,
        lead_email,
        lead_name,
        lead_company,
        template_id: template_id || 'UNKNOWN',
        last_template_id: lastTemplateId,
        more_info_count: moreInfoCount,
        flags: JSON.stringify(flags),
        reason,
      });

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
      await sendAlert(`⚠️ Manual Review Required: Unknown classification or needs human`, {
        event: 'manual_review',
        thread_id: effectiveThreadId,
        message_id,
        lead_email,
        template_id: template_id || 'UNKNOWN',
        flags: JSON.stringify(flags),
        reason: 'Unknown classification or needs_human flag',
      });
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
      await sendErrorAlert('Failed to generate reply script', {
        event: 'error',
        thread_id: effectiveThreadId,
        message_id,
        template_id,
        error: error.message,
      });
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

      await sendEmail({
        from: email_account, // Required: sender's email address
        to: toEmail, // Use the validated recipient
        subject: threadSubject.startsWith('Re:') ? threadSubject : `Re: ${threadSubject}`,
        body: replyText,
        inReplyTo: inReplyTo,
        references: references,
        originalMessageId: originalMessageId,
      });
      console.log(`Reply sent successfully: template_id=${template_id}, thread_id=${effectiveThreadId}`);
    } catch (error: any) {
      console.error('Failed to send reply:', error);
      await sendErrorAlert('Failed to send reply via Reachinbox', {
        event: 'error',
        thread_id: effectiveThreadId,
        message_id,
        template_id,
        error: error.message,
      });
      res.status(500).json({ error: 'Failed to send reply' });
      return;
    }

    // 12. Send E-Signature if Required
    if (AUTO_SEND_TEMPLATES.has(template_id)) {
      try {
        await sendAgreement({
          clientEmail: lead_email || '',
          clientName: lead_name,
          companyName: lead_company,
        });
        console.log(`Agreement sent successfully: template_id=${template_id}, thread_id=${effectiveThreadId}`);
        
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
      } catch (error: any) {
        console.error('Failed to send agreement:', error);
        // Agreement send failed alert
        await sendAlert(`❌ Agreement send failed: ${template_id}`, {
          event: 'agreement_send_failed',
          thread_id: effectiveThreadId,
          message_id,
          template_id,
          lead_email,
          lead_name,
          lead_company,
          error: error.message,
        });
        // Don't fail the whole request if e-sign fails, just alert
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
    await sendErrorAlert('Unexpected error in webhook handler', {
      event: 'error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

