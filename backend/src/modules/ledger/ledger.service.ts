
import { db } from '../../config/database.ts';
import type { PoolClient } from 'pg';

interface TransferRequest {
  userId: string;
  senderAccountId: string;
  receiverAccountId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
}

type InternalTransactionType = 'DEPOSIT' | 'WITHDRAWAL';

interface InternalPostingRequest {
  transactionType: InternalTransactionType;
  customerAccountId: string;
  clearingAccountId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
}

export class LedgerService {
  static async executeTransfer(data: TransferRequest) {
    const client: PoolClient = await db.getClient();

    // Namespace database idempotency keys by authenticated user.
    const scopedIdempotencyKey = `${data.userId}:${data.idempotencyKey}`;

    try {
      await client.query('BEGIN');

      // 1. Check for an existing transaction belonging to this user.
      const existingTx = await client.query(
        'SELECT * FROM transactions WHERE idempotency_key = $1',
        [scopedIdempotencyKey]
      );

      if (existingTx.rows.length > 0) {
        await client.query('ROLLBACK');

        return {
          status: 'ALREADY_PROCESSED',
          transaction: existingTx.rows[0]
        };
      }

      // 2. Validate transfer details.
      if (data.senderAccountId === data.receiverAccountId) {
        throw new Error('Sender and receiver accounts cannot be identical.');
      }

      if (!Number.isFinite(data.amount) || data.amount <= 0) {
        throw new Error('Transfer amount must be greater than zero.');
      }

      // 3. Sort IDs to maintain deterministic locking order.
      const [firstId, secondId] = [
        data.senderAccountId,
        data.receiverAccountId
      ].sort();

      // 4. Lock both accounts.
      const accountsResult = await client.query(
        `SELECT id, user_id, currency, account_type
         FROM accounts
         WHERE id IN ($1, $2)
         ORDER BY id
         FOR UPDATE`,
        [firstId, secondId]
      );

      if (accountsResult.rows.length !== 2) {
        throw new Error('One or both accounts do not exist.');
      }

      const senderAccount = accountsResult.rows.find(
        acc => acc.id === data.senderAccountId
      );

      const receiverAccount = accountsResult.rows.find(
        acc => acc.id === data.receiverAccountId
      );

      if (!senderAccount || !receiverAccount) {
        throw new Error('Account resolution failed during locking.');
      }

      // Reject SYSTEM accounts from customer-to-customer transfers.
      if (
        senderAccount.account_type !== 'CUSTOMER' ||
        receiverAccount.account_type !== 'CUSTOMER'
      ) {
        throw new Error(
          'Transfers are only permitted between customer accounts.'
        );
      }

      // 5. Verify sender ownership.
      if (senderAccount.user_id !== data.userId) {
        throw new Error(
          'You are not authorized to transfer funds from this account.'
        );
      }

      // 6. Verify currencies.
      if (
        senderAccount.currency !== data.currency ||
        receiverAccount.currency !== data.currency
      ) {
        throw new Error(
          'Currency mismatch between account sub-wallet and transfer request.'
        );
      }

      // 7. Calculate sender balance from immutable ledger entries.
      const balanceResult = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS balance
         FROM ledger_entries
         WHERE account_id = $1`,
        [data.senderAccountId]
      );

      const currentBalance = parseFloat(balanceResult.rows[0].balance);

      if (currentBalance < data.amount) {
        throw new Error('Insufficient funds in sender account.');
      }

      // 8. Insert transaction.
      const txResult = await client.query(
        `INSERT INTO transactions
          (idempotency_key, sender_account_id, receiver_account_id,
           amount, currency, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')
         RETURNING *`,
        [
          scopedIdempotencyKey,
          data.senderAccountId,
          data.receiverAccountId,
          data.amount,
          data.currency
        ]
      );

      const transactionId = txResult.rows[0].id;

      // 9. Write double-entry ledger records.
      await client.query(
        `INSERT INTO ledger_entries
          (transaction_id, account_id, amount)
         VALUES
          ($1, $2, $3),
          ($1, $4, $5)`,
        [
          transactionId,
          data.senderAccountId,
          -Math.abs(data.amount),
          data.receiverAccountId,
          Math.abs(data.amount)
        ]
      );

      // 10. Settle transaction.
      const settledTx = await client.query(
        `UPDATE transactions
         SET status = 'SETTLED'
         WHERE id = $1
         RETURNING *`,
        [transactionId]
      );

      await client.query('COMMIT');

      return {
        status: 'SUCCESS',
        transaction: settledTx.rows[0]
      };

    } catch (error: any) {
      await client.query('ROLLBACK');

      // Recover from a simultaneous duplicate idempotency request.
      if (error.code === '23505') {
        const duplicateTx = await client.query(
          'SELECT * FROM transactions WHERE idempotency_key = $1',
          [scopedIdempotencyKey]
        );

        if (duplicateTx.rows.length > 0) {
          return {
            status: 'ALREADY_PROCESSED',
            transaction: duplicateTx.rows[0]
          };
        }
      }

      throw new Error(
        `Ledger Transaction Failed: ${error.message}`
      );

    } finally {
      client.release();
    }
  }

  static async executeInternalPosting(data: InternalPostingRequest) {
    // Validate the idempotency key before acquiring a database connection.
    if (
      typeof data.idempotencyKey !== 'string' ||
      data.idempotencyKey.trim().length === 0 ||
      data.idempotencyKey.length > 200
    ) {
      throw new Error('Invalid idempotency key');
    }

    // Validate transaction type before acquiring a database connection.
    if (
      data.transactionType !== 'DEPOSIT' &&
      data.transactionType !== 'WITHDRAWAL'
    ) {
      throw new Error('Invalid internal transaction type');
    }

    const internalIdempotencyKey =
      `INTERNAL:${data.transactionType}:${data.idempotencyKey}`;

    const client: PoolClient = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. Validate amount.
      if (!Number.isFinite(data.amount) || data.amount <= 0) {
        throw new Error('Invalid posting amount');
      }

      // 4. Determine expected posting direction.
      const expectedSenderAccountId =
        data.transactionType === 'DEPOSIT'
          ? data.clearingAccountId
          : data.customerAccountId;

      const expectedReceiverAccountId =
        data.transactionType === 'DEPOSIT'
          ? data.customerAccountId
          : data.clearingAccountId;

      // 5. Check idempotency and verify request details.
      const existingTx = await client.query(
        `SELECT * FROM transactions WHERE idempotency_key = $1`,
        [internalIdempotencyKey]
      );

      if (existingTx.rows.length > 0) {
        const existing = existingTx.rows[0];

        const matches =
          existing.transaction_type === data.transactionType &&
          existing.sender_account_id === expectedSenderAccountId &&
          existing.receiver_account_id === expectedReceiverAccountId &&
          Number(existing.amount) === data.amount &&
          existing.currency === data.currency;

        await client.query('ROLLBACK');

        if (!matches) {
          throw new Error(
            'Idempotency key has already been used with different transaction details'
          );
        }

        return {
          status: 'ALREADY_PROCESSED',
          transaction: existing
        };
      }

      // 6. Prevent posting to the same account.
      if (data.customerAccountId === data.clearingAccountId) {
        throw new Error('Customer and clearing accounts must differ');
      }

      // 7. Lock accounts in deterministic order.
      const accountIds = [
        data.customerAccountId,
        data.clearingAccountId
      ].sort();

      const accountsResult = await client.query(
        `SELECT id, user_id, currency, account_type, system_purpose
         FROM accounts
         WHERE id IN ($1, $2)
         ORDER BY id
         FOR UPDATE`,
        accountIds
      );

      if (accountsResult.rows.length !== 2) {
        throw new Error('Account not found');
      }

      const customerAccount = accountsResult.rows.find(
        (account: any) => account.id === data.customerAccountId
      );

      const clearingAccount = accountsResult.rows.find(
        (account: any) => account.id === data.clearingAccountId
      );

      // 5. Validate account roles.
      if (!customerAccount || customerAccount.account_type !== 'CUSTOMER') {
        throw new Error('Invalid customer account');
      }

      if (
        !clearingAccount ||
        clearingAccount.account_type !== 'SYSTEM' ||
        clearingAccount.system_purpose !== 'CLEARING'
      ) {
        throw new Error('Invalid clearing account');
      }

      // 6. Validate currency.
      if (
        customerAccount.currency !== data.currency ||
        clearingAccount.currency !== data.currency
      ) {
        throw new Error('Currency mismatch');
      }

      // 7. Determine posting direction.
      let senderAccountId: string;
      let receiverAccountId: string;

      if (data.transactionType === 'DEPOSIT') {
        senderAccountId = data.clearingAccountId;
        receiverAccountId = data.customerAccountId;
      } else {
        senderAccountId = data.customerAccountId;
        receiverAccountId = data.clearingAccountId;
      }

      // 8. Check customer balance for withdrawals.
      if (data.transactionType === 'WITHDRAWAL') {
        const balanceResult = await client.query(
          `SELECT COALESCE(SUM(amount), 0) AS balance
           FROM ledger_entries
           WHERE account_id = $1`,
          [data.customerAccountId]
        );

        const balance = Number(balanceResult.rows[0].balance);

        if (balance < data.amount) {
          throw new Error('Insufficient funds');
        }
      }

      // 9. Create transaction record.
      const transactionResult = await client.query(
        `INSERT INTO transactions
          (idempotency_key, sender_account_id, receiver_account_id,
           amount, currency, status, transaction_type)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
         RETURNING id`,
        [
          internalIdempotencyKey,
          senderAccountId,
          receiverAccountId,
          data.amount,
          data.currency,
          data.transactionType
        ]
      );

      const transactionId = transactionResult.rows[0].id;

      // 10. Write balanced ledger entries.
      await client.query(
        `INSERT INTO ledger_entries
          (transaction_id, account_id, amount)
         VALUES
          ($1, $2, $3),
          ($1, $4, $5)`,
        [
          transactionId,
          senderAccountId,
          -Math.abs(data.amount),
          receiverAccountId,
          Math.abs(data.amount)
        ]
      );

      // 11. Settle transaction.
      const settledTx = await client.query(
        `UPDATE transactions
         SET status = 'SETTLED'
         WHERE id = $1
         RETURNING *`,
        [transactionId]
      );

      await client.query('COMMIT');

      return {
        status: 'SUCCESS',
        transaction: settledTx.rows[0]
      };

    } catch (error: any) {
      await client.query('ROLLBACK');

      // Recover only from an idempotency-key unique constraint violation.
      if (
        error.code === '23505' &&
        error.constraint === 'transactions_idempotency_key_key'
      ) {
        const existingTx = await client.query(
          'SELECT * FROM transactions WHERE idempotency_key = $1',
          [internalIdempotencyKey]
        );

        if (existingTx.rows.length > 0) {
          return {
            status: 'ALREADY_PROCESSED',
            transaction: existingTx.rows[0]
          };
        }
      }

      throw new Error(
        `Internal Posting Failed: ${error.message}`
      );

    } finally {
      client.release();
    }
  }
}
