import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db } from '../src/config/database.ts';
import redisClient from '../src/config/redis.ts';
import { LedgerService } from '../src/modules/ledger/ledger.service.ts';

vi.mock('../src/config/database.ts', () => ({
  db: {
    query: vi.fn(),
    getClient: vi.fn(),
    end: vi.fn(),
  },
}));

vi.mock('../src/config/redis.ts', () => ({
  default: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  },
}));

vi.mock('../src/modules/ledger/ledger.service.ts', () => ({
  LedgerService: {
    executeTransfer: vi.fn(),
  },
}));

import app from '../src/app.ts';

const TEST_SECRET = 'test-secret-that-is-at-least-32-bytes-long';
const TEST_USER_ID = 'c5ef9433-96b9-4e62-9a01-123456789abc';
const TEST_EMAIL = 'test@example.com';

const SENDER_ID = 'c5ef9433-96b9-4e62-9a01-123456789001';
const RECEIVER_ID = 'c5ef9433-96b9-4e62-9a01-123456789002';

const createToken = (options: jwt.SignOptions = {}) =>
  jwt.sign(
    { id: TEST_USER_ID, email: TEST_EMAIL },
    TEST_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '1h',
      issuer: 'apex-ledger-api',
      audience: 'apex-ledger-client',
      ...options,
    }
  );

const validTransfer = {
  senderAccountId: SENDER_ID,
  receiverAccountId: RECEIVER_ID,
  amount: 10,
  currency: 'SGD',
};

const authenticatedTransfer = (body: unknown) =>
  request(app)
    .post('/api/transfers')
    .set('Authorization', `Bearer ${createToken()}`)
    .set('X-Idempotency-Key', 'test-transfer-key')
    .send(body);

beforeEach(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  vi.clearAllMocks();
  vi.mocked(redisClient.get).mockResolvedValue(null);
  vi.mocked(redisClient.setex).mockResolvedValue('OK');
  vi.mocked(LedgerService.executeTransfer).mockReset();
});

