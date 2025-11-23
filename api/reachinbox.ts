/**
 * Reachinbox API wrapper
 * Functions:
 * - fetchThread(account, threadId): POST /api/v1/onebox/thread
 * - sendEmail(data): POST /api/v1/onebox/send (multipart/form-data)
 * - getLatestMessage(threadData): Helper to extract latest message
 */

import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { config } from '../config/env';

// Create axios instance with base configuration
// Note: For sendEmail, we'll use multipart/form-data, so we don't set Content-Type here
const reachinboxClient: AxiosInstance = axios.create({
  baseURL: config.reachinbox.baseUrl,
  headers: {
    'Authorization': `Bearer ${config.reachinbox.apiKey}`,
  },
});

/**
 * Interface for thread data structure
 */
export interface ThreadData {
  id: string;
  messages?: Message[];
  [key: string]: any; // Allow additional properties
}

/**
 * Interface for message structure
 */
export interface Message {
  id: string;
  body?: string;
  text?: string;
  html?: string;
  from?: string;
  to?: string;
  subject?: string;
  timestamp?: string;
  created_at?: string;
  [key: string]: any; // Allow additional properties
}

/**
 * Interface for send email request
 */
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

/**
 * Fetch thread data from Reachinbox
 * According to API docs: POST /api/v1/onebox/thread with { account, id }
 * @param account - Email account associated with the thread
 * @param threadId - Original message ID of the thread (may contain special characters like < >)
 * @returns Thread data with messages
 * @throws Error if API call fails
 */
export async function fetchThread(account: string, threadId: string): Promise<ThreadData> {
  try {
    // According to docs, this is a POST request with JSON body
    const response = await reachinboxClient.post('/api/v1/onebox/thread', {
      account: account,
      id: threadId,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // API returns { status, message, data: [...] }
    // Return the data array wrapped in our expected format
    if (response.data && response.data.data) {
      return {
        id: threadId,
        messages: response.data.data,
      };
    }
    return response.data;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const errorData = error.response?.data;
      throw new Error(
        `Reachinbox API error: ${status} - ${statusText || error.message}${errorData ? ` (${JSON.stringify(errorData)})` : ''}`
      );
    }
    throw error;
  }
}

/**
 * Extract the latest message from thread data
 * This is the source of truth for the most recent reply
 * @param threadData - Thread data from fetchThread
 * @returns Latest message or null if no messages found
 */
export function getLatestMessage(threadData: ThreadData): Message | null {
  if (!threadData.messages || threadData.messages.length === 0) {
    return null;
  }

  // Sort messages by timestamp (most recent first)
  // API returns sentAt field, so check that too
  const sortedMessages = [...threadData.messages].sort((a, b) => {
    const timeA = a.sentAt || a.timestamp || a.created_at || '';
    const timeB = b.sentAt || b.timestamp || b.created_at || '';
    return timeB.localeCompare(timeA);
  });

  return sortedMessages[0] || null;
}

/**
 * Get the text content from a message
 * Prioritizes: text > body > preview (stripped HTML)
 * @param message - Message object
 * @returns Plain text content
 */
export function getMessageText(message: Message): string {
  if (message.text) {
    return message.text;
  }
  if (message.body) {
    // Body might be HTML, so strip tags
    return message.body.replace(/<[^>]*>/g, '').trim();
  }
  if (message.preview) {
    return message.preview.trim();
  }
  if (message.html) {
    // Simple HTML stripping (basic implementation)
    return message.html.replace(/<[^>]*>/g, '').trim();
  }
  return '';
}

/**
 * Send email reply via Reachinbox
 * According to API docs: POST /api/v1/onebox/send with multipart/form-data
 * @param emailData - Email data to send
 * @returns Response from Reachinbox API
 * @throws Error if API call fails
 */
export async function sendEmail(emailData: SendEmailRequest): Promise<any> {
  try {
    // Convert body to HTML if it's plain text
    const htmlBody = emailData.body.includes('<') 
      ? emailData.body 
      : `<p>${emailData.body.replace(/\n/g, '</p><p>')}</p>`;

    // Prepare emaildata JSON object - START with required fields only
    const emaildata: any = {
      to: Array.isArray(emailData.to) ? emailData.to : [emailData.to],
      from: emailData.from,
      subject: emailData.subject,
      body: htmlBody,
    };

    // Conditionally add optional fields (omit null values and empty arrays)
    if (emailData.cc && emailData.cc.length > 0) {
      emaildata.cc = emailData.cc;
    }

    if (emailData.bcc && emailData.bcc.length > 0) {
      emaildata.bcc = emailData.bcc;
    }

    // References handling - include only if non-empty
    if (emailData.references && emailData.references.length > 0) {
      emaildata.references = emailData.references;
    }

    // Threading fields - include only if defined (omit null values)
    if (emailData.inReplyTo) {
      emaildata.inReplyTo = emailData.inReplyTo;
    }

    if (emailData.originalMessageId) {
      emaildata.originalMessageId = emailData.originalMessageId;
    }

    // Logging for debugging
    console.log('Reachinbox Payload:', JSON.stringify(emaildata, null, 2));

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