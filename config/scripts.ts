/**
 * Response template scripts configuration
 * Contains all 13 predefined response templates matching OpenAI classification
 */

/**
 * Interface for template variables
 */
export interface TemplateVars {
  role?: string;
  location?: string;
  role1?: string;
  role2?: string;
  company_name?: string;
  contact_email?: string;
  contact_name?: string;
  [key: string]: string | undefined;
}

export interface TemplateFlags {
  unsubscribe?: boolean;
  contact_info_provided?: boolean;
}

/**
 * Template function type
 */
type TemplateFunction = (vars: TemplateVars, flags?: TemplateFlags) => string;

/**
 * Template scripts object - maps template_id to script function
 */
export const TPL: Record<string, TemplateFunction> = {
  /**
   * 1. INTERESTED - When They're Interested
   */
  INTERESTED: (vars: TemplateVars) => {
    // Handle role and location for the question
    // Priority: role (explicit) > role1 (inferred) > role2 (inferred) > default
    const role = vars.role || vars.role1;
    const role2 = vars.role2;
    const location = vars.location ? ` in ${vars.location}` : '';
    
    // Build the role question part
    let roleQuestion = '';
    
    // If we have both role1 and role2 (inferred roles), ask about both
    if (role && role2 && role !== role2) {
      roleQuestion = `Also, is this for the ${role}${location}, or the ${role2}${location}?`;
    }
    // If we have a single role (explicit or inferred)
    else if (role) {
      if (location) {
        roleQuestion = `Also, is this for the ${role}${location}, or are there any other positions you're hiring for right now?`;
      } else {
        roleQuestion = `Also, is this for the ${role}, or are there any other positions you're hiring for right now?`;
      }
    }
    // If no role information at all
    else {
      roleQuestion = `Also, are there any other positions you're hiring for right now?`;
    }
    
    return `Great — happy to get those over to you.

Just so you have everything upfront: our terms are a flat 10% of the first year's salary with a full 6-month replacement guarantee.

I'll send over the agreement for e-signature first so we can include full candidate details without redactions. Any questions before I send?

${roleQuestion}`;
  },

  /**
   * 2. YES_SEND - When They Say "Yes," "Sure," "Send," etc.
   */
  YES_SEND: (vars: TemplateVars) => {
    return `Perfect — I've sent the agreement over now for e-signature.

Once that's in place, we'll be able to share full candidate details without redactions and keep things moving quickly.

If anyone else (HR, hiring manager, or a co-founder) needs to be looped in for future updates, feel free to reply here and I'll include them.`;
  },

  /**
   * 3. NO_JOB_POST - When There's No Job Post
   */
  NO_JOB_POST: (vars: TemplateVars) => {
    const role1 = vars.role1 || 'the role';
    const role2 = vars.role2 || 'similar positions';
    
    return `Thanks for the reply — sounds like we may have crossed wires.

We're happy to send strong candidates for review — no pressure.

Our terms are a simple 10% fee with a 6-month guarantee.

Based on companies your size, these roles seem most likely: ${role1} and ${role2}.

Are those correct? If so, I can send the agreement over.`;
  },

  /**
   * 4. NOT_INTERESTED - When They're Not Interested / Filled the Position
   */
  NOT_INTERESTED: (vars: TemplateVars, flags?: TemplateFlags) => {
    const baseMessage = `Totally understand — and appreciate the quick response.`;

    // If unsubscribe flag is true (e.g., "out of business"), don't ask for agreement
    if (flags?.unsubscribe) {
      return `${baseMessage}

Thanks for letting me know — I won't reach out again.`;
    }

    return `${baseMessage}

If hiring needs shift or a tough role comes up, we're here to help under our 10% / 6-month guarantee model.

Would you like me to send the agreement so you have it on file for future roles?`;
  },

  /**
   * 5. UNSUBSCRIBE - When They Want to Unsubscribe
   * NOTE: This template is NOT used - handler skips reply and marks lead as DNC
   * Kept here for reference only
   */
  UNSUBSCRIBE: (vars: TemplateVars) => {
    // This template is never called - handler returns early for UNSUBSCRIBE
    return `Thanks for letting me know — I won't reach out again.

Before I close this out, would you like me to send our agreement for future reference in case a hard-to-fill role comes up?`;
  },

  /**
   * 6. ASK_AGREEMENT - When They Ask for the Agreement
   */
  ASK_AGREEMENT: (vars: TemplateVars) => {
    return `Absolutely — I've just sent the agreement to this email for e-signature.

If anyone else needs to be included (HR, hiring manager, co-founder), feel free to reply here and I'll add them to future communication.`;
  },

  /**
   * 7. TOO_EXPENSIVE - When They Say It's Too Expensive
   */
  TOO_EXPENSIVE: (vars: TemplateVars) => {
    const role = vars.role || 'these roles';
    
    return `Totally understand — most agencies charge 15–25%, but we keep it simple at 10% with a 6-month guarantee.

Roles like ${role} require deeper vetting, and we focus on sending candidates who are ready to contribute immediately.

If you'd like, I can send the agreement so you can review everything.`;
  },

  /**
   * 8. ROLE_UNCLEAR - When the Role Is Unclear
   */
  ROLE_UNCLEAR: (vars: TemplateVars) => {
    const role = vars.role || 'this position';
    
    return `Thanks for the reply — just to confirm, is this for the ${role} position?

We work at a simple 10% fee with a 6-month guarantee, and we have strong candidates for roles like this.

Would you like me to send the agreement?`;
  },

  /**
   * 9. ALREADY_HAVE_AGENCY - When They Already Have an Agency
   */
  ALREADY_HAVE_AGENCY: (vars: TemplateVars) => {
    return `Totally understand — always good to have trusted partners.

Many clients use us alongside their current agency because we move quickly, stay at 10%, and include a 6-month guarantee.

Open to giving us a shot? If so, I can send the agreement.`;
  },

  /**
   * 10. NOT_HIRING_CONTACT - When They're Not the Hiring Contact (legacy - kept for backward compatibility)
   */
  NOT_HIRING_CONTACT: (vars: TemplateVars, flags?: TemplateFlags) => {
    // If contact info is already provided, just acknowledge it
    if (flags?.contact_info_provided) {
      const contactName = vars.contact_name ? ` ${vars.contact_name}` : '';
      const contactEmail = vars.contact_email ? ` (${vars.contact_email})` : '';
      
      return `Thanks for the heads-up — appreciate it.

I'll reach out to${contactName}${contactEmail} instead.

We keep things simple at 10% with a 6-month guarantee.

I can send them the agreement to review.`;
    }

    return `Thanks for the heads-up — appreciate it.

We keep things simple at 10% with a 6-month guarantee.

Would you mind connecting me with the correct hiring contact?

I can send them the agreement to review.`;
  },

  /**
   * 10a. WRONG_PERSON_WITH_CONTACT - When They're Not the Right Person and Provide Valid Contact Info
   */
  WRONG_PERSON_WITH_CONTACT: (vars: TemplateVars) => {
    const contactName = vars.contact_name ? ` ${vars.contact_name}` : '';
    const contactEmail = vars.contact_email ? ` (${vars.contact_email})` : '';
    
    return `Thanks for the heads-up — really appreciate it.

I'll reach out to${contactName}${contactEmail} and keep you copied so you're in the loop.

If there's anyone else who should be included on hiring conversations, feel free to let me know.`;
  },

  /**
   * 10b. WRONG_PERSON_NO_CONTACT - When They're Not the Right Person and No Contact Info Provided
   * Note: This template should NOT be used (handler skips reply), but kept for completeness
   */
  WRONG_PERSON_NO_CONTACT: (vars: TemplateVars) => {
    // This template should not be used - handler skips reply for this case
    // But kept here for reference
    return `Thanks for the heads-up — would you mind CC'ing me or sharing the best contact for hiring instead?

Happy to reach out to them directly if easier and keep you copied so you're in the loop.`;
  },

  /**
   * 11. LINK_TO_APPLY - When They Give a Link to Apply
   */
  LINK_TO_APPLY: (vars: TemplateVars) => {
    return `Thanks for sharing this — just to clarify, we're a recruiting partner that sources and vets candidates for our clients.

We can't use an external apply link unless we have an agreement in place.

Our terms are a simple 10% fee with a 6-month guarantee.

If it makes sense, I can send the agreement over.`;
  },

  /**
   * 12. FEES_QUESTION - When They Ask if There Are Fees
   */
  FEES_QUESTION: (vars: TemplateVars) => {
    const role = vars.role || vars.role1;
    const positionInfo = role ? `\n\nJust to confirm, is this for the ${role} position?` : '';
    
    return `Great question — we only charge if you hire someone we present.

It's a simple 10% contingency model with a 6-month replacement guarantee.

No upfront fees.${positionInfo}

Would you like me to send the agreement?`;
  },

  /**
   * 13. PERCENT_TOO_HIGH - When They Say the Percentage Is Too High
   */
  PERCENT_TOO_HIGH: (vars: TemplateVars) => {
    return `Totally understand — here's why we stay at 10%:

Most agencies charge 15–25%
We send vetted candidates, not volume
You get a U.S.-based recruiting team
Includes a 6-month replacement guarantee

If you're open to it, I can send the agreement so you can review everything.`;
  },

  /**
   * 14. SKEPTICAL - When They Express Skepticism About the Email
   */
  SKEPTICAL: (vars: TemplateVars) => {
    const role1 = vars.role1 || vars.role || 'the role';
    const role2 = vars.role2;
    const rolesMentioned = role2 ? ` (or both positions you mentioned)` : '';
    
    return `Thanks for the reply — totally understandable question.

Yes, we reached out proactively because we regularly place roles in the Pacific Northwest as well, and we only reach out when we actually have screened candidates ready to share.

We don't spam lists — we only message companies where we believe we can add value.

If you want, I can send over the candidate details${rolesMentioned}.

Would you like me to send the agreement so we can share the full resumes without redactions?`;
  },

  /**
   * 15. ROLE_CLARIFICATION_MULTI - When They Explicitly List Multiple Roles
   */
  ROLE_CLARIFICATION_MULTI: (vars: TemplateVars) => {
    const role1 = vars.role1 || vars.role || 'the first role';
    const role2 = vars.role2 || 'the second role';
    
    return `Appreciate the clarity — thank you.

We can support both roles.

For ${role1}, we have strong candidates ready to share.

For ${role2}, we have strong candidates ready to share.

We keep things simple: flat 10% fee and a 6-month guarantee.

If you'd like me to send the agreement, I can share the full resumes without redactions.`;
  },

  /**
   * 16. GEO_CONCERN - When They Express Geographic Concerns
   */
  GEO_CONCERN: (vars: TemplateVars) => {
    const location = vars.location || 'your area';
    
    return `Totally fair question.

Yes — the candidates we're reaching out about are local to ${location}.

We only open conversations when we already have people screened and available.

If you'd like, I can send the agreement so we can share full details without redactions.`;
  },
};

/**
 * Get script for a template ID with variable substitution
 * @param templateId - Template identifier
 * @param vars - Variables to substitute in the script
 * @param flags - Optional flags for conditional template logic
 * @returns Formatted email text
 */
export function getScript(templateId: string, vars: TemplateVars = {}, flags?: TemplateFlags): string {
  const template = TPL[templateId];
  
  if (!template) {
    throw new Error(`Unknown template_id: ${templateId}`);
  }
  
  return template(vars, flags);
}

/**
 * Get follow-up email text after agreement is sent
 * @returns Follow-up email text
 */
export function getFollowUpEmailText(): string {
  return `Ok great, we just sent you the agreement via Signwell, feel free to reach out with any questions.`;
}

/**
 * Templates that automatically send agreements
 */
export const AUTO_SEND_TEMPLATES = new Set<string>(['YES_SEND', 'ASK_AGREEMENT']);

/**
 * Check if template requires e-signature
 * @param templateId - Template identifier
 * @returns true if template requires e-signature
 */
export function requiresESignature(templateId: string): boolean {
  return AUTO_SEND_TEMPLATES.has(templateId);
}
