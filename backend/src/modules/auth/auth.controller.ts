import type { Request, Response } from 'express';
import { AuthService } from './auth.service.ts';

export class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        !email.trim() ||
        !password
      ) {
        return res.status(400).json({
          error: 'Email and password are required.'
        });
      }

      if (email.length > 255 || password.length < 8 || password.length > 72) {
        return res.status(400).json({
          error: 'Email must be at most 255 characters and password must be between 8 and 72 characters.'
        });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({
          error: 'Please provide a valid email address.'
        });
      }

      const result = await AuthService.register(email, password);

      return res.status(201).json({
        message: 'Registration successful.',
        user: result.user,
        token: result.token
      });
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'An account with this email already exists.'
        });
      }

      return res.status(400).json({
        error: error.message || 'Registration failed.'
      });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        !email.trim() ||
        !password
      ) {
        return res.status(400).json({
          error: 'Email and password are required.'
        });
      }

      const result = await AuthService.login(email, password);

      return res.status(200).json({
        message: 'Login successful.',
        user: result.user,
        token: result.token
      });
    } catch (error: any) {
      return res.status(401).json({
        error: error.message || 'Login failed.'
      });
    }
  }
}
