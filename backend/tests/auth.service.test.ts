import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockHash, mockCompare } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockHash: vi.fn(),
  mockCompare: vi.fn(),
}));

vi.mock('../src/config/database.ts', () => ({
  db: {
    query: mockQuery,
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: mockHash,
    compare: mockCompare,
  },
}));

import jwt from 'jsonwebtoken';
import { AuthService } from '../src/modules/auth/auth.service.ts';

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
    mockHash.mockResolvedValue('hashed-password');
    mockCompare.mockResolvedValue(true);
  });

  describe('register', () => {
    it('registers a user and normalizes their email', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-123',
              email: 'test@example.com',
              created_at: new Date(),
            },
          ],
        });

      const result = await AuthService.register(
        '  TEST@EXAMPLE.COM  ',
        'Password123'
      );

      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        'SELECT id FROM users WHERE email = $1',
        ['test@example.com']
        );

      expect(mockHash).toHaveBeenCalledWith('Password123', 12);

      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO users'),
        ['test@example.com', 'hashed-password']
      );

      expect(result.user.email).toBe('test@example.com');
      expect(result.token).toBeTruthy();

      const decoded = jwt.verify(
        result.token,
        process.env.JWT_SECRET!,
        {
          issuer: 'apex-ledger-api',
          audience: 'apex-ledger-client',
          algorithms: ['HS256'],
        }
      );

      expect(decoded).toMatchObject({
        id: 'user-123',
        email: 'test@example.com',
      });
    });

    it('rejects duplicate email registrations', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'existing-user' }],
      });

      await expect(
        AuthService.register('test@example.com', 'Password123')
      ).rejects.toThrow('An account with this email already exists.');

      expect(mockHash).not.toHaveBeenCalled();
    });

    it('rejects registration if JWT_SECRET is missing', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-123',
              email: 'test@example.com',
              created_at: new Date(),
            },
          ],
        });

      delete process.env.JWT_SECRET;

      await expect(
        AuthService.register('test@example.com', 'Password123')
      ).rejects.toThrow('JWT_SECRET is missing from environment variables.');
    });

    it('rejects registration if JWT_SECRET is shorter than 32 bytes', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-123',
              email: 'test@example.com',
              created_at: new Date(),
            },
          ],
        });

      process.env.JWT_SECRET = 'too-short';

      await expect(
        AuthService.register('test@example.com', 'Password123')
      ).rejects.toThrow('JWT_SECRET must be at least 32 bytes long.');
    });
  });

  describe('login', () => {
    it('logs in a user with correct credentials', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            email: 'test@example.com',
            password_hash: 'hashed-password',
            created_at: new Date(),
          },
        ],
      });

      mockCompare.mockResolvedValue(true);

      const result = await AuthService.login(
        ' TEST@EXAMPLE.COM ',
        'Password123'
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, email, password_hash'),
        ['test@example.com']
      );

      expect(mockCompare).toHaveBeenCalledWith(
        'Password123',
        'hashed-password'
      );

      expect(result.user.email).toBe('test@example.com');
      expect(result.user).not.toHaveProperty('password_hash');
      expect(result.token).toBeTruthy();
    });

    it('rejects an incorrect password', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            email: 'test@example.com',
            password_hash: 'hashed-password',
            created_at: new Date(),
          },
        ],
      });

      mockCompare.mockResolvedValue(false);

      await expect(
        AuthService.login('test@example.com', 'WrongPassword')
      ).rejects.toThrow('Invalid email or password.');
    });

    it('rejects an account that does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        AuthService.login('missing@example.com', 'Password123')
      ).rejects.toThrow('Invalid email or password.');

      expect(mockCompare).not.toHaveBeenCalled();
    });

    it('rejects a user with no password hash', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            email: 'test@example.com',
            password_hash: null,
            created_at: new Date(),
          },
        ],
      });

      await expect(
        AuthService.login('test@example.com', 'Password123')
      ).rejects.toThrow('Invalid email or password.');

      expect(mockCompare).not.toHaveBeenCalled();
    });
  });
});