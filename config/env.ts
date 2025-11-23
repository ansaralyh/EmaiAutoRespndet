import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Environment configuration interface
 * Ensures type safety for all environment variables
 */
export interface EnvConfig {
  port: number;
  reachinbox: {
    apiKey: string;
    baseUrl: string;
  };
  openai: {
    apiKey: string;
  };
  slack: {
    webhookUrl: string;
  };
  esign: {
    apiKey: string;
    templateId: string;
    senderEmail: string;
  };
}

/**
 * Validates and returns environment configuration
 * Throws error if required variables are missing
 */
function loadConfig(): EnvConfig {
  const port = parseInt(process.env.PORT || '3000', 10);
  
  const requiredVars = {
    REACHINBOX_API_KEY: process.env.REACHINBOX_API_KEY,
    REACHINBOX_BASE_URL: process.env.REACHINBOX_BASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
    ESIGN_API_KEY: process.env.ESIGN_API_KEY,
    ESIGN_TEMPLATE_ID: process.env.ESIGN_TEMPLATE_ID,
    ESIGN_SENDER_EMAIL: process.env.ESIGN_SENDER_EMAIL,
  };

  // Check for missing required variables
  const missingVars = Object.entries(requiredVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}\n` +
      'Please check your .env file or .env.example for reference.'
    );
  }

  return {
    port,
    reachinbox: {
      apiKey: requiredVars.REACHINBOX_API_KEY!,
      baseUrl: requiredVars.REACHINBOX_BASE_URL!,
    },
    openai: {
      apiKey: requiredVars.OPENAI_API_KEY!,
    },
    slack: {
      webhookUrl: requiredVars.SLACK_WEBHOOK_URL!,
    },
    esign: {
      apiKey: requiredVars.ESIGN_API_KEY!,
      templateId: requiredVars.ESIGN_TEMPLATE_ID!,
      senderEmail: requiredVars.ESIGN_SENDER_EMAIL!,
    },
  };
}

// Export singleton config instance
export const config: EnvConfig = loadConfig();