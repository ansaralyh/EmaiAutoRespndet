/* eslint-disable no-useless-escape */
export type TemplateId =
  | "YES_SEND"
  | "ASK_AGREEMENT"
  | "ASK_FEES_ONLY"
  | "INTERESTED"
  | "NOT_INTERESTED"
  | "UNSUBSCRIBE"
  | "OUT_OF_OFFICE"
  | "AUTO_REPLY_BLANK"
  | "UNCLASSIFIED"
  | "DONE_ALL_SET"
  | "WANTS_RESUME_FIRST"
  | "WANTS_CALL_FIRST"
  | "SKEPTICAL"
  | "ROLE_CLARIFICATION_MULTI"
  | "WRONG_PERSON_WITH_CONTACT"
  | "WRONG_PERSON_NO_CONTACT"
  | string;

export type Signal =
  | "explicit_yes"
  | "send_it"
  | "send_agreement"
  | "asks_for_agreement"
  | "asks_fees"
  | "interested"
  | "has_question"
  | "multi_topic"
  | "wants_resume_first"
  | "wants_call_first"
  | "skeptical"
  | "role_ambiguous"
  | "multiple_roles"
  | "wrong_person"
  | "out_of_office"
  | "auto_reply_blank"
  | "unsubscribe"
  | "not_interested"
  | "done_all_set"
  | "already_signed";

export type Classification = {
  template_id: TemplateId;
  signals?: Signal[];
  extracted?: {
    role?: string | null;
    new_contact_email?: string | null;
  };
};

export type ThreadState = {
  autoRepliesSent: number;
  agreementSent: boolean;
  manualOwner: boolean;
  lastTemplateSent?: string | null;
  processedMessageIds?: Set<string>;
};

export type ConfidenceDecision = {
  okToAutoRespond: boolean;
  confidence: number;
  blockingReasons: string[];
  normalizedSignals: Signal[];
  effectiveTemplateId: TemplateId;
};

