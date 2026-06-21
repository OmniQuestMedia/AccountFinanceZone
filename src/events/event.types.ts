import { randomUUID } from 'crypto';

export type FinanceEventType =
  | 'PaymentProcessed'
  | 'PayoutIssued'
  | 'PayoutSettled'
  | 'PayoutFailed'
  | 'RefundInitiated'
  | 'ChargebackRegistered'
  | 'FraudFlagRaised'
  | 'payout.requested'
  | 'payout.settled'
  | 'theatre.block.settled'
  | 'PromotionalCreditIssued';

/**
 * Canonical source system identifier stamped on every published event so
 * consumer zones (Rewards, Marketplace, OKIB, Compliance) can attribute and
 * route events without parsing the transport envelope.
 */
export const EVENT_SOURCE = 'AccountFinanceZone' as const;

/**
 * Schema version for the FinanceEvent contract. Bumped only on
 * backward-incompatible changes to event shape. Additive optional fields do
 * NOT bump this. Consumers should accept unknown fields (forward-compatible).
 */
export const EVENT_CONTRACT_VERSION = '1.1' as const;

export interface FinanceEvent<TPayload = Record<string, unknown>> {
  type: FinanceEventType;
  aggregateId: string;
  payload: TPayload;
  emittedAt: string;

  // --- Envelope metadata (additive, backward-compatible) ---
  // Stamped centrally by EventPublisher when not provided by the caller.

  /**
   * Globally unique identifier for this event instance. Consumers MUST use
   * this as the idempotency key when processing at-least-once deliveries.
   */
  eventId?: string;

  /** Schema version of the event contract. See EVENT_CONTRACT_VERSION. */
  eventVersion?: string;

  /** Originating system. Always {@link EVENT_SOURCE} for events from this zone. */
  source?: typeof EVENT_SOURCE;

  /**
   * Correlation identifier that ties this event back to the originating
   * request / upstream event (e.g. the auditTraceId or sourceEventId).
   */
  correlationId?: string;
}

/**
 * Stamp an event with envelope metadata if the caller did not supply it.
 * Idempotent for already-enriched events (preserves an existing eventId so a
 * republish carries the same identity and consumers de-duplicate correctly).
 */
export function enrichFinanceEvent(event: FinanceEvent): FinanceEvent {
  return {
    ...event,
    eventId: event.eventId ?? `evt_${randomUUID()}`,
    eventVersion: event.eventVersion ?? EVENT_CONTRACT_VERSION,
    source: event.source ?? EVENT_SOURCE,
  };
}

/**
 * Factory for constructing a fully-formed, enriched FinanceEvent. Preferred
 * entry point for new producers — guarantees a stable eventId at creation time.
 */
export function createFinanceEvent<TPayload = Record<string, unknown>>(input: {
  type: FinanceEventType;
  aggregateId: string;
  payload: TPayload;
  emittedAt?: string;
  correlationId?: string;
}): FinanceEvent<TPayload> {
  return {
    type: input.type,
    aggregateId: input.aggregateId,
    payload: input.payload,
    emittedAt: input.emittedAt ?? new Date().toISOString(),
    correlationId: input.correlationId,
    eventId: `evt_${randomUUID()}`,
    eventVersion: EVENT_CONTRACT_VERSION,
    source: EVENT_SOURCE,
  };
}
