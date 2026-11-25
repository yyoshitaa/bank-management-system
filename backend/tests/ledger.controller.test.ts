import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecuteTransfer } = vi.hoisted(() => ({
  mockExecuteTransfer: vi.fn(),
}));

vi.mock('../src/modules/ledger/ledger.service.ts', () => ({
  LedgerService: {
    executeTransfer: mockExecuteTransfer,
  },
}));

import { LedgerController } from '../src/modules/ledger/ledger.controller.ts';

function createResponse() {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

function createRequest(overrides: any = {}) {
  return {
    user: { id: 'user-123' },
    headers: {
      'x-idempotency-key': 'transfer-key-001',
    },
    body: {
      senderAccountId: 'account-1',
      receiverAccountId: 'account-2',
      amount: 25,
      currency: 'SGD',
    },
    ...overrides,
  } as any;
}

describe('LedgerController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('transferFunds', () => {
    it('rejects requests without authentication', async () => {
      const req = createRequest({
        user: undefined,
      });

      const res = createResponse();

      await LedgerController.transferFunds(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required.',
      });

      expect(mockExecuteTransfer).not.toHaveBeenCalled();
    });

    it('rejects missing idempotency keys', async () => {
      const req = createRequest({
        headers: {},
      });

      const res = createResponse();

      await LedgerController.transferFunds(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockExecuteTransfer).not.toHaveBeenCalled();
    });

    it('rejects empty idempotency keys', async () => {
      const req = createRequest({
        headers: {
          'x-idempotency-key': '   ',
        },
      });

      const res = createResponse();

      await LedgerController.transferFunds(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockExecuteTransfer).not.toHaveBeenCalled();
    });

    it('rejects idempotency keys longer than 200 characters', async () => {
      const req = createRequest({
        headers: {
          'x-idempotency-key': 'a'.repeat(201),
        },
      });

      const res = createResponse();

      await LedgerController.transferFunds(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockExecuteTransfer).not.toHaveBeenCalled();
    });

    it('rejects invalid transfer payloads', async () => {
      const req = createRequest({
        body: {
          senderAccountId: 'account-1',
          receiverAccountId: 'account-2',
          amount: 25,
          currency: 'JPY',
        },
      });

      const res = createResponse();

      await LedgerController.transferFunds(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid transfer payload.',
      });

      expect(mockExecuteTransfer).not.toHaveBeenCalled();
    });

    it('rejects non-positive transfer amounts', async () => {
      const req = createRequest({
        body: {
          senderAccountId: 'account-1',
          receiverAccountId: 'account-2',
          amount: 0,
          currency: 'SGD',
        },
      });

      const res = createResponse();

      await LedgerController.transferFunds(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Transfer amount must be a positive number.',
      });

      expect(mockExecuteTransfer).not.toHaveBeenCalled();
    });

    it('rejects non-numeric transfer amounts', async () => {
      const req = createRequest({
        body: {
          senderAccountId: 'account-1',
          receiverAccountId: 'account-2',
          amount: 'not-a-number',
          currency: 'SGD',
        },
      });

      const res = createResponse();

      await LedgerController.transferFunds(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockExecuteTransfer).not.toHaveBeenCalled();
    });

    it('successfully executes a transfer and returns 201', async () => {
      const transaction = {
        id: 'transaction-123',
        status: 'SETTLED',
        amount: 25,
        currency: 'SGD',
      };

      mockExecuteTransfer.mockResolvedValue({
        status: 'SUCCESS',
        transaction,
      });

      const req = createRequest();
      const res = createResponse();

      await LedgerController.transferFunds(req, res);

      expect(mockExecuteTransfer).toHaveBeenCalledWith({
        userId: 'user-123',
        senderAccountId: 'account-1',
        receiverAccountId: 'account-2',
        amount: 25,
        currency: 'SGD',
        idempotencyKey: 'transfer-key-001',
      });

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Transfer settled successfully.',
        transaction,
      });
    });

    it('returns 200 for already processed idempotent transfers', async () => {
      const transaction = {
        id: 'transaction-123',
        status: 'SETTLED',
      };

      mockExecuteTransfer.mockResolvedValue({
        status: 'ALREADY_PROCESSED',
        transaction,
      });

      const req = createRequest();
      const res = createResponse();

      await LedgerController.transferFunds(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Retrieved cached response via idempotency key.',
        transaction,
      });
    });

    it('returns 422 when the transfer service throws an error', async () => {
      mockExecuteTransfer.mockRejectedValue(
        new Error('Insufficient funds')
      );

      const req = createRequest();
      const res = createResponse();

      await LedgerController.transferFunds(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient funds',
      });
    });
  });
});