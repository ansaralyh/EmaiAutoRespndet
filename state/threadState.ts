/**
 * In-memory state management using Map
 * Tracks:
 * - Processed message_ids (duplicate detection)
 * - Thread loop counters (for MORE_INFO template)
 * - Unsubscribed leads (Do Not Contact list)
 * - Auto-replies sent per thread (for thread-level stop rule)
 * - Agreement sent status per thread (to prevent duplicate sends)
 */

// Map to store processed message IDs
const processedMessages = new Map<string, boolean>();

// Map to store loop counters per thread ID
const threadLoopCounters = new Map<string, number>();

// Map to store last template_id per thread ID (for repeat detection)
const lastTemplateIds = new Map<string, string>();

// Map to store unsubscribed email addresses (Do Not Contact list)
const unsubscribedLeads = new Map<string, boolean>();

// Map to store auto-replies sent count per thread ID
const autoRepliesSent = new Map<string, number>();

// Map to store agreement sent status per thread ID
const agreementSent = new Map<string, boolean>();

// Map to store manual owner status per thread ID (true if human has taken over)
const manualOwner = new Map<string, boolean>();

// Map to store locked roles per thread ID (array of roles that have been confirmed)
const lockedRoles = new Map<string, string[]>();

// Map to store last sender email per thread ID (active contact)
const lastFrom = new Map<string, string>();

/**
 * Check if a message has already been processed
 * @param messageId - Unique message identifier
 * @returns true if message was already processed, false otherwise
 */
export function isProcessed(messageId: string): boolean {
  return processedMessages.has(messageId);
}

/**
 * Mark a message as processed
 * @param messageId - Unique message identifier
 */
export function markProcessed(messageId: string): void {
  processedMessages.set(messageId, true);
}

/**
 * Increment the loop counter for a thread
 * Used to track how many times MORE_INFO template was used
 * @param threadId - Thread identifier
 * @returns The new loop count after incrementing
 */
export function incrementLoop(threadId: string): number {
  const currentCount = threadLoopCounters.get(threadId) || 0;
  const newCount = currentCount + 1;
  threadLoopCounters.set(threadId, newCount);
  return newCount;
}

/**
 * Get the current loop count for a thread
 * @param threadId - Thread identifier
 * @returns Current loop count (0 if thread not found)
 */
export function getLoopCount(threadId: string): number {
  return threadLoopCounters.get(threadId) || 0;
}

/**
 * Reset loop counter for a thread
 * Useful for cleanup or testing
 * @param threadId - Thread identifier
 */
export function resetThread(threadId: string): void {
  threadLoopCounters.delete(threadId);
}

/**
 * Clear all processed messages
 * Useful for testing or manual cleanup
 */
export function clearProcessedMessages(): void {
  processedMessages.clear();
}

/**
 * Clear all thread loop counters
 * Useful for testing or manual cleanup
 */
export function clearLoopCounters(): void {
  threadLoopCounters.clear();
}

/**
 * Get the last template_id for a thread
 * @param threadId - Thread identifier
 * @returns Last template_id (undefined if thread not found)
 */
export function getLastTemplateId(threadId: string): string | undefined {
  return lastTemplateIds.get(threadId);
}

/**
 * Set the last template_id for a thread
 * @param threadId - Thread identifier
 * @param templateId - Template ID to store
 */
export function setLastTemplateId(threadId: string, templateId: string): void {
  lastTemplateIds.set(threadId, templateId);
}

/**
 * Clear last template_id for a thread
 * Useful for cleanup or testing
 * @param threadId - Thread identifier
 */
export function clearLastTemplateId(threadId: string): void {
  lastTemplateIds.delete(threadId);
}

/**
 * Clear all last template IDs
 * Useful for testing or manual cleanup
 */
export function clearLastTemplateIds(): void {
  lastTemplateIds.clear();
}

/**
 * Mark a lead as unsubscribed (Do Not Contact)
 * @param leadEmail - Email address to mark as unsubscribed
 */
export function markAsUnsubscribed(leadEmail: string): void {
  if (leadEmail) {
    unsubscribedLeads.set(leadEmail.toLowerCase().trim(), true);
  }
}

/**
 * Check if a lead is unsubscribed (Do Not Contact)
 * @param leadEmail - Email address to check
 * @returns true if lead is unsubscribed, false otherwise
 */
export function isUnsubscribed(leadEmail: string | undefined): boolean {
  if (!leadEmail) {
    return false;
  }
  return unsubscribedLeads.has(leadEmail.toLowerCase().trim());
}

/**
 * Clear unsubscribe status for a lead (for testing or manual override)
 * @param leadEmail - Email address to clear
 */
export function clearUnsubscribe(leadEmail: string): void {
  if (leadEmail) {
    unsubscribedLeads.delete(leadEmail.toLowerCase().trim());
  }
}

/**
 * Clear all unsubscribed leads (for testing or manual cleanup)
 */
export function clearUnsubscribedLeads(): void {
  unsubscribedLeads.clear();
}

/**
 * Get the number of auto-replies sent for a thread
 * @param threadId - Thread identifier
 * @returns Number of auto-replies sent (0 if thread not found)
 */
export function getAutoRepliesSent(threadId: string): number {
  return autoRepliesSent.get(threadId) || 0;
}

/**
 * Increment the auto-replies sent counter for a thread
 * @param threadId - Thread identifier
 * @returns The new count after incrementing
 */
