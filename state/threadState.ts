/**
 * In-memory state management using Map
 * Tracks:
 * - Processed message_ids (duplicate detection)
 * - Thread loop counters (for MORE_INFO template)
 * - Unsubscribed leads (Do Not Contact list)
 * - Auto-replies sent per thread (for thread-level stop rule)
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
 * Get statistics about current state
 * Useful for monitoring and debugging
 */
export function getStateStats(): {
  processedCount: number;
  activeThreads: number;
  threadsWithLastTemplate: number;
  unsubscribedCount: number;
  threadsWithAutoReplies: number;
} {
  return {
    processedCount: processedMessages.size,
    activeThreads: threadLoopCounters.size,
    threadsWithLastTemplate: lastTemplateIds.size,
    unsubscribedCount: unsubscribedLeads.size,
    threadsWithAutoReplies: autoRepliesSent.size,
  };
}