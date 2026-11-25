import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

import { authenticateToken } from '../src/middleware/auth.middleware.ts';

const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';

function createResponse() {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

function createRequest(token?: string) {
  return {
    headers: token
      ? { authorization: `Bearer ${token}` }
      : {},
  } as any;
}

function createToken(payload: object = {
  id: 'user-123',
  email: 'test@example.com',
}) {
  return jwt.sign(payload, TEST_SECRET, {
    algorithm: 'HS256',
    issuer: 'apex-ledger-api',
    audience: 'apex-ledger-client',
    expiresIn: '1h',
  });
}

describe('authenticateToken middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = TEST_SECRET;
  });

  it('rejects requests without an authorization header', () => {
    const req = createRequest();
    const res = createResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authentication required. Please provide a valid Bearer token.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects authorization headers without the Bearer prefix', () => {
    const req = {
      headers: {
        authorization: 'Basic some-token',
      },
    } as any;

    const res = createResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects empty bearer tokens', () => {
    const req = {
      headers: {
        authorization: 'Bearer    ',
      },
    } as any;

    const res = createResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authentication token is missing.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects malformed tokens', () => {
    const req = createRequest('this-is-not-a-valid-jwt');
    const res = createResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid or expired authentication token.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects expired tokens', () => {
    const expiredToken = jwt.sign(
      {
        id: 'user-123',
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      TEST_SECRET,
      {
        algorithm: 'HS256',
        issuer: 'apex-ledger-api',
        audience: 'apex-ledger-client',
      }
    );

    const req = createRequest(expiredToken);
    const res = createResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects tokens signed with the wrong secret', () => {
    const wrongToken = jwt.sign(
      {
        id: 'user-123',
        email: 'test@example.com',
      },
      'wrong-secret',
      {
        algorithm: 'HS256',
        issuer: 'apex-ledger-api',
        audience: 'apex-ledger-client',
        expiresIn: '1h',
      }
    );

    const req = createRequest(wrongToken);
    const res = createResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects tokens with an incorrect issuer', () => {
    const wrongIssuerToken = jwt.sign(
      {
        id: 'user-123',
        email: 'test@example.com',
      },
      TEST_SECRET,
      {
        algorithm: 'HS256',
        issuer: 'wrong-issuer',
        audience: 'apex-ledger-client',
        expiresIn: '1h',
      }
    );

    const req = createRequest(wrongIssuerToken);
    const res = createResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects tokens with an incorrect audience', () => {
    const wrongAudienceToken = jwt.sign(
      {
        id: 'user-123',
        email: 'test@example.com',
      },
      TEST_SECRET,
      {
        algorithm: 'HS256',
        issuer: 'apex-ledger-api',
        audience: 'wrong-audience',
        expiresIn: '1h',
      }
    );

    const req = createRequest(wrongAudienceToken);
    const res = createResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects tokens missing the user ID', () => {
    const token = createToken({
      email: 'test@example.com',
    });

    const req = createRequest(token);
    const res = createResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid authentication token.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects tokens missing the email', () => {
    const token = createToken({
      id: 'user-123',
    });

    const req = createRequest(token);
    const res = createResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects tokens when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;

    const token = createToken();
    const req = createRequest(token);
    const res = createResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects tokens when JWT_SECRET is shorter than 32 bytes', () => {
    process.env.JWT_SECRET = 'short-secret';

    const token = createToken();
    const req = createRequest(token);
    const res = createResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts valid tokens and attaches user information', () => {
    const token = createToken();
    const req = createRequest(token);
    const res = createResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(req.user).toEqual({
      id: 'user-123',
      email: 'test@example.com',
    });

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});