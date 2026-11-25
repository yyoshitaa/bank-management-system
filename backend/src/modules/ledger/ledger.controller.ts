
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { LedgerService } from './ledger.service.ts';

export class LedgerController {
  static async transferFunds(
    req: AuthenticatedRequest,
    res: Response
  ) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required.'
        });
      }

      const idempotencyKey = req.headers['x-idempotency-key'];

      if (
        typeof idempotencyKey !== 'string' ||
        !idempotencyKey.trim() ||
        idempotencyKey.length > 200
      ) {
        return res.status(400).json({
          error: 'A valid X-Idempotency-Key header of at most 200 characters is required.'
        });
      }

      const {
        senderAccountId,
        receiverAccountId,
        amount,
        currency
      } = req.body;

      if (
        typeof senderAccountId !== 'string' ||
        typeof receiverAccountId !== 'string' ||
        typeof currency !== 'string' ||
        !['SGD', 'USD', 'EUR', 'GBP'].includes(currency)
      ) {
        return res.status(400).json({
          error: 'Invalid transfer payload.'
        });
      }

      const parsedAmount = Number(amount);

      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({
          error: 'Transfer amount must be a positive number.'
        });
      }

      const result = await LedgerService.executeTransfer({
        userId,
        senderAccountId,
        receiverAccountId,
        amount: parsedAmount,
        currency,
        idempotencyKey: idempotencyKey.trim()
      });

      if (result.status === 'ALREADY_PROCESSED') {
        return res.status(200).json({
          message: 'Retrieved cached response via idempotency key.',
          transaction: result.transaction
        });
      }

      return res.status(201).json({
        message: 'Transfer settled successfully.',
        transaction: result.transaction
      });

    } catch (error: any) {
      return res.status(422).json({
        error: error.message ||
          'An error occurred during transfer settlement.'
      });
    }
  }
}