describe('Bank Management System API', () => {
  it('should return HTTP 200 from the health endpoint', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('UP');
  });

    it('should reject a transfer without an idempotency key', async () => {
    const response = await request(app)
      .post('/api/transfers')
      .set('Authorization', `Bearer ${createToken()}`)
      .send(validTransfer);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/idempotency-key/i);
  });

  it('should return a cached response for a repeated idempotency key', async () => {
    const cachedBody = {
      message: 'Transfer settled successfully.',
      transaction: {
        id: 'cached-transaction-001',
        status: 'SETTLED',
      },
    };

    vi.mocked(redisClient.get).mockResolvedValue(
      JSON.stringify({
        status: 201,
        body: cachedBody,
      })
    );

    const response = await authenticatedTransfer(validTransfer);

    expect(response.status).toBe(201);
    expect(response.body._cached).toBe(true);
    expect(response.body.transaction.id).toBe('cached-transaction-001');
    expect(redisClient.get).toHaveBeenCalledWith(
      `idempotency:${TEST_USER_ID}:test-transfer-key`
    );
  });


  it('should successfully execute a transfer and return HTTP 201', async () => {
    const mockTransaction = {
      id: 'successful-transaction-001',
      sender_account_id: SENDER_ID,
      receiver_account_id: RECEIVER_ID,
      amount: '10.00',
      currency: 'SGD',
      status: 'SETTLED',
    };

    vi.mocked(LedgerService.executeTransfer).mockResolvedValue({
      status: 'SUCCESS',
      transaction: mockTransaction,
    } as any);

    const response = await authenticatedTransfer(validTransfer);

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Transfer settled successfully.');
    expect(response.body.transaction).toEqual(mockTransaction);

    expect(LedgerService.executeTransfer).toHaveBeenCalledWith({
      userId: TEST_USER_ID,
      senderAccountId: SENDER_ID,
      receiverAccountId: RECEIVER_ID,
      amount: 10,
      currency: 'SGD',
      idempotencyKey: 'test-transfer-key',
    });

    expect(redisClient.setex).toHaveBeenCalled();
  });

  it('should reject unauthenticated account requests', async () => {
    const response = await request(app).get('/api/accounts');

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/authentication required/i);
  });

  it('should reject unauthenticated transfer requests', async () => {
    const response = await request(app)
      .post('/api/transfers')
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/authentication required/i);
  });

  it('should reject an invalid JWT', async () => {
    const response = await request(app)
      .get('/api/accounts')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
  });

  it('should reject a JWT with the wrong issuer', async () => {
    const token = createToken({ issuer: 'incorrect-issuer' });

    const response = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it('should reject an expired JWT', async () => {
    const token = createToken({ expiresIn: '-1h' });

    const response = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it('should accept a valid JWT and return the mocked accounts', async () => {
    vi.mocked(db.query).mockResolvedValue({
      rows: [
        {
          id: 'account-test-001',
          user_id: TEST_USER_ID,
          currency: 'SGD',
          balance: '100.0000',
        },
      ],
    } as any);

    const response = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${createToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].currency).toBe('SGD');
    expect(db.query).toHaveBeenCalled();
  });

  it('should reject transfer requests with missing fields', async () => {
    const response = await authenticatedTransfer({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Request validation failed.');
  });

  it('should reject an invalid sender account UUID', async () => {
    const response = await authenticatedTransfer({
      ...validTransfer,
      senderAccountId: 'invalid-uuid',
    });

    expect(response.status).toBe(400);
  });

  it('should reject a zero transfer amount', async () => {
    const response = await authenticatedTransfer({
      ...validTransfer,
      amount: 0,
    });

    expect(response.status).toBe(400);
  });

  it('should reject a negative transfer amount', async () => {
    const response = await authenticatedTransfer({
      ...validTransfer,
      amount: -10,
    });

    expect(response.status).toBe(400);
  });

  it('should reject an unsupported currency', async () => {
    const response = await authenticatedTransfer({
      ...validTransfer,
      currency: 'JPY',
    });

    expect(response.status).toBe(400);
  });

  it('should reject a transfer when the sender has insufficient funds', async () => {
    vi.mocked(LedgerService.executeTransfer).mockRejectedValue(
      new Error('Ledger Transaction Failed: Insufficient funds in sender account.')
    );

    const response = await authenticatedTransfer(validTransfer);

    expect(response.status).toBe(422);
    expect(response.body.error).toMatch(/insufficient funds/i);
    expect(LedgerService.executeTransfer).toHaveBeenCalledTimes(1);
  });

});

  it('should reject a transfer from an account not owned by the user', async () => {
    vi.mocked(LedgerService.executeTransfer).mockRejectedValue(
      new Error(
        'Ledger Transaction Failed: You are not authorized to transfer funds from this account.'
      )
    );

    const response = await authenticatedTransfer(validTransfer);

    expect(response.status).toBe(422);
    expect(response.body.error).toMatch(/not authorized/i);
    expect(LedgerService.executeTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TEST_USER_ID,
        senderAccountId: SENDER_ID,
      })
    );
  });


describe('Account Routes', () => {
  it('should return 500 when fetching accounts fails', async () => {
    vi.mocked(db.query).mockRejectedValue(new Error('Database unavailable'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${createToken()}`);

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to fetch accounts');

    consoleSpy.mockRestore();
  });

  it('should reject unsupported wallet currency', async () => {
    const response = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${createToken()}`)
      .send({ currency: 'JPY' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/unsupported currency/i);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('should successfully create a wallet', async () => {
    const mockAccount = {
      id: 'new-account-001',
      user_id: TEST_USER_ID,
      currency: 'USD',
      created_at: new Date().toISOString(),
    };

    vi.mocked(db.query).mockResolvedValue({
      rows: [mockAccount],
    } as any);

    const response = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${createToken()}`)
      .send({ currency: 'usd' });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Wallet created successfully.');
    expect(response.body.account.currency).toBe('USD');
    expect(response.body.account.balance).toBe('0.0000');
  });

  it('should return 409 when wallet currency already exists', async () => {
    vi.mocked(db.query).mockRejectedValue({
      code: '23505',
    });

    const response = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${createToken()}`)
      .send({ currency: 'SGD' });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/already have a wallet/i);
  });

  it('should return 500 when wallet creation fails', async () => {
    vi.mocked(db.query).mockRejectedValue(new Error('Database unavailable'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${createToken()}`)
      .send({ currency: 'EUR' });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to create wallet.');

    consoleSpy.mockRestore();
  });
});


describe('Transaction Routes', () => {
  it('should return paginated transactions with default parameters', async () => {
    const mockTransactions = [
      {
        id: 'transaction-001',
        amount: '10.0000',
        currency: 'SGD',
        status: 'SETTLED',
      },
      {
        id: 'transaction-002',
        amount: '20.0000',
        currency: 'SGD',
        status: 'SETTLED',
      },
    ];

    vi.mocked(db.query)
      .mockResolvedValueOnce({
        rows: [{ total: 25 }],
      } as any)
      .mockResolvedValueOnce({
        rows: mockTransactions,
      } as any);

    const response = await request(app)
      .get('/api/transactions')
      .set('Authorization', `Bearer ${createToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.transactions).toHaveLength(2);
    expect(response.body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('should support custom page and limit parameters', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce({
        rows: [{ total: 50 }],
      } as any)
      .mockResolvedValueOnce({
        rows: [],
      } as any);

    const response = await request(app)
      .get('/api/transactions?page=3&limit=5')
      .set('Authorization', `Bearer ${createToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({
      page: 3,
      limit: 5,
      total: 50,
      totalPages: 10,
      hasNextPage: true,
      hasPreviousPage: true,
    });

    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      [TEST_USER_ID, 5, 10]
    );
  });

  it('should reject invalid pagination parameters', async () => {
    const response = await request(app)
      .get('/api/transactions?page=0&limit=10')
      .set('Authorization', `Bearer ${createToken()}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/invalid pagination parameters/i);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('should reject a limit greater than 100', async () => {
    const response = await request(app)
      .get('/api/transactions?page=1&limit=101')
      .set('Authorization', `Bearer ${createToken()}`);

    expect(response.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('should return 500 when fetching transactions fails', async () => {
    vi.mocked(db.query).mockRejectedValue(
      new Error('Database unavailable')
    );

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(app)
      .get('/api/transactions')
      .set('Authorization', `Bearer ${createToken()}`);

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to fetch transactions');

    consoleSpy.mockRestore();
  });
});


describe('Global Error Handler', () => {
  it('should return 400 for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid JSON request body.');
  });

  it('should return 413 when the request body exceeds 10 KB', async () => {
    const oversizedBody = JSON.stringify({
      data: 'a'.repeat(12_000),
    });

    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(oversizedBody);

    expect(response.status).toBe(413);
    expect(response.body.error).toBe('Request body exceeds the 10 KB limit.');
  });
});
