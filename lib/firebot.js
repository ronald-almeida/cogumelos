/**
 * Integration intentionally fails closed.
 * The supplied official documentation redirects to an authenticated login.
 * Replace this adapter only after verifying its official API contract, required
 * customer fields, idempotency, signed webhooks and server-side status lookup.
 * An API key alone MUST NOT enable charges. No guessed provider URLs or payloads.
 */
export function isPaymentAvailable() { return false; }
export async function createPayment() { throw new Error('FIREBOT_INTEGRATION_PENDING'); }
export async function getPaymentStatus() { throw new Error('FIREBOT_INTEGRATION_PENDING'); }
