import { Request, Response } from 'express';
import { LedgerService } from './ledger.service';

export class LedgerController {
  static async transferFunds(req: Request, res: Response) {
    try {
      const idempotencyKey = req.headers['x-idempotency-key'] as string;

      if (!idempotencyKey) {
        return res.status(400).json({ 
          error: 'Missing required header: X-Idempotency-Key' 
        });
      }

      const { senderAccountId, receiverAccountId, amount, currency } = req.body;

      if (!senderAccountId || !receiverAccountId || !amount || !currency) {
        return res.status(400).json({ 
          error: 'Invalid payload. Required: senderAccountId, receiverAccountId, amount, currency' 
        });
      }

      const result = await LedgerService.executeTransfer({
        senderAccountId,
        receiverAccountId,
        amount: parseFloat(amount),
        currency,
        idempotencyKey,
      });

      if (result.status === 'ALREADY_PROCESSED') {
        return res.status(200).json({
          message: 'Retrieved cached response via idempotency key.',
          transaction: result.transaction,
        });
      }

      return res.status(201).json({
        message: 'Transfer settled successfully.',
        transaction: result.transaction,
      });

    } catch (error: any) {
      return res.status(422).json({ 
        error: error.message || 'An error occurred during transfer settlement.' 
      });
    }
  }
}