export function incrementAutoRepliesSent(threadId: string): number {
  const currentCount = autoRepliesSent.get(threadId) || 0;
  const newCount = currentCount + 1;
  autoRepliesSent.set(threadId, newCount);
  return newCount;
}

/**
 * Reset auto-replies sent counter for a thread (for testing or manual override)
 * @param threadId - Thread identifier
 */
export function resetAutoRepliesSent(threadId: string): void {
  autoRepliesSent.delete(threadId);
}

/**
 * Clear all auto-replies sent counters (for testing or manual cleanup)
 */
export function clearAutoRepliesSent(): void {
  autoRepliesSent.clear();
}

/**
 * Check if agreement has been sent for a thread
 * @param threadId - Thread identifier
 * @returns true if agreement has been sent, false otherwise
 */
export function isAgreementSent(threadId: string): boolean {
  return agreementSent.get(threadId) || false;
}

/**
 * Mark agreement as sent for a thread
 * @param threadId - Thread identifier
 */
export function markAgreementSent(threadId: string): void {
  agreementSent.set(threadId, true);
}

/**
 * Reset agreement sent status for a thread (for testing or manual override)
 * @param threadId - Thread identifier
 */
export function resetAgreementSent(threadId: string): void {
  agreementSent.delete(threadId);
}

/**
 * Clear all agreement sent statuses (for testing or manual cleanup)
 */
export function clearAgreementSent(): void {
  agreementSent.clear();
}

/**
 * Check if thread is owned by manual/human reply
 * @param threadId - Thread identifier
 * @returns true if thread is manually owned, false otherwise
 */
export function isManualOwner(threadId: string): boolean {
  return manualOwner.get(threadId) || false;
}

/**
 * Mark thread as manually owned (human has taken over)
 * @param threadId - Thread identifier
 */
export function markAsManualOwner(threadId: string): void {
  manualOwner.set(threadId, true);
}

/**
 * Reset manual owner status for a thread (for testing or manual override)
 * @param threadId - Thread identifier
 */
export function resetManualOwner(threadId: string): void {
  manualOwner.delete(threadId);
}

/**
 * Clear all manual owner statuses (for testing or manual cleanup)
 */
export function clearManualOwner(): void {
  manualOwner.clear();
}

/**
 * Get locked roles for a thread
 * @param threadId - Thread identifier
 * @returns Array of locked roles (empty array if none)
 */
export function getLockedRoles(threadId: string): string[] {
  return lockedRoles.get(threadId) || [];
}

/**
 * Set locked roles for a thread (when role is clearly stated)
 * @param threadId - Thread identifier
 * @param roles - Array of role names to lock
 */
export function setLockedRoles(threadId: string, roles: string[]): void {
  if (roles && roles.length > 0) {
    lockedRoles.set(threadId, roles);
  }
}

/**
 * Add a role to locked roles for a thread
 * @param threadId - Thread identifier
 * @param role - Role name to add
 */
export function addLockedRole(threadId: string, role: string): void {
  if (role && role.trim()) {
    const current = getLockedRoles(threadId);
    const normalizedRole = role.trim();
    if (!current.includes(normalizedRole)) {
      lockedRoles.set(threadId, [...current, normalizedRole]);
    }
  }
}

/**
 * Reset locked roles for a thread (for testing or manual override)
 * @param threadId - Thread identifier
 */
export function resetLockedRoles(threadId: string): void {
  lockedRoles.delete(threadId);
}

/**
 * Clear all locked roles (for testing or manual cleanup)
 */
export function clearLockedRoles(): void {
  lockedRoles.clear();
}

/**
 * Get last sender email (active contact) for a thread
 * @param threadId - Thread identifier
 * @returns Last sender email (undefined if not found)
 */
export function getLastFrom(threadId: string): string | undefined {
  return lastFrom.get(threadId);
}

/**
 * Set last sender email (active contact) for a thread
 * @param threadId - Thread identifier
 * @param email - Sender email address
 */
export function setLastFrom(threadId: string, email: string): void {
  if (email && email.trim()) {
    lastFrom.set(threadId, email.toLowerCase().trim());
  }
}

/**
 * Reset last sender email for a thread (for testing or manual override)
 * @param threadId - Thread identifier
 */
export function resetLastFrom(threadId: string): void {
  lastFrom.delete(threadId);
}

/**
 * Clear all last sender emails (for testing or manual cleanup)
 */
export function clearLastFrom(): void {
  lastFrom.clear();
}

/**
 * Get statistics about current state
 * Useful for monitoring and debugging
 */
export function getStateStats(): {
  processedCount: number;
  activeThreads: number;
  threadsWithLastTemplate: number;
  unsubscribedCount: number;
  threadsWithAutoReplies: number;
  threadsWithAgreementSent: number;
  threadsWithManualOwner: number;
    threadsWithLockedRoles: number;
    threadsWithLastFrom: number;
} {
  return {
    processedCount: processedMessages.size,
    activeThreads: threadLoopCounters.size,
    threadsWithLastTemplate: lastTemplateIds.size,
    unsubscribedCount: unsubscribedLeads.size,
    threadsWithAutoReplies: autoRepliesSent.size,
    threadsWithAgreementSent: agreementSent.size,
    threadsWithManualOwner: manualOwner.size,
    threadsWithLockedRoles: lockedRoles.size,
    threadsWithLastFrom: lastFrom.size,
  };
}