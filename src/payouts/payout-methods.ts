/**
 * Canonical set of supported creator payout methods.
 *
 * Single source of truth shared by payout request submission and payout
 * preference validation. Previously this list was duplicated in both
 * payout-request.service.ts and creator-payout-preference.service.ts, which
 * risked the two validation paths silently drifting apart.
 */
export type PayoutMethod =
  | 'DIRECT_DEPOSIT'
  | 'E_TRANSFER'
  | 'WIRE_TRANSFER'
  | 'CHECK_BY_MAIL'
  | 'CRYPTO_NOWPAYMENTS';

export const VALID_PAYOUT_METHODS: ReadonlySet<PayoutMethod> = new Set<PayoutMethod>([
  'DIRECT_DEPOSIT',
  'E_TRANSFER',
  'WIRE_TRANSFER',
  'CHECK_BY_MAIL',
  'CRYPTO_NOWPAYMENTS',
]);

export function isValidPayoutMethod(method: string): method is PayoutMethod {
  return VALID_PAYOUT_METHODS.has(method as PayoutMethod);
}