/** ---- Regex helpers (hard signals computed in code) ---- */
const RX = {
  sendAgreement: /(send|share).{0,20}(agreement|contract|docusign|signwell|e-?sign)/i,
  asksForAgreement: /(can you|could you|please|pls).{0,10}(send|share).{0,20}(agreement|contract)/i,
  sendIt: /(send it|send over|shoot it over|go ahead and send)/i,
  explicitYes: /^(yes|yep|yeah|sure|ok|okay|sounds good|go ahead|send it|send|go for it)\b/i,
  explicitNo: /\b(no|nope|not interested|don't need|not looking|not hiring|we're not|we aren't|not right now|not at this time)\b/i,
  asksFees: /(fee|fees|charge|pricing|cost|percent|percentage|%)/i,
  wantsResumeFirst: /(send (the )?resume|see (the )?resume|resume first|before (we )?sign|show me (the )?candidates first|profiles first|blind resume|send (the )?candidates|see (the )?candidates|show (me )?(the )?candidates|want to see (the )?resume|want to see (the )?candidates|review (the )?candidates|review (the )?resume)/i,
  wantsCallFirst: /(call|phone|talk|schedule|meeting|zoom|teams|monday|tuesday|wednesday|thursday|friday|get with me|touch base|connect|reach out|set up (a )?time|when can we|let'?s (talk|connect|discuss)|i'?d like to (talk|discuss|connect))/i,
  skeptical: /(cold email|is this legit|spam|do you actually|bot|ai|automation|you('re| are) in florida|mass email|don'?t know (you|us)|never heard of (you|us)|who are (you|y'?all)|what is this about|why are you contacting me|why did you email me)/i,
  unsubscribe: /(unsubscribe|remove me|stop emailing|do not contact|opt out|no more emails)/i,
  ooo: /(out of office|ooo|automatic reply|auto-?reply|vacation|away from the office|i'?m (currently )?out|will return|will respond (upon|when) (my )?return|currently unavailable|i will be away|i am currently out|out until|back on|returning on|away until)/i,
  doneAllSet: /\b(all set|we'?re all set|we'?re good|we'?re covered|no need|good for now)\b/i,
  wrongPerson: /(wrong person|not the right person|not the hiring manager|please contact|reach out to)/i,
  alreadySigned: /(already signed|signed it|signed the agreement|completed (the )?agreement|already completed|i signed|we signed|just signed)/i,
};

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function uniqueSignals(list: Signal[]): Signal[] {
  return Array.from(new Set(list));
}

/** Normalize signals using BOTH model signals and deterministic regex detection */
export function normalizeSignals(input: {
  bodyText: string;
  modelSignals?: Signal[];
}): Signal[] {
  const text = (input.bodyText || "").trim();
  const lower = text.toLowerCase();
  const sigs: Signal[] = [];

  // model-provided signals (optional)
  if (input.modelSignals?.length) sigs.push(...input.modelSignals);

  // deterministic signals
  if (RX.unsubscribe.test(lower)) sigs.push("unsubscribe");
  if (RX.ooo.test(lower)) sigs.push("out_of_office");
  if (!text || text.length < 2) sigs.push("auto_reply_blank");
  if (text.includes("?")) sigs.push("has_question");
  if (RX.sendAgreement.test(text)) sigs.push("send_agreement");
  if (RX.asksForAgreement.test(text)) sigs.push("asks_for_agreement");
  if (RX.sendIt.test(text)) sigs.push("send_it");
  if (RX.explicitYes.test(text)) sigs.push("explicit_yes");
  if (RX.explicitNo.test(text)) sigs.push("not_interested");
  if (RX.asksFees.test(text)) sigs.push("asks_fees");
  if (RX.wantsResumeFirst.test(text)) sigs.push("wants_resume_first");
  if (RX.wantsCallFirst.test(text)) sigs.push("wants_call_first");
  if (RX.skeptical.test(text)) sigs.push("skeptical");
  if (RX.doneAllSet.test(text)) sigs.push("done_all_set");
  if (RX.wrongPerson.test(text)) sigs.push("wrong_person");
  if (RX.alreadySigned.test(text)) sigs.push("already_signed");

  // crude multi-topic detector: multiple strong intents in one message
  const strongIntents =
    (RX.sendAgreement.test(text) ? 1 : 0) +
    (RX.asksFees.test(text) ? 1 : 0) +
    (RX.wantsResumeFirst.test(text) ? 1 : 0) +
    (RX.wantsCallFirst.test(text) ? 1 : 0) +
    (RX.skeptical.test(text) ? 1 : 0);
  if (strongIntents >= 2) sigs.push("multi_topic");

  return uniqueSignals(sigs);
}

/** Which template_ids are eligible for auto-response at all */
export const AUTO_INTENT_WHITELIST = new Set<TemplateId>([
  "YES_SEND",
  "ASK_AGREEMENT",
  "ASK_FEES_ONLY",
  "INTERESTED",
  "NOT_INTERESTED",
  "NOT_HIRING",
  "NO_JOB_POST",
  "ROLE_UNCLEAR",
  "ASKING_WHICH_ROLE",
  "ROLE_CONFIRMED_FOLLOWUP",
  "FEES_QUESTION",
  "ASK_WEBSITE",
  "ROLE_CLARIFICATION_MULTI",
  "GEO_CONCERN",
  "LINK_TO_APPLY",
  "ASK_COMPANY",
  "ASK_EXPERIENCE",
  "ASK_SALARY",
  "ASK_SOURCE",
  "FORWARD_TO_TEAM",
  "CHECK_WITH_HR",
  "CONFUSED_MESSAGE",
  "THANK_YOU",
  "SINGLE_QUESTION_MARK",
  "HYBRID_WORK",
  "PDF_FORMAT",
  "WILL_FORWARD",
  // UNSUBSCRIBE is special: no reply
]);

/** After 1 auto-reply, only these are allowed to auto-process again */
export const DEPTH_WHITELIST = new Set<TemplateId>([
  "YES_SEND",
  "ASK_AGREEMENT",
  "NOT_INTERESTED",
  "UNSUBSCRIBE",
  "DONE_ALL_SET",
]);

/** Base scores by template */
const BASE: Record<string, number> = {
  YES_SEND: 0.85, // Increased - send agreements at any cost
  ASK_AGREEMENT: 0.85, // Increased - send agreements at any cost
  ASK_FEES_ONLY: 0.65,
  INTERESTED: 0.60,
  NOT_INTERESTED: 0.75,
  NOT_HIRING: 0.65,
  NO_JOB_POST: 0.60,
  ROLE_UNCLEAR: 0.55,
  ASKING_WHICH_ROLE: 0.60,
  ROLE_CONFIRMED_FOLLOWUP: 0.70,
  FEES_QUESTION: 0.65,
  ASK_WEBSITE: 0.60,
  ROLE_CLARIFICATION_MULTI: 0.55,
  GEO_CONCERN: 0.55,
  LINK_TO_APPLY: 0.50,
  ASK_COMPANY: 0.60,
  ASK_EXPERIENCE: 0.60,
  ASK_SALARY: 0.60,
  ASK_SOURCE: 0.60,
  FORWARD_TO_TEAM: 0.60,
  CHECK_WITH_HR: 0.60,
  CONFUSED_MESSAGE: 0.60,
  THANK_YOU: 0.60,
  SINGLE_QUESTION_MARK: 0.60,
  HYBRID_WORK: 0.60,
  PDF_FORMAT: 0.60,
  WILL_FORWARD: 0.60,
};

/** Score contributions */
const ADD = {
  send_agreement: 0.50, // Increased - send agreements at any cost
  asks_for_agreement: 0.50, // Increased - send agreements at any cost
  send_it: 0.30, // Increased
  explicit_yes: 0.30, // Increased
  interested: 0.2,
  asks_fees: 0.25,
  short_msg: 0.05,
  first_auto_reply: 0.05,
  no_question_mark: 0.05,
};

const SUB = {
  has_question: 0.15,
  multi_topic: 0.25,
  wants_resume_first: 0.6,
  wants_call_first: 0.6,
  skeptical: 0.5,
  role_ambiguous: 0.25,
  multiple_roles: 0.4,
  wrong_person: 0.7,
  auto_reply_blank: 0.5,
  already_signed: 0.8,
};

function has(sigs: Signal[], s: Signal): boolean {
  return sigs.includes(s);
}

/**
 * Main decision: compute confidence and whether it's safe to auto-respond.
 * Note: This does NOT send anything; it just returns a decision.
 */
export function decideAutoRespond(input: {
  classification: Classification;
  bodyText: string;
  threadState: ThreadState;
  messageId?: string;
  confidenceThreshold?: number; // default 0.70
}): ConfidenceDecision {
  const template_id = input.classification.template_id as TemplateId;
  const sigs = normalizeSignals({
    bodyText: input.bodyText,
    modelSignals: input.classification.signals,
  });
  const blocking: string[] = [];
  
  // PRIORITY: Send agreements at any cost - lower threshold for agreement requests
  const isAgreementRequest = template_id === "YES_SEND" || template_id === "ASK_AGREEMENT" || 
                             has(sigs, "send_agreement") || has(sigs, "asks_for_agreement");
  const threshold = isAgreementRequest ? 0.60 : (input.confidenceThreshold ?? 0.7); // Lower threshold for agreement requests

  // Hard stops (no reply)
  if (has(sigs, "unsubscribe") || template_id === "UNSUBSCRIBE") {
    return {
      okToAutoRespond: false,
      confidence: 1,
      blockingReasons: ["UNSUBSCRIBE: hard stop (mark DNC, no reply)"],
      normalizedSignals: sigs,
      effectiveTemplateId: "UNSUBSCRIBE",
    };
  }

  if (has(sigs, "out_of_office") || template_id === "OUT_OF_OFFICE") {
    return {
      okToAutoRespond: false,
      confidence: 1,
      blockingReasons: ["OUT_OF_OFFICE: hard stop (no reply)"],
      normalizedSignals: sigs,
      effectiveTemplateId: "OUT_OF_OFFICE",
    };
  }

  if (has(sigs, "auto_reply_blank") || template_id === "AUTO_REPLY_BLANK") {
    return {
      okToAutoRespond: false,
      confidence: 1,
      blockingReasons: ["AUTO_REPLY_BLANK: hard stop (no reply)"],
      normalizedSignals: sigs,
      effectiveTemplateId: "AUTO_REPLY_BLANK",
    };
  }

  if (has(sigs, "done_all_set") || template_id === "DONE_ALL_SET") {
    return {
      okToAutoRespond: false,
      confidence: 1,
      blockingReasons: ["DONE_ALL_SET: stop automation (no reply recommended)"],
      normalizedSignals: sigs,
      effectiveTemplateId: "DONE_ALL_SET",
    };
  }

  // Hard stop: If agreement already sent, STOP ALL automation
  // Client requirement: "automation should stop completely after agreement is sent"
  if (input.threadState.agreementSent) {
    return {
      okToAutoRespond: false,
      confidence: 1,
      blockingReasons: ["agreementSent=true: automation stopped completely after agreement sent"],
      normalizedSignals: sigs,
      effectiveTemplateId: template_id,
    };
  }

  // Manual override
  if (input.threadState.manualOwner) {
    blocking.push("manualOwner=true (human took over thread)");
  }

  // Depth rule: Stop after 2 auto-replies (client requirement: "after 2 messages or more")
  // Only allow whitelisted templates after 2 replies
  if (input.threadState.autoRepliesSent >= 2 && !DEPTH_WHITELIST.has(template_id)) {
    blocking.push("depthLimit: autoRepliesSent>=2 and template not whitelisted");
  }

  // Duplicate message id
  if (input.messageId && input.threadState.processedMessageIds?.has(input.messageId)) {
    blocking.push("duplicateMessageId: already processed");
  }

  // Duplicate template back-to-back
  if (input.threadState.lastTemplateSent && input.threadState.lastTemplateSent === template_id) {
    blocking.push("duplicateTemplate: same template already sent last");
  }

  // Not eligible for auto-response
  if (!AUTO_INTENT_WHITELIST.has(template_id)) {
    blocking.push(`templateNotAutoEligible: ${template_id}`);
  }

  // Agreement safety constraints (even before scoring)
  // PRIORITY: Send agreements at any cost - only block if they explicitly want resume/call first AND NOT explicitly asking for agreement
  // If they explicitly ask for agreement, send it even if they mention wanting resume/call first
  const explicitlyAskingForAgreement = has(sigs, "send_agreement") || has(sigs, "asks_for_agreement") || 
                                        template_id === "YES_SEND" || template_id === "ASK_AGREEMENT";
  
  if (has(sigs, "wants_resume_first") && !explicitlyAskingForAgreement) {
    blocking.push("wants_resume_first (manual)");
  }
  if (has(sigs, "wants_call_first") && !explicitlyAskingForAgreement) {
    blocking.push("wants_call_first (manual)");
  }
  if (has(sigs, "skeptical") && !explicitlyAskingForAgreement) {
    blocking.push("skeptical (manual)");
  }
  if (has(sigs, "wrong_person")) blocking.push("wrong_person (manual)");

  // Score
  let score = BASE[template_id] ?? 0;

  // adds
  if (has(sigs, "send_agreement")) score += ADD.send_agreement;
  if (has(sigs, "asks_for_agreement")) score += ADD.asks_for_agreement;
  if (has(sigs, "send_it")) score += ADD.send_it;
  if (has(sigs, "explicit_yes")) score += ADD.explicit_yes;
  if (has(sigs, "interested")) score += ADD.interested;
  if (has(sigs, "asks_fees") && template_id === "ASK_FEES_ONLY") score += ADD.asks_fees;
  const trimmed = (input.bodyText || "").trim();
  if (trimmed.length > 0 && trimmed.length < 200) score += ADD.short_msg;
  if (input.threadState.autoRepliesSent === 0) score += ADD.first_auto_reply;
  if (!has(sigs, "has_question")) score += ADD.no_question_mark;

  // penalties
  if (has(sigs, "has_question")) score -= SUB.has_question;
  if (has(sigs, "multi_topic")) score -= SUB.multi_topic;
  if (has(sigs, "wants_resume_first")) score -= SUB.wants_resume_first;
  if (has(sigs, "wants_call_first")) score -= SUB.wants_call_first;
  if (has(sigs, "skeptical")) score -= SUB.skeptical;
  if (has(sigs, "role_ambiguous")) score -= SUB.role_ambiguous;
  if (has(sigs, "multiple_roles")) score -= SUB.multiple_roles;
  if (has(sigs, "wrong_person")) score -= SUB.wrong_person;
  if (has(sigs, "auto_reply_blank")) score -= SUB.auto_reply_blank;

  score = clamp01(score);

  // Template-specific must-have rules
  // YES_SEND: require strong agreement-send evidence
  // PRIORITY: Send agreements at any cost - be more lenient
  if (template_id === "YES_SEND") {
    const strong =
      has(sigs, "send_agreement") ||
      has(sigs, "asks_for_agreement") ||
      has(sigs, "send_it") ||
      has(sigs, "explicit_yes");
    if (!strong) blocking.push("YES_SEND requires send_agreement OR asks_for_agreement OR send_it OR explicit_yes");
    // REMOVED: Don't block on questions - if they say yes/send, send it
    // if (has(sigs, "has_question")) blocking.push("YES_SEND blocked: has_question");
  }

  // ASK_AGREEMENT: require explicit agreement request
  // PRIORITY: Send agreements at any cost - be more lenient
  if (template_id === "ASK_AGREEMENT") {
    const ok = has(sigs, "asks_for_agreement") || has(sigs, "send_agreement") || has(sigs, "send_it");
    if (!ok) blocking.push("ASK_AGREEMENT requires asks_for_agreement or send_agreement or send_it");
  }

  // ASK_FEES_ONLY: require fees question
  if (template_id === "ASK_FEES_ONLY") {
    if (!has(sigs, "asks_fees")) blocking.push("ASK_FEES_ONLY requires asks_fees");
  }

  // INTERESTED: block only if multi-topic (questions are OK now)
  if (template_id === "INTERESTED") {
    if (has(sigs, "multi_topic")) blocking.push("INTERESTED blocked: multi_topic (manual)");
  }

  // Note: Agreement sent check is now handled earlier as a hard stop (above)
  // This ensures ALL automation stops after agreement is sent, not just YES_SEND/ASK_AGREEMENT

  const okToAuto = blocking.length === 0 && score >= threshold;

  return {
    okToAutoRespond: okToAuto,
    confidence: score,
    blockingReasons: okToAuto ? [] : blocking,
    normalizedSignals: sigs,
    effectiveTemplateId: template_id,
  };
}

