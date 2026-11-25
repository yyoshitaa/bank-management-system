
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export const transferSchema = z.object({
  senderAccountId: z.string().uuid('Sender account ID must be a valid UUID.'),
  receiverAccountId: z.string().uuid('Receiver account ID must be a valid UUID.'),
  amount: z.union([
    z.number(),
    z.string().regex(/^\d+(\.\d{1,4})?$/, 'Amount must be a valid decimal number.')
  ]).transform(Number).pipe(
    z.number().finite().positive('Transfer amount must be greater than zero.')
  ),
  currency: z.enum(['SGD', 'USD', 'EUR', 'GBP'])
}).strict();

export const validateBody = (schema: z.ZodType) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: 'Request validation failed.',
        details: result.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    req.body = result.data;
    next();
  };
};

export const internalPostingSchema = z.object({
  accountId: z.string().uuid('Account ID must be a valid UUID.'),
  amount: z.union([
    z.number(),
    z.string().regex(
      /^\d+(\.\d{1,4})?$/,
      'Amount must be a valid decimal number with up to 4 decimal places.'
    )
  ]).transform(Number).pipe(
    z.number().finite().positive('Amount must be greater than zero.')
  )
}).strict();