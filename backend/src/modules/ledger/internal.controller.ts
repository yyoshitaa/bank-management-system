import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.ts';
import { db } from '../../config/database.ts';
import { LedgerService } from './ledger.service.ts';

export class InternalController {
  static async deposit(req: AuthenticatedRequest, res: Response) {
    return InternalController.process(req, res, 'DEPOSIT');
  }

  static async withdraw(req: AuthenticatedRequest, res: Response) {
    return InternalController.process(req, res, 'WITHDRAWAL');
  }

  private static async process(
    req: AuthenticatedRequest,
    res: Response,
    transactionType: 'DEPOSIT' | 'WITHDRAWAL'
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

      const { accountId, amount } = req.body;

      // 1. Verify account ownership.
      const accountResult = await db.query(
        `SELECT id, user_id, currency, account_type
         FROM accounts
         WHERE id = $1 AND user_id = $2`,
        [accountId, userId]
      );

      if (accountResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Customer account not found.'
        });
      }

      const customerAccount = accountResult.rows[0];

      if (customerAccount.account_type !== 'CUSTOMER') {
        return res.status(403).json({
          error: 'Operation is not permitted on this account.'
        });
      }

      // 2. Find the correct clearing account for this currency.
      const clearingResult = await db.query(
        `SELECT id, currency
         FROM accounts
         WHERE account_type = 'SYSTEM'
           AND system_purpose = 'CLEARING'
           AND currency = $1`,
        [customerAccount.currency]
      );

      if (clearingResult.rows.length === 0) {
        return res.status(503).json({
          error: `Deposits and withdrawals are currently unavailable for ${customerAccount.currency}.`
        });
      }

      const clearingAccount = clearingResult.rows[0];

      // 3. Post through the existing double-entry ledger engine.
      const result = await LedgerService.executeInternalPosting({
        transactionType,
        customerAccountId: customerAccount.id,
        clearingAccountId: clearingAccount.id,
        amount: Number(amount),
        currency: customerAccount.currency,
        idempotencyKey: `${userId}:${idempotencyKey.trim()}`
      });

      if (result.status === 'ALREADY_PROCESSED') {
        return res.status(200).json({
          message: `${transactionType === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} already processed.`,
          transaction: result.transaction
        });
      }

      return res.status(201).json({
        message: transactionType === 'DEPOSIT'
          ? 'Deposit completed successfully.'
          : 'Withdrawal completed successfully.',
        transaction: result.transaction
      });

    } catch (error: any) {
      console.error(`${transactionType} operation failed:`, error);

      const message = error?.message || '';

      if (message.includes('Insufficient funds')) {
        return res.status(422).json({
          error: 'Insufficient funds.'
        });
      }

      if (
        message.includes('Idempotency key') ||
        message.includes('Invalid') ||
        message.includes('must') ||
        message.includes('amount')
      ) {
        return res.status(422).json({
          error: message
        });
      }

      return res.status(500).json({
        error: `Failed to process ${transactionType.toLowerCase()}.`
      });
    }
  }
}