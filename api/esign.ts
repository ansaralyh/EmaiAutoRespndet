/**
 * SignWell E-Signature service wrapper
 * Function: sendAgreement(data)
 * Used for YES_SEND and ASK_AGREEMENT templates
 * 
 * Template field names:
 * - Name (maps to clientName)
 * - Company (maps to companyName)
 * - Email (maps to clientEmail)
 * - Title (maps to clientTitle)
 * - Text box for adding address (maps to clientAddress)
 * - Date Signed (auto-filled with current date)
 */

import axios, { AxiosInstance } from 'axios';
import { config } from '../config/env';

// Create axios instance for SignWell API
const signwellClient: AxiosInstance = axios.create({
  baseURL: 'https://www.signwell.com/api/v1/',
  headers: {
    'X-Api-Key': config.esign.apiKey,
    'Content-Type': 'application/json',
  },
});

/**
 * Template field API IDs from the template structure
 * These map to the api_id values in the template
 */
const TEMPLATE_FIELD_IDS = {
  Name: 'Name_1', // Using first occurrence
  Company: 'Company_1', // Using first occurrence
  Email: 'Email_1', // Using first occurrence
  Title: 'Title_1', // Using first occurrence
  Address: 'TextField_1', // Text field for address
  DateSigned: 'DateSigned_1', // Using first occurrence
};

/**
 * Interface for agreement recipient data
 */
export interface AgreementData {
  clientEmail: string;
  clientName?: string;
  companyName?: string;
  clientTitle?: string;
  clientAddress?: string;
}

/**
 * Interface for SignWell API response
 */
export interface SignWellResponse {
  id?: string;
  status?: string;
  [key: string]: any;
}

/**
 * Send agreement via SignWell e-signature service
 * @param data - Client information for the agreement
 * @returns SignWell API response with document ID
 * @throws Error if API call fails
 */
export async function sendAgreement(data: AgreementData): Promise<SignWellResponse> {
  try {
    const recipientName = data.clientName || data.companyName || data.clientEmail;

    // Build template_fields array using api_id from template
    const templateFields: any[] = [];
    
    // Add fields only if they have values (except Email which is required)
    if (data.clientName) {
      templateFields.push({
        api_id: TEMPLATE_FIELD_IDS.Name,
        value: data.clientName,
      });
    }
    
    if (data.companyName) {
      templateFields.push({
        api_id: TEMPLATE_FIELD_IDS.Company,
        value: data.companyName,
      });
    }
    
    // Email is required
    templateFields.push({
      api_id: TEMPLATE_FIELD_IDS.Email,
      value: data.clientEmail,
    });
    
    if (data.clientTitle) {
      templateFields.push({
        api_id: TEMPLATE_FIELD_IDS.Title,
        value: data.clientTitle,
      });
    }
    
    if (data.clientAddress) {
      templateFields.push({
        api_id: TEMPLATE_FIELD_IDS.Address,
        value: data.clientAddress,
      });
    }
    
    // DateSigned field is locked and cannot be pre-filled - skip it
    // The date will be auto-filled when the document is signed

    const requestBody = {
      template_id: config.esign.templateId,
      name: 'AlphaHire Contingency Agreement',
      recipients: [
        {
          id: '1', // Client placeholder ID from template
          name: recipientName,
          email: data.clientEmail,
          placeholder_name: 'Client', // Must match template placeholder name
        },
        {
          id: '2', // Document Sender placeholder ID from template
          name: config.esign.senderEmail.split('@')[0] || 'AlphaHire', // Extract name from email
          email: config.esign.senderEmail, // chris@alpha-hire.com
          placeholder_name: 'Document Sender', // Must match template placeholder name
        },
      ],
      template_fields: templateFields,
      draft: false, // Send immediately
    };

    // Log request body for debugging
    console.log('SignWell API Request:', JSON.stringify(requestBody, null, 2));

    const response = await signwellClient.post('/document_templates/documents', requestBody);

    return response.data;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const errorData = error.response?.data;
      const errorMessage = errorData?.message || errorData?.errors || error.message;
      
      // Log full error response for debugging
      console.error('SignWell API Error Response:', JSON.stringify(errorData, null, 2));
      
      throw new Error(
        `SignWell API error: ${statusCode} - ${JSON.stringify(errorMessage) || 'Failed to send agreement'}`
      );
    }
    throw error;
  }
}