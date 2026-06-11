import { AuditService } from '../src/common/audit.service';

describe('AuditService', () => {
  let service: AuditService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  const mockAuditTrail = {
    id: 'audit_123',
    aggregateType: 'Transaction',
    aggregateId: 'txn_456',
    eventType: 'TransactionCreated',
    payload: { amount: 1000, currency: 'USD' },
    ruleAppliedId: 'GOVERNANCE-EQ-v1',
    actorType: 'System',
    createdAt: new Date('2026-05-26T10:00:00Z'),
  };

  beforeEach(() => {
    // Mock Prisma service
    prisma = {
      auditTrail: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    service = new AuditService(prisma);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordEvent', () => {
    it('should record an audit event successfully', async () => {
      prisma.auditTrail.create.mockResolvedValue(mockAuditTrail);

      const result = await service.recordEvent({
        aggregateType: 'Transaction',
        aggregateId: 'txn_456',
        eventType: 'TransactionCreated',
        payload: { amount: 1000, currency: 'USD' },
        ruleAppliedId: 'GOVERNANCE-EQ-v1',
        actorType: 'System',
      });

      expect(result).toEqual(mockAuditTrail);
      expect(prisma.auditTrail.create).toHaveBeenCalledWith({
        data: {
          aggregateType: 'Transaction',
          aggregateId: 'txn_456',
          eventType: 'TransactionCreated',
          payload: { amount: 1000, currency: 'USD' },
          ruleAppliedId: 'GOVERNANCE-EQ-v1',
          actorType: 'System',
        },
      });
    });

    it('should throw error when required fields are missing', async () => {
      await expect(
        service.recordEvent({
          aggregateType: '',
          aggregateId: 'txn_456',
          eventType: 'TransactionCreated',
          payload: {},
          ruleAppliedId: 'GOVERNANCE-EQ-v1',
          actorType: 'System',
        }),
      ).rejects.toThrow('All audit fields are required');
    });

    it('should throw error when ruleAppliedId is missing', async () => {
      await expect(
        service.recordEvent({
          aggregateType: 'Transaction',
          aggregateId: 'txn_456',
          eventType: 'TransactionCreated',
          payload: {},
          ruleAppliedId: '',
          actorType: 'System',
        }),
      ).rejects.toThrow('All audit fields are required');
    });
  });

  describe('recordTransactionEvent', () => {
    it('should record transaction event with default actor', async () => {
      (prisma.auditTrail.create as jest.Mock).mockResolvedValue(mockAuditTrail);

      await service.recordTransactionEvent({
        transactionId: 'txn_456',
        eventType: 'TransactionCreated',
        payload: { amount: 1000 },
        ruleAppliedId: 'GOVERNANCE-EQ-v1',
      });

      expect(prisma.auditTrail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          aggregateType: 'Transaction',
          aggregateId: 'txn_456',
          eventType: 'TransactionCreated',
          actorType: 'System',
        }),
      });
    });

    it('should record transaction refund event', async () => {
      (prisma.auditTrail.create as jest.Mock).mockResolvedValue(mockAuditTrail);

      await service.recordTransactionEvent({
        transactionId: 'txn_456',
        eventType: 'TransactionRefunded',
        payload: { refundAmount: 500 },
        ruleAppliedId: 'GOVERNANCE-EQ-v1',
        actorType: 'API',
      });

      expect(prisma.auditTrail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'TransactionRefunded',
          actorType: 'API',
        }),
      });
    });
  });

  describe('recordLedgerEvent', () => {
    it('should record ledger entry creation', async () => {
      (prisma.auditTrail.create as jest.Mock).mockResolvedValue(mockAuditTrail);

      await service.recordLedgerEvent({
        entryId: 'entry_789',
        eventType: 'LedgerEntryCreated',
        payload: { entryType: 'CREDIT', amount: 1000 },
        ruleAppliedId: 'GOVERNANCE-EQ-v1',
      });

      expect(prisma.auditTrail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          aggregateType: 'LedgerEntry',
          aggregateId: 'entry_789',
          eventType: 'LedgerEntryCreated',
        }),
      });
    });
  });

  describe('recordPayoutEvent', () => {
    it('should record payout creation', async () => {
      (prisma.auditTrail.create as jest.Mock).mockResolvedValue(mockAuditTrail);

      await service.recordPayoutEvent({
        payoutId: 'payout_101',
        eventType: 'PayoutCreated',
        payload: { amount: 5000, creatorId: 'creator_1' },
        ruleAppliedId: 'GOVERNANCE-EQ-v1',
      });

      expect(prisma.auditTrail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          aggregateType: 'Payout',
          aggregateId: 'payout_101',
          eventType: 'PayoutCreated',
        }),
      });
    });
  });

  describe('recordFraudEvent', () => {
    it('should record fraud assessment', async () => {
      (prisma.auditTrail.create as jest.Mock).mockResolvedValue(mockAuditTrail);

      await service.recordFraudEvent({
        assessmentId: 'fraud_202',
        eventType: 'FraudAssessmentCreated',
        payload: { riskScore: 85, decision: 'BLOCK' },
        ruleAppliedId: 'GOVERNANCE-EQ-v1',
      });

      expect(prisma.auditTrail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          aggregateType: 'FraudAssessment',
          aggregateId: 'fraud_202',
          eventType: 'FraudAssessmentCreated',
        }),
      });
    });
  });

  describe('getAuditTrail', () => {
    it('should retrieve audit trail for an aggregate', async () => {
      const mockTrail = [mockAuditTrail];
      prisma.auditTrail.findMany.mockResolvedValue(mockTrail);

      const result = await service.getAuditTrail('Transaction', 'txn_456');

      expect(result).toEqual(mockTrail);
      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith({
        where: {
          aggregateType: 'Transaction',
          aggregateId: 'txn_456',
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
    });
  });

  describe('getAuditsByRule', () => {
    it('should retrieve audits by rule ID', async () => {
      const mockTrail = [mockAuditTrail];
      prisma.auditTrail.findMany.mockResolvedValue(mockTrail);

      const result = await service.getAuditsByRule('GOVERNANCE-EQ-v1');

      expect(result).toEqual(mockTrail);
      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith({
        where: { ruleAppliedId: 'GOVERNANCE-EQ-v1' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2026-05-01');
      const endDate = new Date('2026-05-31');

      await service.getAuditsByRule('GOVERNANCE-EQ-v1', { startDate, endDate });

      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith({
        where: {
          ruleAppliedId: 'GOVERNANCE-EQ-v1',
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });

    it('should respect limit option', async () => {
      await service.getAuditsByRule('GOVERNANCE-EQ-v1', { limit: 50 });

      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });
  });

  describe('getAuditsByTimeRange', () => {
    it('should retrieve audits by time range', async () => {
      const startDate = new Date('2026-05-01');
      const endDate = new Date('2026-05-31');

      await service.getAuditsByTimeRange(startDate, endDate);

      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });
    });

    it('should filter by aggregate type', async () => {
      const startDate = new Date('2026-05-01');
      const endDate = new Date('2026-05-31');

      await service.getAuditsByTimeRange(startDate, endDate, {
        aggregateType: 'Transaction',
      });

      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            aggregateType: 'Transaction',
          }),
        }),
      );
    });
  });

  describe('replayAuditTrail', () => {
    it('should replay audit trail with metadata', async () => {
      const mockTrail = [
        { ...mockAuditTrail, createdAt: new Date('2026-05-26T10:00:00Z') },
        {
          ...mockAuditTrail,
          id: 'audit_124',
          eventType: 'TransactionRefunded',
          createdAt: new Date('2026-05-26T11:00:00Z'),
        },
      ];
      prisma.auditTrail.findMany.mockResolvedValue(mockTrail);

      const result = await service.replayAuditTrail('Transaction', 'txn_456');

      expect(result.aggregateType).toBe('Transaction');
      expect(result.aggregateId).toBe('txn_456');
      expect(result.eventCount).toBe(2);
      expect(result.events).toHaveLength(2);
      expect(result.events[0].sequence).toBe(1);
      expect(result.events[1].sequence).toBe(2);
    });
  });

  describe('validateAuditTrail', () => {
    it('should validate a correct audit trail', async () => {
      const mockTrail = [
        { ...mockAuditTrail, createdAt: new Date('2026-05-26T10:00:00Z') },
        {
          ...mockAuditTrail,
          id: 'audit_124',
          createdAt: new Date('2026-05-26T11:00:00Z'),
        },
      ];
      prisma.auditTrail.findMany.mockResolvedValue(mockTrail);

      const result = await service.validateAuditTrail('Transaction', 'txn_456');

      expect(result.valid).toBe(true);
      expect(result.eventCount).toBe(2);
    });

    it('should fail validation when no trail exists', async () => {
      (prisma.auditTrail.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.validateAuditTrail('Transaction', 'txn_456');

      expect(result.valid).toBe(false);
      expect(result.message).toBe('No audit trail found');
    });

    it('should fail validation when timestamps are out of order', async () => {
      const mockTrail = [
        { ...mockAuditTrail, createdAt: new Date('2026-05-26T11:00:00Z') },
        {
          ...mockAuditTrail,
          id: 'audit_124',
          createdAt: new Date('2026-05-26T10:00:00Z'),
        },
      ];
      prisma.auditTrail.findMany.mockResolvedValue(mockTrail);

      const result = await service.validateAuditTrail('Transaction', 'txn_456');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('timestamp out of order');
    });

    it('should fail validation when governance fields are missing', async () => {
      const mockTrail = [{ ...mockAuditTrail, ruleAppliedId: '' }];
      prisma.auditTrail.findMany.mockResolvedValue(mockTrail);

      const result = await service.validateAuditTrail('Transaction', 'txn_456');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('missing required governance fields');
    });
  });
});
