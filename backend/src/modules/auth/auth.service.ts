import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../../config/database.ts';

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is missing from environment variables.');
  }

  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must be at least 32 bytes long.');
  }

  return secret;
};

const JWT_EXPIRES_IN = '1h';

export class AuthService {
  static async register(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await db.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [normalizedEmail, passwordHash]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email },
      getJwtSecret(),
      {
  algorithm: 'HS256',
  expiresIn: JWT_EXPIRES_IN,
  issuer: 'apex-ledger-api',
  audience: 'apex-ledger-client'
}
    );

    return { user, token };
  }

  static async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const result = await db.query(
      `SELECT id, email, password_hash, created_at
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0 || !result.rows[0].password_hash) {
      throw new Error('Invalid email or password.');
    }

    const user = result.rows[0];

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      throw new Error('Invalid email or password.');
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      getJwtSecret(),
      {
  algorithm: 'HS256',
  expiresIn: JWT_EXPIRES_IN,
  issuer: 'apex-ledger-api',
  audience: 'apex-ledger-client'
}
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at
      },
      token
    };
  }
}
