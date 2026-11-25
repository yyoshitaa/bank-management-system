import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRegister, mockLogin } = vi.hoisted(() => ({
  mockRegister: vi.fn(),
  mockLogin: vi.fn(),
}));

vi.mock('../src/modules/auth/auth.service.ts', () => ({
  AuthService: {
    register: mockRegister,
    login: mockLogin,
  },
}));

import { AuthController } from '../src/modules/auth/auth.controller.ts';

function createResponse() {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

describe('AuthController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('registers a valid user and returns 201', async () => {
      const result = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          created_at: new Date(),
        },
        token: 'test-token',
      };

      mockRegister.mockResolvedValue(result);

      const req: any = {
        body: {
          email: 'test@example.com',
          password: 'Password123',
        },
      };

      const res = createResponse();

      await AuthController.register(req, res);

      expect(mockRegister).toHaveBeenCalledWith(
        'test@example.com',
        'Password123'
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Registration successful.',
        user: result.user,
        token: result.token,
      });
    });

    it('rejects missing email or password', async () => {
      const req: any = {
        body: {
          email: '',
          password: '',
        },
      };

      const res = createResponse();

      await AuthController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Email and password are required.',
      });

      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('rejects non-string email or password', async () => {
      const req: any = {
        body: {
          email: 123,
          password: 'Password123',
        },
      };

      const res = createResponse();

      await AuthController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('rejects passwords shorter than 8 characters', async () => {
      const req: any = {
        body: {
          email: 'test@example.com',
          password: 'short',
        },
      };

      const res = createResponse();

      await AuthController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error:
          'Email must be at most 255 characters and password must be between 8 and 72 characters.',
      });

      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('rejects passwords longer than 72 characters', async () => {
      const req: any = {
        body: {
          email: 'test@example.com',
          password: 'a'.repeat(73),
        },
      };

      const res = createResponse();

      await AuthController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('rejects email addresses longer than 255 characters', async () => {
      const req: any = {
        body: {
          email: `${'a'.repeat(250)}@b.com`,
          password: 'Password123',
        },
      };

      const res = createResponse();

      await AuthController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('rejects invalid email formats', async () => {
      const req: any = {
        body: {
          email: 'not-an-email',
          password: 'Password123',
        },
      };

      const res = createResponse();

      await AuthController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Please provide a valid email address.',
      });

      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('returns 409 when the email already exists', async () => {
      const error: any = new Error('Duplicate email');
      error.code = '23505';

      mockRegister.mockRejectedValue(error);

      const req: any = {
        body: {
          email: 'test@example.com',
          password: 'Password123',
        },
      };

      const res = createResponse();

      await AuthController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'An account with this email already exists.',
      });
    });

    it('handles unexpected registration errors', async () => {
      mockRegister.mockRejectedValue(
        new Error('Database unavailable')
      );

      const req: any = {
        body: {
          email: 'test@example.com',
          password: 'Password123',
        },
      };

      const res = createResponse();

      await AuthController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Database unavailable',
      });
    });
  });

  describe('login', () => {
    it('logs in successfully and returns 200', async () => {
      const result = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          created_at: new Date(),
        },
        token: 'test-token',
      };

      mockLogin.mockResolvedValue(result);

      const req: any = {
        body: {
          email: 'test@example.com',
          password: 'Password123',
        },
      };

      const res = createResponse();

      await AuthController.login(req, res);

      expect(mockLogin).toHaveBeenCalledWith(
        'test@example.com',
        'Password123'
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Login successful.',
        user: result.user,
        token: result.token,
      });
    });

    it('rejects missing login fields', async () => {
      const req: any = {
        body: {
          email: 'test@example.com',
          password: '',
        },
      };

      const res = createResponse();

      await AuthController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Email and password are required.',
      });

      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('rejects non-string login fields', async () => {
      const req: any = {
        body: {
          email: ['test@example.com'],
          password: 'Password123',
        },
      };

      const res = createResponse();

      await AuthController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('returns 401 for invalid credentials', async () => {
      mockLogin.mockRejectedValue(
        new Error('Invalid email or password.')
      );

      const req: any = {
        body: {
          email: 'test@example.com',
          password: 'WrongPassword',
        },
      };

      const res = createResponse();

      await AuthController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid email or password.',
      });
    });
  });
});