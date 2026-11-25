
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGet, mockSetex } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSetex: vi.fn(),
}));

vi.mock('../src/config/redis.ts', () => ({
  default: {
    get: mockGet,
    setex: mockSetex,
  },
}));

import { idempotencyMiddleware } from '../src/middleware/idempotency.ts';

const createMocks = (options?: {
  userId?: string;
  idempotencyKey?: string;
}) => {
  const req = {
    user: options?.userId ? { id: options.userId, email: 'test@example.com' } : undefined,
    headers: options?.idempotencyKey
      ? { 'x-idempotency-key': options.idempotencyKey }
      : {},
  } as any;

  const res: any = {
    statusCode: 200,
    status: vi.fn(function (code: number) {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn(function (body: any) {
      return body;
    }),
  };

  const next = vi.fn();

  return { req, res, next };
};

describe('Idempotency Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSetex.mockResolvedValue('OK');
  });

  it('should return 401 when user is not authenticated', async () => {
    const { req, res, next } = createMocks({
      idempotencyKey: 'key-123',
    });

    await idempotencyMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authentication required.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 400 when idempotency key is missing', async () => {
    const { req, res, next } = createMocks({
      userId: 'user-123',
    });

    await idempotencyMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing mandatory X-Idempotency-Key header.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return cached response when Redis has a matching key', async () => {
    const cachedResponse = {
      status: 201,
      body: { message: 'Transfer successful', transactionId: 'tx-123' },
    };

    mockGet.mockResolvedValue(JSON.stringify(cachedResponse));

    const { req, res, next } = createMocks({
      userId: 'user-123',
      idempotencyKey: 'key-123',
    });

    await idempotencyMiddleware(req, res, next);

    expect(mockGet).toHaveBeenCalledWith('idempotency:user-123:key-123');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Transfer successful',
      transactionId: 'tx-123',
      _cached: true,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next when no cached response exists', async () => {
    const { req, res, next } = createMocks({
      userId: 'user-123',
      idempotencyKey: 'key-123',
    });

    await idempotencyMiddleware(req, res, next);

    expect(mockGet).toHaveBeenCalledWith('idempotency:user-123:key-123');
    expect(next).toHaveBeenCalledOnce();
  });

  it('should cache a successful response when res.json is called', async () => {
    const { req, res, next } = createMocks({
      userId: 'user-123',
      idempotencyKey: 'key-123',
    });

    await idempotencyMiddleware(req, res, next);

    res.status(201);
    res.json({ message: 'Transfer successful' });

    expect(mockSetex).toHaveBeenCalledWith(
      'idempotency:user-123:key-123',
      86400,
      JSON.stringify({
        status: 201,
        body: { message: 'Transfer successful' },
      }),
    );
  });

  it('should not cache a non-2xx response', async () => {
    const { req, res, next } = createMocks({
      userId: 'user-123',
      idempotencyKey: 'key-123',
    });

    await idempotencyMiddleware(req, res, next);

    res.status(422);
    res.json({ error: 'Transfer failed' });

    expect(mockSetex).not.toHaveBeenCalled();
  });

  it('should use a separate Redis key for each user', async () => {
    const first = createMocks({
      userId: 'user-123',
      idempotencyKey: 'same-key',
    });

    const second = createMocks({
      userId: 'user-456',
      idempotencyKey: 'same-key',
    });

    await idempotencyMiddleware(first.req, first.res, first.next);
    await idempotencyMiddleware(second.req, second.res, second.next);

    expect(mockGet).toHaveBeenNthCalledWith(
      1,
      'idempotency:user-123:same-key',
    );
    expect(mockGet).toHaveBeenNthCalledWith(
      2,
      'idempotency:user-456:same-key',
    );
  });

  it('should return 500 when Redis lookup fails', async () => {
    mockGet.mockRejectedValue(new Error('Redis unavailable'));

    const { req, res, next } = createMocks({
      userId: 'user-123',
      idempotencyKey: 'key-123',
    });

    await idempotencyMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error during idempotency check.',
    });
    expect(next).not.toHaveBeenCalled();
  });

    it('should log an error when Redis cache write fails', async () => {
    mockSetex.mockRejectedValue(new Error('Redis write failed'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { req, res, next } = createMocks({
      userId: 'user-123',
      idempotencyKey: 'key-123',
    });

    await idempotencyMiddleware(req, res, next);

    res.status(201);
    res.json({ message: 'Transfer successful' });

    await vi.waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to cache idempotency response:',
        expect.any(Error),
      );
    });

    consoleErrorSpy.mockRestore();
  });
});
