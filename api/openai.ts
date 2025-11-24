/**
 * OpenAI API wrapper for email classification
 * Function: classifyEmail(emailBody, meta)
 * Returns: { template_id, vars, flags }
 * Includes retry logic for API failures
 */

import axios, { AxiosInstance } from 'axios';
import { config } from '../config/env';

// Create axios instance for OpenAI API
const openaiClient: AxiosInstance = axios.create({
  baseURL: 'https://api.openai.com/v1',
  headers: {
    'Authorization': `Bearer ${config.openai.apiKey}`,
    'Content-Type': 'application/json',
  },
});

/**
 * System prompt for email classification
 * This is the exact prompt provided by the client
 */
const SYSTEM_PROMPT = `You are an email intent classifier for AlphaHire, a recruitment agency.

Your ONLY job is to read the latest reply from a prospect and classify it into:
- one intent label called "template_id" (chosen from a fixed list)
- a "vars" object containing any useful extracted fields
- a "flags" object with boolean signals for safety and routing

You MUST follow these rules:

1. Return STRICT JSON ONLY. No commentary, no explanations, no extra text.

2. "template_id" MUST be one of the following EXACT strings:
   - "INTERESTED"
   - "YES_SEND"
   - "NO_JOB_POST"
   - "NOT_INTERESTED"
   - "UNSUBSCRIBE"
   - "ASK_AGREEMENT"
   - "TOO_EXPENSIVE"
   - "ROLE_UNCLEAR"
   - "ALREADY_HAVE_AGENCY"
   - "NOT_HIRING_CONTACT"
   - "LINK_TO_APPLY"
   - "FEES_QUESTION"
   - "PERCENT_TOO_HIGH"

3. "vars" MUST be a JSON object. Include keys ONLY if you are reasonably confident:
   - "role": the main job title they are talking about (e.g. "Account Executive")
   - "location": location if mentioned (e.g. "NYC", "Dallas, TX")
   - "role1", "role2": likely roles they might be hiring for if the reply is vague
   - "company_name": their company name, if clearly stated
   - "contact_email": email address if they provide a contact person's email
   - "contact_name": name if they provide a contact person's name
   - You can add other simple string fields if obviously useful.

4. "flags" MUST be a JSON object with EXACT keys:
   - "unsubscribe": true if they clearly want no more contact, OR if they say they are "no longer in business", "out of business", "closed", "shut down", or similar
   - "abuse": true if the message is rude, hostile, or abusive
   - "bounce": true if it looks like a bounce/undeliverable/auto-failure
   - "wants_more_info": true if they are asking for more details, clarification, or information
   - "needs_human": true if the message is ambiguous, mixed, or too complex to confidently map
   - "contact_info_provided": true if they already provided contact information (email, name, or both) for someone else to contact

5. Do NOT generate email replies or natural language. Your ONLY output is the JSON classification.

6. If you are not confident which template_id to pick, choose the CLOSEST one and set "needs_human": true.

7. PRIORITY RULES (when multiple things are present):
   - If they ask to stop, unsubscribe, say "remove me", OR say they are "no longer in business", "out of business", "closed", "shut down" → template_id = "NOT_INTERESTED", flags.unsubscribe = true.
   - If the message is mainly abusive/hostile → choose the closest negative type and set flags.abuse = true.
   - If they send a link to a job posting or ATS and ask us to apply there → template_id = "LINK_TO_APPLY".
   - If they clearly already work with another agency/vendor and refer to that → template_id = "ALREADY_HAVE_AGENCY".
   - If they say yes / sure / send it / go ahead → template_id = "YES_SEND".
   - If they are positive but not explicitly saying "send the agreement" → template_id = "INTERESTED".
   - If they ask about fees AND position/role in the same message → template_id = "FEES_QUESTION", and make sure to extract "role" in vars if mentioned.
   - If they only ask "What are your fees? Is there a fee?" (without mentioning position) → template_id = "FEES_QUESTION".
   - If they say the fee or percentage is too high specifically → template_id = "PERCENT_TOO_HIGH".
   - If they say it's too expensive in general but not specifically about percent → template_id = "TOO_EXPENSIVE".
   - If they say they don't have a job posted, are confused about why we're reaching out, or mention no open role → template_id = "NO_JOB_POST".
   - If they say they aren't the right person, not the hiring manager, or give a better contact:
     * If they PROVIDE contact information (email, name, or both) in the message → template_id = "NOT_HIRING_CONTACT", flags.contact_info_provided = true, and include "contact_email" and/or "contact_name" in vars if found.
     * If they DON'T provide contact information → template_id = "NOT_HIRING_CONTACT", flags.contact_info_provided = false.
   - If they mention "another person", "someone else", "referral", "know someone", "have someone" who needs the service but DON'T provide contact information → template_id = "NOT_HIRING_CONTACT", flags.contact_info_provided = false.
   - If they mention working with agencies but are open to hearing more or adding another partner → "ALREADY_HAVE_AGENCY" (not negative).
   - If they say they are not interested, don't need help, or the position is filled → template_id = "NOT_INTERESTED".
   - If they ask what role we are talking about, say "which position?" or similar → template_id = "ROLE_UNCLEAR".
   - If they explicitly ask for the agreement/terms/contract (e.g. "send the agreement", "can you send your terms") → template_id = "ASK_AGREEMENT".

8. Make a best effort to always pick one of the allowed template_id values.`;

