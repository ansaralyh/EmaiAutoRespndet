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
    // Handle role: use role if available, otherwise use role1/role2, or default
    let role1 = vars.role || vars.role1 || 'this';
    let role2 = vars.role2 || (vars.location ? `${vars.role || vars.role1 || 'this'} ${vars.location}` : null);
    
    // If we have location but no role2, create role2 with location
    if (!role2 && vars.location && vars.role) {
      role2 = `${vars.role} ${vars.location}`;
    }
    
    // If we still don't have role2, use role1 with location or just a different phrasing
    if (!role2) {
      if (vars.location) {
        role2 = `${role1} ${vars.location}`;
      } else {
        // If no location, ask about the role vs similar positions
        role2 = 'similar positions';
      }
    }
    
    // Ensure role1 and role2 are different
    if (role1 === role2) {
      role2 = 'similar positions';
    }
    
    // Fix "position position" bug: Don't add " position" if role2 already contains "position" or "positions"
    const role1Text = role1.includes('position') ? role1 : `${role1} position`;
    const role2Text = role2.includes('position') || role2.includes('positions') ? role2 : `${role2} position`;
    
    // Fix "the this" grammar: Use "this" without "the" when role1 is "this"
    const role1Prefix = role1 === 'this' ? '' : 'the ';
    const role2Prefix = role2 === 'similar positions' ? '' : 'the ';
    
    return `Great — happy to get those over to you.

Just so you have everything upfront: we work at a flat 10% of first-year base salary with a 6-month replacement guarantee.

Before I send the agreement, is this for ${role1Prefix}${role1Text} or ${role2Prefix}${role2Text}?`;
  },

  /**
   * 2. YES_SEND - When They Say "Yes," "Sure," "Send," etc.
   */
  YES_SEND: (vars: TemplateVars) => {
    return `Perfect — here's everything upfront so expectations are clear:

We work at a flat 10% fee with a 6-month replacement guarantee.

Would you like me to send the agreement to this email, or is there a better contact?`;
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
   */
  UNSUBSCRIBE: (vars: TemplateVars) => {
    return `Thanks for letting me know — I won't reach out again.

Before I close this out, would you like me to send our agreement for future reference in case a hard-to-fill role comes up?`;
  },

  /**
   * 6. ASK_AGREEMENT - When They Ask for the Agreement
   */
  ASK_AGREEMENT: (vars: TemplateVars) => {
    return `Absolutely — I can send that over.

I'll send the agreement to this email for e-signature. If there's anyone else (HR, hiring manager, co-founder) who should be included, feel free to reply and I'll loop them in on future communication.`;
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
   * 10. NOT_HIRING_CONTACT - When They're Not the Hiring Contact
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
