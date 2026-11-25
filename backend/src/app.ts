
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { AuthController } from './modules/auth/auth.controller.ts';
import { LedgerController } from './modules/ledger/ledger.controller.ts';
import { InternalController } from './modules/ledger/internal.controller.ts';
import { db } from './config/database.ts';

import { authenticateToken } from './middleware/auth.middleware.ts';
import type { AuthenticatedRequest } from './middleware/auth.middleware.ts';
import { idempotencyMiddleware } from './middleware/idempotency.ts';
import {
  validateBody,
  transferSchema,
  internalPostingSchema
} from './middleware/validate.middleware.ts';


const app = express();

app.use(helmet());

// ==========================================
// MIDDLEWARE CONFIGURATION
// ==========================================

const allowedOrigins =
  process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL].filter(
        (origin): origin is string => Boolean(origin)
      )
    : [
        'http://localhost:5173',
        'http://localhost:5174',
      ];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  allowedHeaders: [
    'Content-Type',
    'X-Idempotency-Key',
    'Authorization',
  ],
}));

app.use(express.json({ limit: '10kb' }));


const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please try again later.'
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please try again in 15 minutes.'
  }
});

app.use('/api', apiLimiter);

// ==========================================
// DATABASE CONNECTION
// ==========================================

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

app.post('/api/auth/register', authLimiter, AuthController.register);
app.post('/api/auth/login', authLimiter, AuthController.login);

// ==========================================
// PROTECTED ACCOUNT ROUTES
// ==========================================

// GET /api/accounts
// Returns only accounts belonging to the authenticated user.
app.get('/api/accounts', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const result = await db.query(
      `SELECT
        a.id,
        a.user_id,
        a.currency,
        COALESCE(SUM(le.amount), 0)::numeric(18,4) AS balance
       FROM accounts a
       LEFT JOIN ledger_entries le
         ON le.account_id = a.id
       WHERE a.user_id = $1
       GROUP BY a.id, a.user_id, a.currency, a.created_at
       ORDER BY a.created_at ASC`,
      [userId]
    );

    return res.json(result.rows);

  } catch (err: any) {
    console.error('Failed to fetch accounts:', err);

    return res.status(500).json({
      error: 'Failed to fetch accounts',
      details: err.message
    });
  }
});


 // POST /api/accounts
 // Creates a new wallet for the authenticated user.
app.post('/api/accounts', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const currency =
      typeof req.body.currency === 'string'
        ? req.body.currency.trim().toUpperCase()
        : '';

    const supportedCurrencies = ['SGD', 'USD', 'EUR', 'GBP'];

    if (!supportedCurrencies.includes(currency)) {
      return res.status(400).json({
        error: 'Unsupported currency. Use SGD, USD, EUR, or GBP.',
      });
    }

    const result = await db.query(
      `INSERT INTO accounts (user_id, currency)
       VALUES ($1, $2)
       RETURNING id, user_id, currency, created_at`,
      [userId, currency]
    );

    return res.status(201).json({
      message: 'Wallet created successfully.',
      account: {
        ...result.rows[0],
        balance: '0.0000',
      },
    });

  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'You already have a wallet in this currency.',
      });
    }

    console.error('Failed to create wallet:', err);

    return res.status(500).json({
      error: 'Failed to create wallet.',
    });
  }
});



 // ==========================================
 // PROTECTED TRANSACTION ROUTE
 // ==========================================

 // GET /api/transactions?page=1&limit=10
 // Returns paginated transactions involving the authenticated user.
 app.get('/api/transactions', authenticateToken, async (req: AuthenticatedRequest, res) => {
   try {
     const userId = req.user!.id;

     // Parse and validate pagination parameters.
     const pageParam = Number(req.query.page ?? 1);
     const limitParam = Number(req.query.limit ?? 10);

     if (
       !Number.isInteger(pageParam) ||
       pageParam < 1 ||
       !Number.isInteger(limitParam) ||
       limitParam < 1 ||
       limitParam > 100
     ) {
       return res.status(400).json({
         error: 'Invalid pagination parameters. Page must be >= 1 and limit must be between 1 and 100.',
       });
     }

     const page = pageParam;
     const limit = limitParam;
     const offset = (page - 1) * limit;

     // Count all transactions involving the authenticated user's accounts.
     const countResult = await db.query(
       `SELECT COUNT(*)::int AS total
        FROM transactions t
        WHERE EXISTS (
          SELECT 1
          FROM accounts a
          WHERE a.user_id = $1
            AND (
              a.id = t.sender_account_id
              OR a.id = t.receiver_account_id
            )
        )`,
       [userId]
     );

     const total = countResult.rows[0].total;
     const totalPages = Math.ceil(total / limit);

     // Fetch the requested page.
     const result = await db.query(
       `SELECT
          t.id,
          t.idempotency_key,
          t.sender_account_id,
          t.receiver_account_id,
          t.amount,
          t.currency,
          t.fx_rate,
          t.status,
          t.created_at
        FROM transactions t
        WHERE EXISTS (
          SELECT 1
          FROM accounts a
          WHERE a.user_id = $1
            AND (
              a.id = t.sender_account_id
              OR a.id = t.receiver_account_id
            )
        )
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT $2 OFFSET $3`,
       [userId, limit, offset]
     );

     return res.json({
       transactions: result.rows,
       pagination: {
         page,
         limit,
         total,
         totalPages,
         hasNextPage: page < totalPages,
         hasPreviousPage: page > 1,
       },
     });

   } catch (err: any) {
     console.error('Failed to fetch transactions:', err);

     return res.status(500).json({
  error: 'Failed to fetch transactions'
});
   }
 });


// ==========================================
// PROTECTED TRANSFER ROUTE
// ==========================================

// POST /api/transfers
// Requires authentication before idempotency checking and transfer execution.
app.post(
  '/api/transfers',
  authenticateToken,
  validateBody(transferSchema),
  idempotencyMiddleware,
  LedgerController.transferFunds
);

// ==========================================
// PROTECTED DEPOSIT & WITHDRAWAL ROUTES
// ==========================================

// POST /api/deposits
app.post(
  '/api/deposits',
  authenticateToken,
  validateBody(internalPostingSchema),
  idempotencyMiddleware,
  InternalController.deposit
);

// POST /api/withdrawals
app.post(
  '/api/withdrawals',
  authenticateToken,
  validateBody(internalPostingSchema),
  idempotencyMiddleware,
  InternalController.withdraw
);

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/health', (_req, res) => {
  res.json({
    status: 'UP',
    message: 'Bank Management System API is running'
  });
});

// ==========================================
// CENTRALIZED ERROR HANDLING
// ==========================================


app.use((err: any, req: any, res: any, next: any) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Request body exceeds the 10 KB limit.'
    });
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Invalid JSON request body.'
    });
  }

  console.error('Unhandled application error:', err);

  return res.status(500).json({
    error: 'Internal server error.'
  });
});


export default app;
