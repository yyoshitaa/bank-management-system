
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockRelease = vi.fn();

const mockClient = {
  query: mockQuery,
  release: mockRelease,
};

vi.mock('../src/config/database.ts', () => ({
  db: {
    getClient: vi.fn(),
  },
}));

import { db } from '../src/config/database.ts';
import { LedgerService } from '../src/modules/ledger/ledger.service.ts';

const TEST_USER_ID = 'c5ef9433-96b9-4e62-9a01-123456789abc';
const OTHER_USER_ID = 'd5ef9433-96b9-4e62-9a01-123456789abc';

const SENDER_ID = 'c5ef9433-96b9-4e62-9a01-123456789001';
const RECEIVER_ID = 'c5ef9433-96b9-4e62-9a01-123456789002';

const validTransfer = {
  userId: TEST_USER_ID,
  senderAccountId: SENDER_ID,
  receiverAccountId: RECEIVER_ID,
  amount: 10,
  currency: 'SGD',
  idempotencyKey: 'ledger-test-key',
};

beforeEach(() => {
  mockQuery.mockReset();
  mockRelease.mockReset();
  vi.mocked(db.getClient).mockReset();

  vi.mocked(db.getClient).mockResolvedValue(mockClient as any);
});

describe('LedgerService', () => {

  it('should reject transfers when the sender has insufficient funds', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [] }) // BEGIN
    .mockResolvedValueOnce({ rows: [] }) // Existing transaction check
    .mockResolvedValueOnce({
      rows: [
        {
          id: SENDER_ID,
          user_id: TEST_USER_ID,
          currency: 'SGD',
            account_type: 'CUSTOMER',
        },
        {
          id: RECEIVER_ID,
          user_id: OTHER_USER_ID,
          currency: 'SGD',
            account_type: 'CUSTOMER',
        },
      ],
    }) // Account locking query
    .mockResolvedValueOnce({
      rows: [{ balance: '5' }],
    }); // Balance query

  await expect(
    LedgerService.executeTransfer(validTransfer)
  ).rejects.toThrow(/insufficient funds/i);

  expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
  expect(mockRelease).toHaveBeenCalledTimes(1);

  const insertCalls = mockQuery.mock.calls.filter(
    ([sql]) =>
      typeof sql === 'string' &&
      sql.includes('INSERT INTO transactions')
  );

  expect(insertCalls).toHaveLength(0);
});

  it('should successfully execute a transfer and create double-entry ledger records', async () => {
    const TRANSACTION_ID = 'e5ef9433-96b9-4e62-9a01-123456789abc';

    const settledTransaction = {
      id: TRANSACTION_ID,
      sender_account_id: SENDER_ID,
      receiver_account_id: RECEIVER_ID,
      amount: '10',
      currency: 'SGD',
      status: 'SETTLED',
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // Existing transaction check
      .mockResolvedValueOnce({
        rows: [
          {
            id: SENDER_ID,
            user_id: TEST_USER_ID,
            currency: 'SGD',
            account_type: 'CUSTOMER',
          },
          {
            id: RECEIVER_ID,
            user_id: OTHER_USER_ID,
            currency: 'SGD',
            account_type: 'CUSTOMER',
          },
        ],
      }) // Account locking query
      .mockResolvedValueOnce({
        rows: [{ balance: '100' }],
      }) // Balance query
      .mockResolvedValueOnce({
        rows: [{ id: TRANSACTION_ID }],
      }) // INSERT transaction
      .mockResolvedValueOnce({
        rows: [],
      }) // INSERT ledger entries
      .mockResolvedValueOnce({
        rows: [settledTransaction],
      }) // UPDATE transaction to SETTLED
      .mockResolvedValueOnce({
        rows: [],
      }); // COMMIT

    const result = await LedgerService.executeTransfer(validTransfer);

    // 1. Verify successful result
    expect(result.status).toBe('SUCCESS');
    expect(result.transaction).toEqual(settledTransaction);

    // 2. Verify the double-entry ledger records
    const ledgerInsertCall = mockQuery.mock.calls.find(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.includes('INSERT INTO ledger_entries')
    );

    expect(ledgerInsertCall).toBeDefined();

    expect(ledgerInsertCall?.[1]).toEqual([
      TRANSACTION_ID,
      SENDER_ID,
      -10,
      RECEIVER_ID,
      10,
    ]);

    // 3. Verify the transaction was committed
    expect(mockQuery).toHaveBeenCalledWith('COMMIT');

    // 4. Ensure no rollback occurred
    expect(mockQuery).not.toHaveBeenCalledWith('ROLLBACK');

    // 5. Verify database connection was released
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

    it('should reject transfers when the sender does not own the account', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // Existing transaction check
      .mockResolvedValueOnce({
        rows: [
          {
            id: SENDER_ID,
            user_id: OTHER_USER_ID, // Account belongs to another user
            currency: 'SGD',
            account_type: 'CUSTOMER',
          },
          {
            id: RECEIVER_ID,
            user_id: TEST_USER_ID,
            currency: 'SGD',
            account_type: 'CUSTOMER',
          },
        ],
      }); // Account locking query

    await expect(
      LedgerService.executeTransfer(validTransfer)
    ).rejects.toThrow(/not authorized/i);

    // Transaction must be rolled back.
    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');

    // No transaction may be created.
    expect(
      mockQuery.mock.calls.some(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.includes('INSERT INTO transactions')
      )
    ).toBe(false);

    // No ledger entries may be created.
    expect(
      mockQuery.mock.calls.some(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.includes('INSERT INTO ledger_entries')
      )
    ).toBe(false);

    // Connection must be released.
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('should prevent duplicate transfers using idempotency keys', async () => {
    const existingTransaction = {
      id: 'e5ef9433-96b9-4e62-9a01-123456789abc',
      sender_account_id: SENDER_ID,
      receiver_account_id: RECEIVER_ID,
      amount: '10',
      currency: 'SGD',
      status: 'SETTLED',
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [existingTransaction],
      }) // Existing transaction check
      .mockResolvedValueOnce({
        rows: [],
      }); // ROLLBACK

    const result = await LedgerService.executeTransfer(validTransfer);

    // 1. Should recognize the previously processed transfer
    expect(result.status).toBe('ALREADY_PROCESSED');
    expect(result.transaction).toEqual(existingTransaction);

    // 2. Should not proceed to lock accounts
    expect(mockQuery).toHaveBeenCalledTimes(3);

    // 3. Should roll back the duplicate request
    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');

    // 4. Should not create new ledger entries
    expect(
      mockQuery.mock.calls.some(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.includes('INSERT INTO ledger_entries')
      )
    ).toBe(false);

    // 5. Should release the database client
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('should recover from a simultaneous duplicate idempotency request', async () => {
    const existingTransaction = {
      id: 'e5ef9433-96b9-4e62-9a01-123456789abc',
      sender_account_id: SENDER_ID,
      receiver_account_id: RECEIVER_ID,
      amount: '10',
      currency: 'SGD',
      status: 'SETTLED',
    };

    const duplicateKeyError = Object.assign(
      new Error('duplicate key value violates unique constraint'),
      { code: '23505' }
    );

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // Initial idempotency check
      .mockResolvedValueOnce({
        rows: [
          { id: SENDER_ID, user_id: TEST_USER_ID, currency: 'SGD',
            account_type: 'CUSTOMER', },
          { id: RECEIVER_ID, user_id: OTHER_USER_ID, currency: 'SGD',
            account_type: 'CUSTOMER', },
        ],
      }) // Account locking
      .mockResolvedValueOnce({ rows: [{ balance: '100' }] }) // Balance
      .mockRejectedValueOnce(duplicateKeyError) // Duplicate transaction INSERT
      .mockResolvedValueOnce({ rows: [] }) // ROLLBACK
      .mockResolvedValueOnce({
        rows: [existingTransaction],
      }); // Retrieve original transaction

    const result = await LedgerService.executeTransfer(validTransfer);

    expect(result.status).toBe('ALREADY_PROCESSED');
    expect(result.transaction).toEqual(existingTransaction);
    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

    it.each([
    0,
    -10,
    NaN,
    Infinity,
  ])('should reject invalid transfer amount: %s', async (amount) => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // Idempotency check
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    await expect(
      LedgerService.executeTransfer({
        ...validTransfer,
        amount,
      })
    ).rejects.toThrow(/greater than zero/i);

    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockRelease).toHaveBeenCalledTimes(1);

    // Account locking must never happen for invalid amounts.
    expect(
      mockQuery.mock.calls.some(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.includes('FROM accounts')
      )
    ).toBe(false);
  });

    it('should reject transfers to the same account', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // Idempotency check
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    await expect(
      LedgerService.executeTransfer({
        ...validTransfer,
        receiverAccountId: SENDER_ID,
      })
    ).rejects.toThrow(/cannot be identical/i);

    // Verify transaction rollback
    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');

    // Account locking should never occur
    expect(
      mockQuery.mock.calls.some(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.includes('FROM accounts')
      )
    ).toBe(false);

    // Database client must be released
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

    it('should reject transfers when account currencies do not match', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // Idempotency check
      .mockResolvedValueOnce({
        rows: [
          {
            id: SENDER_ID,
            user_id: TEST_USER_ID,
            currency: 'SGD',
            account_type: 'CUSTOMER',
          },
          {
            id: RECEIVER_ID,
            user_id: OTHER_USER_ID,
            currency: 'USD',
            account_type: 'CUSTOMER',
          },
        ],
      }) // Account locking query
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    await expect(
      LedgerService.executeTransfer(validTransfer)
    ).rejects.toThrow(/currency mismatch/i);

    // Transaction must be rolled back
    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');

    // Balance query must never be reached
    expect(
      mockQuery.mock.calls.some(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.includes('FROM ledger_entries')
      )
    ).toBe(false);

    // Database client must be released
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

    it('should reject transfers when one or both accounts do not exist', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // Idempotency check
      .mockResolvedValueOnce({
        rows: [],
      }) // Account locking query - no accounts found
      .mockResolvedValueOnce({
        rows: [],
      }); // ROLLBACK

    await expect(
      LedgerService.executeTransfer(validTransfer)
    ).rejects.toThrow(/one or both accounts do not exist/i);

    // Transaction must be rolled back
    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');

    // Balance calculation must never be reached
    expect(
      mockQuery.mock.calls.some(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.includes('FROM ledger_entries')
      )
    ).toBe(false);

    // Database client must be released
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });


  it('should reject P2P transfers involving a SYSTEM account', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: SENDER_ID,
            user_id: TEST_USER_ID,
            currency: 'SGD',
            account_type: 'CUSTOMER',
          },
          {
            id: RECEIVER_ID,
            user_id: OTHER_USER_ID,
            currency: 'SGD',
            account_type: 'SYSTEM',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      LedgerService.executeTransfer(validTransfer)
    ).rejects.toThrow(/only permitted between customer accounts/i);

    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockRelease).toHaveBeenCalledTimes(1);

    expect(
      mockQuery.mock.calls.some(
        ([sql]) =>
          typeof sql === 'string' &&
          (sql.includes('FROM ledger_entries') ||
           sql.includes('INSERT INTO transactions'))
      )
    ).toBe(false);
  });

it('should rollback an internal deposit when ledger posting fails', async () => {
  const CUSTOMER_ACCOUNT_ID = 'customer-deposit-account';
  const CLEARING_ACCOUNT_ID = 'system-clearing-account';

  mockQuery
    .mockResolvedValueOnce({ rows: [] }) // BEGIN
    .mockResolvedValueOnce({ rows: [] }) // Idempotency check
    .mockResolvedValueOnce({
      rows: [
        {
          id: CUSTOMER_ACCOUNT_ID,
          currency: 'SGD',
          account_type: 'CUSTOMER',
        },
        {
          id: CLEARING_ACCOUNT_ID,
          currency: 'SGD',
          account_type: 'SYSTEM',
          system_purpose: 'CLEARING',
        },
      ],
    }) // Account locking query
    .mockResolvedValueOnce({
      rows: [{ id: 'transaction-deposit-failure-001' }],
    }) // Transaction insert
    .mockRejectedValueOnce(
      new Error('Simulated ledger_entries insert failure')
    ); // Ledger entries insert fails

  await expect(
    LedgerService.executeInternalPosting({
      transactionType: 'DEPOSIT',
      customerAccountId: CUSTOMER_ACCOUNT_ID,
      clearingAccountId: CLEARING_ACCOUNT_ID,
      amount: 100,
      currency: 'SGD',
      idempotencyKey: 'internal-deposit-failure-001',
    })
  ).rejects.toThrow(/Internal Posting Failed.*ledger_entries insert failure/i);

  // Transaction must be rolled back
  expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');

  // Transaction must never be committed
  expect(mockQuery).not.toHaveBeenCalledWith('COMMIT');

  // Transaction must never be marked SETTLED
  expect(
    mockQuery.mock.calls.some(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.includes('UPDATE transactions') &&
        sql.includes("SET status = 'SETTLED'")
    )
  ).toBe(false);

  // Ledger insert was attempted
  expect(
    mockQuery.mock.calls.some(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.includes('INSERT INTO ledger_entries')
    )
  ).toBe(true);

  // Database client must be released
  expect(mockRelease).toHaveBeenCalledTimes(1);
});
  it('should process a successful internal deposit', async () => {
    const CUSTOMER_ACCOUNT_ID = 'customer-deposit-account';
    const CLEARING_ACCOUNT_ID = 'system-clearing-account';

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // Idempotency check
      .mockResolvedValueOnce({
        rows: [
          {
            id: CUSTOMER_ACCOUNT_ID,
            currency: 'SGD',
            account_type: 'CUSTOMER',
          },
          {
            id: CLEARING_ACCOUNT_ID,
            currency: 'SGD',
            account_type: 'SYSTEM',
            system_purpose: 'CLEARING',
          },
        ],
      }) // Account locking query
      .mockResolvedValueOnce({
        rows: [{ id: 'transaction-deposit-001' }],
      }) // Transaction insert
      .mockResolvedValueOnce({ rows: [] }) // Ledger entries insert
      .mockResolvedValueOnce({
        rows: [{ id: 'transaction-deposit-001', status: 'SETTLED' }],
      }) // Settlement
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await LedgerService.executeInternalPosting({
      transactionType: 'DEPOSIT',
      customerAccountId: CUSTOMER_ACCOUNT_ID,
      clearingAccountId: CLEARING_ACCOUNT_ID,
      amount: 100,
      currency: 'SGD',
      idempotencyKey: 'internal-deposit-test-001',
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.transaction.status).toBe('SETTLED');

    const idempotencyCheck = mockQuery.mock.calls.find(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.includes('SELECT * FROM transactions WHERE idempotency_key = $1')
    );

    expect(idempotencyCheck?.[1]).toEqual([
      'INTERNAL:DEPOSIT:internal-deposit-test-001',
    ]);

    const ledgerInsert = mockQuery.mock.calls.find(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.includes('INSERT INTO ledger_entries')
    );

    expect(ledgerInsert).toBeDefined();
    expect(ledgerInsert![1]).toEqual([
      'transaction-deposit-001',
      CLEARING_ACCOUNT_ID,
      -100,
      CUSTOMER_ACCOUNT_ID,
      100,
    ]);

    expect(mockQuery).toHaveBeenCalledWith('COMMIT');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

    it('should process a successful internal withdrawal', async () => {
    const CUSTOMER_ACCOUNT_ID = 'customer-withdrawal-account';
    const CLEARING_ACCOUNT_ID = 'system-clearing-account';

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // Idempotency check
      .mockResolvedValueOnce({
        rows: [
          {
            id: CUSTOMER_ACCOUNT_ID,
            currency: 'SGD',
            account_type: 'CUSTOMER',
          },
          {
            id: CLEARING_ACCOUNT_ID,
            currency: 'SGD',
            account_type: 'SYSTEM',
            system_purpose: 'CLEARING',
          },
        ],
      }) // Account locking query
      .mockResolvedValueOnce({
        rows: [{ balance: '500' }],
      }) // Customer balance
      .mockResolvedValueOnce({
        rows: [{ id: 'transaction-withdrawal-001' }],
      }) // Transaction insert
      .mockResolvedValueOnce({ rows: [] }) // Ledger entries insert
      .mockResolvedValueOnce({
        rows: [{ id: 'transaction-withdrawal-001', status: 'SETTLED' }],
      }) // Settlement
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await LedgerService.executeInternalPosting({
      transactionType: 'WITHDRAWAL',
      customerAccountId: CUSTOMER_ACCOUNT_ID,
      clearingAccountId: CLEARING_ACCOUNT_ID,
      amount: 100,
      currency: 'SGD',
      idempotencyKey: 'internal-withdrawal-test-001',
    });

    const idempotencyCheck = mockQuery.mock.calls.find(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.includes('SELECT * FROM transactions WHERE idempotency_key = $1')
    );

    expect(idempotencyCheck?.[1]).toEqual([
      'INTERNAL:WITHDRAWAL:internal-withdrawal-test-001',
    ]);

    expect(result.status).toBe('SUCCESS');
    expect(result.transaction.status).toBe('SETTLED');

    const ledgerInsert = mockQuery.mock.calls.find(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.includes('INSERT INTO ledger_entries')
    );

    expect(ledgerInsert).toBeDefined();
    expect(ledgerInsert![1]).toEqual([
      'transaction-withdrawal-001',
      CUSTOMER_ACCOUNT_ID,
      -100,
      CLEARING_ACCOUNT_ID,
      100,
    ]);

    expect(mockQuery).toHaveBeenCalledWith('COMMIT');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

    it('should reject an internal withdrawal with insufficient funds', async () => {
    const CUSTOMER_ACCOUNT_ID = 'customer-low-balance-account';
    const CLEARING_ACCOUNT_ID = 'system-clearing-account';

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // Idempotency check
      .mockResolvedValueOnce({
        rows: [
          {
            id: CUSTOMER_ACCOUNT_ID,
            currency: 'SGD',
            account_type: 'CUSTOMER',
          },
          {
            id: CLEARING_ACCOUNT_ID,
            currency: 'SGD',
            account_type: 'SYSTEM',
            system_purpose: 'CLEARING',
          },
        ],
      }) // Account locking query
      .mockResolvedValueOnce({
        rows: [{ balance: '50' }],
      }); // Customer balance

    await expect(
      LedgerService.executeInternalPosting({
        transactionType: 'WITHDRAWAL',
        customerAccountId: CUSTOMER_ACCOUNT_ID,
        clearingAccountId: CLEARING_ACCOUNT_ID,
        amount: 100,
        currency: 'SGD',
        idempotencyKey: 'internal-withdrawal-insufficient-001',
      })
    ).rejects.toThrow(/insufficient funds/i);

    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');

    expect(
      mockQuery.mock.calls.some(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.includes('INSERT INTO transactions')
      )
    ).toBe(false);

    expect(
      mockQuery.mock.calls.some(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.includes('INSERT INTO ledger_entries')
      )
    ).toBe(false);

    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('should reject reuse of an idempotency key with different transaction details', async () => {
    const customerId = 'customer-duplicate-account';
    const clearingId = 'system-clearing-account';

    const existingTransaction = {
      id: 'existing-deposit-transaction',
      status: 'SETTLED',
      transaction_type: 'DEPOSIT',
      sender_account_id: clearingId,
      receiver_account_id: customerId,
      amount: '100',
      currency: 'SGD',
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [existingTransaction],
      }) // Existing idempotency record
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    await expect(
      LedgerService.executeInternalPosting({
        transactionType: 'DEPOSIT',
        customerAccountId: customerId,
        clearingAccountId: clearingId,
        amount: 200,
        currency: 'SGD',
        idempotencyKey: 'duplicate-deposit-test-001',
      })
    ).rejects.toThrow(/different transaction details/i);

    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('should recover gracefully from a simultaneous duplicate internal posting', async () => {
    const customerId = 'customer-duplicate-account';
    const clearingId = 'system-clearing-account';

    const duplicateError = Object.assign(
      new Error('duplicate key value violates unique constraint'),
      {
        code: '23505',
        constraint: 'transactions_idempotency_key_key'
      }
    );

    const existingTransaction = {
      id: 'existing-deposit-transaction',
      status: 'SETTLED',
      transaction_type: 'DEPOSIT',
      sender_account_id: clearingId,
      receiver_account_id: customerId,
      amount: '100',
      currency: 'SGD',
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // Initial idempotency check
      .mockResolvedValueOnce({
        rows: [
          {
            id: customerId,
            currency: 'SGD',
            account_type: 'CUSTOMER',
          },
          {
            id: clearingId,
            currency: 'SGD',
            account_type: 'SYSTEM',
            system_purpose: 'CLEARING',
          },
        ],
      }) // Account locking
      .mockRejectedValueOnce(duplicateError) // Transaction insert
      .mockResolvedValueOnce({ rows: [] }) // ROLLBACK
      .mockResolvedValueOnce({
        rows: [existingTransaction],
      }); // Duplicate transaction lookup

    const result = await LedgerService.executeInternalPosting({
      transactionType: 'DEPOSIT',
      customerAccountId: customerId,
      clearingAccountId: clearingId,
      amount: 100,
      currency: 'SGD',
      idempotencyKey: 'duplicate-deposit-test-001',
    });

    expect(result.status).toBe('ALREADY_PROCESSED');
    expect(result.transaction).toEqual(existingTransaction);

    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM transactions WHERE idempotency_key = $1',
      ['INTERNAL:DEPOSIT:duplicate-deposit-test-001']
    );

    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it.each(['', '   ', 'x'.repeat(201)])(
    'should reject invalid internal idempotency keys before acquiring a database connection',
    async (idempotencyKey) => {
      await expect(
        LedgerService.executeInternalPosting({
          transactionType: 'DEPOSIT',
          customerAccountId: 'customer-test-account',
          clearingAccountId: 'system-clearing-account',
          amount: 100,
          currency: 'SGD',
          idempotencyKey,
        })
      ).rejects.toThrow(/invalid idempotency key/i);

      expect(db.getClient).not.toHaveBeenCalled();
    }
  );


  it('should reject invalid internal transaction types before acquiring a database connection', async () => {
    await expect(
      LedgerService.executeInternalPosting({
        transactionType: 'TRANSFER' as any,
        customerAccountId: 'customer-test-account',
        clearingAccountId: 'system-clearing-account',
        amount: 100,
        currency: 'SGD',
        idempotencyKey: 'invalid-type-test-001',
      })
    ).rejects.toThrow(/invalid internal transaction type/i);

    expect(db.getClient).not.toHaveBeenCalled();
  });

});
