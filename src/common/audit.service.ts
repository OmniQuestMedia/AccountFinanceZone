import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Comprehensive audit service for financial operations.
 *
 * Implements immutable audit trail requirements from OQMI_GOVERNANCE.md:
 * - All financial writes must be audited
 * - Audit trails are replayable
 * - Each entry includes rule_applied_id for governance traceability
 *
 * Audit events are stored in the AuditTrail table with:
 * - aggregateType: Entity type (Transaction, LedgerEntry, Payout, etc.)
 * - aggregateId: Unique ID of the entity
 * - eventType: Action performed (Created, Updated, Refunded, etc.)
 * - payload: Full event data (JSON)
 * - ruleAppliedId: Governance rule identifier
 * - actorType: Who initiated (System, User, API, etc.)
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an audit event for a financial operation.
   *
   * @param params Audit event parameters
   * @returns Created audit trail entry
   */
  async recordEvent(params: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, any>;
    ruleAppliedId: string;
    actorType: string;
  }) {
    const { aggregateType, aggregateId, eventType, payload, ruleAppliedId, actorType } = params;

    // Validate required fields
    if (!aggregateType || !aggregateId || !eventType || !ruleAppliedId || !actorType) {
      throw new Error(
        'All audit fields are required: aggregateType, aggregateId, eventType, ruleAppliedId, actorType'
      );
    }

    const auditEntry = await this.prisma.auditTrail.create({
      data: {
        aggregateType,
        aggregateId,
        eventType,
        payload,
        ruleAppliedId,
        actorType,
      },
    });

    return auditEntry;
  }

  /**
   * Records a transaction-related audit event.
   */
  async recordTransactionEvent(params: {
    transactionId: string;
    eventType: 'TransactionCreated' | 'TransactionRefunded' | 'TransactionChargeback' | 'TransactionFailed';
    payload: Record<string, any>;
    ruleAppliedId: string;
    actorType?: string;
  }) {
    return this.recordEvent({
      aggregateType: 'Transaction',
      aggregateId: params.transactionId,
      eventType: params.eventType,
      payload: params.payload,
      ruleAppliedId: params.ruleAppliedId,
      actorType: params.actorType || 'System',
    });
  }

  /**
   * Records a ledger entry audit event.
   */
  async recordLedgerEvent(params: {
    entryId: string;
    eventType: 'LedgerEntryCreated' | 'LedgerEntryOffset';
    payload: Record<string, any>;
    ruleAppliedId: string;
    actorType?: string;
  }) {
    return this.recordEvent({
      aggregateType: 'LedgerEntry',
      aggregateId: params.entryId,
      eventType: params.eventType,
      payload: params.payload,
      ruleAppliedId: params.ruleAppliedId,
      actorType: params.actorType || 'System',
    });
  }

  /**
   * Records a payout audit event.
   */
  async recordPayoutEvent(params: {
    payoutId: string;
    eventType: 'PayoutCreated' | 'PayoutIssued' | 'PayoutFailed';
    payload: Record<string, any>;
    ruleAppliedId: string;
    actorType?: string;
  }) {
    return this.recordEvent({
      aggregateType: 'Payout',
      aggregateId: params.payoutId,
      eventType: params.eventType,
      payload: params.payload,
      ruleAppliedId: params.ruleAppliedId,
      actorType: params.actorType || 'System',
    });
  }

  /**
   * Records a fraud assessment audit event.
   */
  async recordFraudEvent(params: {
    assessmentId: string;
    eventType: 'FraudAssessmentCreated' | 'FraudFlagRaised';
    payload: Record<string, any>;
    ruleAppliedId: string;
    actorType?: string;
  }) {
    return this.recordEvent({
      aggregateType: 'FraudAssessment',
      aggregateId: params.assessmentId,
      eventType: params.eventType,
      payload: params.payload,
      ruleAppliedId: params.ruleAppliedId,
      actorType: params.actorType || 'System',
    });
  }

  /**
   * Queries audit trail for a specific aggregate.
   *
   * @param aggregateType Type of entity
   * @param aggregateId ID of the entity
   * @returns Chronological list of audit events
   */
  async getAuditTrail(aggregateType: string, aggregateId: string) {
    return this.prisma.auditTrail.findMany({
      where: {
        aggregateType,
        aggregateId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Queries audit trail by rule ID for governance reporting.
   *
   * @param ruleAppliedId Governance rule identifier
   * @param options Query options
   * @returns Audit events for the specified rule
   */
  async getAuditsByRule(
    ruleAppliedId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ) {
    const where: any = { ruleAppliedId };

    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        where.createdAt.gte = options.startDate;
      }
      if (options.endDate) {
        where.createdAt.lte = options.endDate;
      }
    }

    return this.prisma.auditTrail.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: options?.limit || 100,
    });
  }

  /**
   * Queries audit trail by time range for reporting and compliance.
   *
   * @param startDate Start of time range
   * @param endDate End of time range
   * @param options Additional query options
   * @returns Audit events in the time range
   */
  async getAuditsByTimeRange(
    startDate: Date,
    endDate: Date,
    options?: {
      aggregateType?: string;
      eventType?: string;
      limit?: number;
    }
  ) {
    const where: any = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (options?.aggregateType) {
      where.aggregateType = options.aggregateType;
    }

    if (options?.eventType) {
      where.eventType = options.eventType;
    }

    return this.prisma.auditTrail.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: options?.limit || 1000,
    });
  }

  /**
   * Replays audit trail for an aggregate to reconstruct state.
   * Useful for debugging and compliance verification.
   *
   * @param aggregateType Type of entity
   * @param aggregateId ID of the entity
   * @returns Chronological audit trail with metadata
   */
  async replayAuditTrail(aggregateType: string, aggregateId: string) {
    const trail = await this.getAuditTrail(aggregateType, aggregateId);

    return {
      aggregateType,
      aggregateId,
      eventCount: trail.length,
      firstEvent: trail[0]?.createdAt,
      lastEvent: trail[trail.length - 1]?.createdAt,
      events: trail.map((event, index) => ({
        sequence: index + 1,
        timestamp: event.createdAt,
        eventType: event.eventType,
        ruleAppliedId: event.ruleAppliedId,
        actorType: event.actorType,
        payload: event.payload,
      })),
    };
  }

  /**
   * Validates audit trail integrity for an aggregate.
   * Ensures all expected events are present and in correct order.
   *
   * @param aggregateType Type of entity
   * @param aggregateId ID of the entity
   * @returns Validation result
   */
  async validateAuditTrail(aggregateType: string, aggregateId: string) {
    const trail = await this.getAuditTrail(aggregateType, aggregateId);

    if (trail.length === 0) {
      return {
        valid: false,
        message: 'No audit trail found',
        eventCount: 0,
      };
    }

    // Check chronological order
    let previousTimestamp = trail[0].createdAt;
    for (let i = 1; i < trail.length; i++) {
      if (trail[i].createdAt < previousTimestamp) {
        return {
          valid: false,
          message: `Event ${i} timestamp out of order`,
          eventCount: trail.length,
        };
      }
      previousTimestamp = trail[i].createdAt;
    }

    // Check all events have required fields
    for (const event of trail) {
      if (!event.ruleAppliedId || !event.actorType) {
        return {
          valid: false,
          message: 'Event missing required governance fields',
          eventCount: trail.length,
        };
      }
    }

    return {
      valid: true,
      message: 'Audit trail valid',
      eventCount: trail.length,
      firstEvent: trail[0].createdAt,
      lastEvent: trail[trail.length - 1].createdAt,
    };
  }
}
