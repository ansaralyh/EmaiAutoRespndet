/**
 * In-memory state management using Map
 * Tracks:
 * - Processed message_ids (duplicate detection)
 * - Thread loop counters (for MORE_INFO template)
 */

// Map to store processed message IDs
const processedMessages = new Map<string, boolean>();

// Map to store loop counters per thread ID
const threadLoopCounters = new Map<string, number>();

// Map to store last template_id per thread ID (for repeat detection)
const lastTemplateIds = new Map<string, string>();

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
 * Get statistics about current state
 * Useful for monitoring and debugging
 */
export function getStateStats(): {
  processedCount: number;
  activeThreads: number;
  threadsWithLastTemplate: number;
} {
  return {
    processedCount: processedMessages.size,
    activeThreads: threadLoopCounters.size,
    threadsWithLastTemplate: lastTemplateIds.size,
  };
}