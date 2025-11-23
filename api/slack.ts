/**
 * Slack alert wrapper
 * Function: sendAlert(message, metadata)
 * Used for UNSUBSCRIBE, ABUSE, loop limit alerts, and API failures
 */

import axios from 'axios';
import { config } from '../config/env';

/**
 * Interface for alert metadata
 */
export interface AlertMetadata {
  event?: string;
  thread_id?: string;
  message_id?: string;
  lead_email?: string;
  lead_name?: string;
  lead_company?: string;
  template_id?: string;
  error?: string;
  [key: string]: any;
}

/**
 * Send alert to Slack via webhook
 * @param message - Alert message text
 * @param metadata - Optional metadata (event, thread_id, error, etc.)
 * @returns Promise that resolves when alert is sent
 * @throws Error if webhook call fails (but doesn't throw to avoid breaking main flow)
 */
export async function sendAlert(
  message: string,
  metadata?: AlertMetadata
): Promise<void> {
  try {
    const payload = {
      text: message,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 Autoresponder Alert',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Message:*\n${message}`,
          },
        },
      ],
      attachments: [
        {
          color: metadata?.event === 'error' ? 'danger' : 'warning',
          fields: [] as Array<{ title: string; value: string; short: boolean }>,
        },
      ],
    };

    // Add metadata fields if provided
    if (metadata) {
      const fields = payload.attachments[0].fields!;

      if (metadata.event) {
        fields.push({
          title: 'Event',
          value: metadata.event,
          short: true,
        });
      }

      if (metadata.thread_id) {
        fields.push({
          title: 'Thread ID',
          value: metadata.thread_id,
          short: true,
        });
      }

      if (metadata.message_id) {
        fields.push({
          title: 'Message ID',
          value: metadata.message_id,
          short: true,
        });
      }

      if (metadata.lead_email) {
        fields.push({
          title: 'Lead Email',
          value: metadata.lead_email,
          short: true,
        });
      }

      if (metadata.lead_name) {
        fields.push({
          title: 'Lead Name',
          value: metadata.lead_name,
          short: true,
        });
      }

      if (metadata.lead_company) {
        fields.push({
          title: 'Company',
          value: metadata.lead_company,
          short: true,
        });
      }

      if (metadata.template_id) {
        fields.push({
          title: 'Template ID',
          value: metadata.template_id,
          short: true,
        });
      }

      if (metadata.error) {
        fields.push({
          title: 'Error',
          value: metadata.error,
          short: false,
        });
      }

      // Add timestamp
      fields.push({
        title: 'Timestamp',
        value: new Date().toISOString(),
        short: true,
      });
    }

    await axios.post(config.slack.webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    // Log error but don't throw - we don't want Slack failures to break the main flow
    console.error('Failed to send Slack alert:', error.message);
    // Optionally, you could log to a file or other error tracking service here
  }
}

/**
 * Helper function to send error alerts
 * @param errorMessage - Error message
 * @param metadata - Optional metadata
 */
export async function sendErrorAlert(
  errorMessage: string,
  metadata?: AlertMetadata
): Promise<void> {
  await sendAlert(`❌ Error: ${errorMessage}`, {
    ...metadata,
    event: 'error',
  });
}

/**
 * Helper function to send warning alerts
 * @param warningMessage - Warning message
 * @param metadata - Optional metadata
 */
export async function sendWarningAlert(
  warningMessage: string,
  metadata?: AlertMetadata
): Promise<void> {
  await sendAlert(`⚠️ Warning: ${warningMessage}`, {
    ...metadata,
    event: 'warning',
  });
}