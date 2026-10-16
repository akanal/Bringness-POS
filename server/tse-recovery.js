// Read-only recovery classification. Never retries an ambiguous hardware action.
export function classifyTseRecovery(transaction, now = new Date(), staleAfterMs = 5 * 60 * 1000) {
  if (!transaction || typeof transaction !== 'object') throw new TypeError('Transaction required');
  const state = String(transaction.state || '');
  if (state === 'signed') return { action: 'none', reason: 'already_signed' };
  if (state === 'needs_review') return { action: 'manual_review', reason: 'outcome_unconfirmed' };
  if (state === 'failed') return { action: 'manual_review', reason: 'failed' };
  if (state === 'prepared') return { action: 'normal_queue', reason: 'not_claimed' };
  if (state === 'starting' || state === 'finishing' || state === 'started') {
    const updated = Date.parse(transaction.updated_at || transaction.updatedAt || '');
    if (!Number.isFinite(updated)) return { action: 'manual_review', reason: 'unknown_timestamp' };
    const ageMs = now.getTime() - updated;
    if (ageMs < staleAfterMs) return { action: 'wait', reason: 'possibly_in_progress' };
    return { action: 'manual_review', reason: 'stale_ambiguous_state' };
  }
  return { action: 'manual_review', reason: 'unknown_state' };
}