/**
 * Interface for classification result
 */
export interface ClassificationResult {
  template_id: string;
  vars: {
    role?: string;
    location?: string;
    role1?: string;
    role2?: string;
    company_name?: string;
    [key: string]: string | undefined;
  };
  flags: {
    unsubscribe: boolean;
    abuse: boolean;
    bounce: boolean;
    wants_more_info: boolean;
    needs_human: boolean;
    contact_info_provided?: boolean;
  };
}

/**
 * Interface for email metadata
 */
export interface EmailMeta {
  lead_email?: string;
  lead_name?: string;
  lead_company?: string;
  [key: string]: any;
}

/**
 * Classify email content using OpenAI
 * @param emailBody - The email message text to classify
 * @param meta - Optional metadata (lead email, name, company)
 * @param retries - Number of retry attempts (default: 1)
 * @returns Classification result with template_id, vars, and flags
 * @throws Error if classification fails after retries
 */
export async function classifyEmail(
  emailBody: string,
  meta?: EmailMeta,
  retries: number = 1
): Promise<ClassificationResult> {
  const userContent = JSON.stringify({
    latest_message: emailBody,
    meta: meta || {},
  });

  const messages = [
    {
      role: 'system' as const,
      content: SYSTEM_PROMPT,
    },
    {
      role: 'user' as const,
      content: userContent,
    },
  ];

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await openaiClient.post('/chat/completions', {
        model: 'gpt-4o-mini', // Using gpt-4o-mini as specified by client
        messages: messages,
        temperature: 0.3, // Lower temperature for more consistent classification
        response_format: { type: 'json_object' }, // Force JSON output
      });

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content in OpenAI response');
      }

      // Parse JSON response
      const classification = JSON.parse(content) as ClassificationResult;

      // Validate required fields
      if (!classification.template_id || !classification.flags) {
        throw new Error('Invalid classification structure');
      }

      // Ensure flags object has all required keys
      const flags = {
        unsubscribe: classification.flags.unsubscribe ?? false,
        abuse: classification.flags.abuse ?? false,
        bounce: classification.flags.bounce ?? false,
        wants_more_info: classification.flags.wants_more_info ?? false,
        needs_human: classification.flags.needs_human ?? false,
        contact_info_provided: classification.flags.contact_info_provided ?? false,
      };

      return {
        template_id: classification.template_id,
        vars: classification.vars || {},
        flags: flags,
      };
    } catch (error: any) {
      lastError = error;
      
      // If it's a parsing error or validation error, don't retry
      if (error.message?.includes('Invalid') || error.message?.includes('parse')) {
        throw error;
      }

      // If it's the last attempt, throw the error
      if (attempt === retries) {
        if (axios.isAxiosError(error)) {
          throw new Error(
            `OpenAI API error: ${error.response?.status} - ${error.response?.statusText || error.message}`
          );
        }
        throw error;
      }

      // Wait before retrying (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s...
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Classification failed');
}