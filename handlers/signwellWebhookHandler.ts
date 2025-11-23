/**
 * Webhook handler for SignWell events
 * Handles document signing events (document.signed, document.completed, etc.)
 */

import { Request, Response } from 'express';
import { sendAlert, sendErrorAlert } from '../api/slack';

/**
 * Handle SignWell webhook events
 * @param req - Express request object
 * @param res - Express response object
 */
export async function handleSignWellWebhook(req: Request, res: Response): Promise<void> {
  try {
    // Log the webhook payload for debugging
    console.log('SignWell webhook received:', JSON.stringify(req.body, null, 2));

    const { event, document_id, document_name, status, signer_email, signer_name } = req.body;

    // Handle different event types
    switch (event) {
      case 'document.signed':
      case 'document.completed':
        console.log(`Document signed/completed: ${document_id} by ${signer_email}`);
        
        await sendAlert(`✅ Agreement signed: ${document_name || document_id}`, {
          event: 'document_signed',
          document_id,
          document_name,
          signer_email,
          signer_name,
          status,
        });
        break;

      case 'document.declined':
        console.log(`Document declined: ${document_id} by ${signer_email}`);
        
        await sendAlert(`❌ Agreement declined: ${document_name || document_id}`, {
          event: 'document_declined',
          document_id,
          document_name,
          signer_email,
          signer_name,
        });
        break;

      case 'document.viewed':
        console.log(`Document viewed: ${document_id} by ${signer_email}`);
        // Optional: Log but don't alert for views
        break;

      default:
        console.log(`Unknown SignWell event: ${event}`);
        // Log unknown events but don't fail
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({ 
      message: 'Webhook received',
      event,
      document_id,
    });
  } catch (error: any) {
    console.error('Error processing SignWell webhook:', error);
    await sendErrorAlert('Failed to process SignWell webhook', {
      event: 'error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

