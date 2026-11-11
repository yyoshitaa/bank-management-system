import { db } from '../../config/database';
import { PoolClient } from 'pg';

interface TransferRequest {
  senderAccountId: string;
  receiverAccountId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
}

export class LedgerService {
  /**
   * Executes an atomic, concurrent-safe money transfer using pessimistic locking.
   */
  static async executeTransfer(data: TransferRequest) {
    const client: PoolClient = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. Idempotency check inside the database transaction boundary
      const existingTx = await client.query(
        'SELECT * FROM transactions WHERE idempotency_key = $1',
        [data.idempotencyKey]
      );

      if (existingTx.rows.length > 0) {
        await client.query('ROLLBACK');
        return { 
          status: 'ALREADY_PROCESSED', 
          transaction: existingTx.rows[0] 
        };
      }

      // 2. Prevent self-transfers
      if (data.senderAccountId === data.receiverAccountId) {
        throw new Error('Sender and receiver accounts cannot be identical.');
      }

      if (data.amount <= 0) {
        throw new Error('Transfer amount must be greater than zero.');
      }

      // 3. Sort account IDs deterministically to prevent PostgreSQL deadlocks
      const [firstId, secondId] = [data.senderAccountId, data.receiverAccountId].sort();

      // 4. Lock both accounts concurrently using SELECT ... FOR UPDATE
      const accountsQuery = `
        SELECT id, user_id, currency 
        FROM accounts 
        WHERE id IN ($1, $2) 
        FOR UPDATE
      `;
      const accountsResult = await client.query(accountsQuery, [firstId, secondId]);

      if (accountsResult.rows.length !== 2) {
        throw new Error('One or both accounts do not exist.');
      }

      const senderAccount = accountsResult.rows.find(acc => acc.id === data.senderAccountId);
      const receiverAccount = accountsResult.rows.find(acc => acc.id === data.receiverAccountId);

      if (!senderAccount || !receiverAccount) {
        throw new Error('Account resolution failed during locking.');
      }

      if (senderAccount.currency !== data.currency || receiverAccount.currency !== data.currency) {
        throw new Error('Currency mismatch between account sub-wallet and transfer request.');
      }

      // 5. Calculate current balance directly from immutable ledger history to prevent drift
      const balanceQuery = `
        SELECT COALESCE(SUM(amount), 0) as balance 
        FROM ledger_entries 
        WHERE account_id = $1
      `;
      const senderBalanceRes = await client.query(balanceQuery, [data.senderAccountId]);
      const currentBalance = parseFloat(senderBalanceRes.rows[0].balance);

      if (currentBalance < data.amount) {
        throw new Error('Insufficient funds in sender account.');
      }

      // 6. Insert transaction record with PENDING status initially
      const insertTxQuery = `
        INSERT INTO transactions (idempotency_key, sender_account_id, receiver_account_id, amount, currency, status)
        VALUES ($1, $2, $3, $4, $5, 'PENDING')
        RETURNING *
      `;
      const txResult = await client.query(insertTxQuery, [
        data.idempotencyKey,
        data.senderAccountId,
        data.receiverAccountId,
        data.amount,
        data.currency
      ]);
      const transactionId = txResult.rows[0].id;

      // 7. Write immutable double-entry ledger records (Debit sender, Credit receiver)
      const insertLedgerQuery = `
        INSERT INTO ledger_entries (transaction_id, account_id, amount)
        VALUES 
          ($1, $2, $3),
          ($1, $4, $5)
      `;
      await client.query(insertLedgerQuery, [
        transactionId,
        data.senderAccountId,
        -Math.abs(data.amount), // Debit (negative)
        data.receiverAccountId,
        Math.abs(data.amount)  // Credit (positive)
      ]);

      // 8. Update transaction status to SETTLED
      const updateTxQuery = `
        UPDATE transactions 
        SET status = 'SETTLED' 
        WHERE id = $1 
        RETURNING *
      `;
      const settledTx = await client.query(updateTxQuery, [transactionId]);

      await client.query('COMMIT');

      return {
        status: 'SUCCESS',
        transaction: settledTx.rows[0],
      };

    } catch (error: any) {
      await client.query('ROLLBACK');
      throw new Error(`Ledger Transaction Failed: ${error.message}`);
    } finally {
      client.release();
    }
  }
}