# Apex Ledger — Banking & FinTech System

A full-stack banking application demonstrating secure account management, peer-to-peer transfers, double-entry bookkeeping, transaction integrity, and concurrency-safe ledger operations.

## Project Overview

Apex Ledger is a simulated banking system built to demonstrate how financial applications can maintain accurate account balances and prevent common transaction problems such as double-spending, duplicate requests, and race conditions.

The system uses a PostgreSQL-backed double-entry ledger as its source of truth rather than relying on a directly editable balance column.

## Features

- User registration and JWT-based authentication
- Multiple currency accounts (SGD, USD, EUR, GBP)
- Peer-to-peer transfers
- Deposits and withdrawals through internal system accounts
- Double-entry ledger accounting
- PostgreSQL ACID transactions
- Account locking to protect concurrent transfers
- Idempotency protection against duplicate requests
- Redis integration
- Transaction history with pagination
- Frontend dashboard built with React and TypeScript
- Automated backend tests

## Technology Stack

**Frontend**
- React
- TypeScript
- Vite
- Tailwind CSS
- Axios
- Lucide React

**Backend**
- Node.js
- Express
- TypeScript
- PostgreSQL
- Redis
- JSON Web Tokens
- bcryptjs
- Vitest

## Project Structure

```text
bank-management-system/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── db/
│   │   ├── middleware/
│   │   └── modules/
│   │       ├── auth/
│   │       └── ledger/
│   ├── tests/
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   ├── package.json
│   └── .env.example
├── docs/
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── TESTING.md
│   └── TRADEOFFS.md
├── stress-tests/
├── .env.example
└── README.md
```

## Prerequisites

Install the following before running the project:

- Node.js
- npm
- PostgreSQL
- Redis

## Local Development Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd bank-management-system
```

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
npm install
```

Update `backend/.env` with your local PostgreSQL connection string and a secure JWT secret.

### 3. Configure the database

Ensure PostgreSQL is running and that the database user has the required permissions.

Run the database setup script:

```bash
node --experimental-strip-types src/db/setup.ts
```

This applies the database schema and migrations.

### 4. Start the backend

```bash
npm run dev
```

The backend runs on port `3000` by default.

### 5. Configure the frontend

Open a second terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The frontend runs on the Vite development server, normally at:

```text
http://localhost:5173
```

The frontend API URL defaults to:

```text
http://localhost:3000/api
```

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a user |
| POST | `/api/auth/login` | Authenticate a user |
| GET | `/api/accounts` | Retrieve user's accounts |
| POST | `/api/accounts` | Create an account |
| GET | `/api/transactions` | Retrieve paginated transaction history |
| POST | `/api/transfers` | Transfer funds |
| POST | `/api/deposits` | Create an internal deposit posting |
| POST | `/api/withdrawals` | Create an internal withdrawal posting |
| GET | `/health` | Health check |

Protected endpoints require JWT authentication. Financial posting requests also require an `X-Idempotency-Key` header.

## Documentation

- [API Reference](docs/API.md) — endpoint details, authentication, request and response formats
- [Architecture](docs/ARCHITECTURE.md) — system design and technical architecture
- [Testing Guide](docs/TESTING.md) — automated tests, concurrency testing, and verification
- [Deployment Guide](docs/DEPLOYMENT.md) — deployment instructions and production considerations
- [Technical Tradeoffs](docs/TRADEOFFS.md) — design decisions, limitations, and tradeoffs

## Financial Integrity

The ledger uses double-entry accounting. Each settled transaction records corresponding debit and credit entries so that the ledger remains balanced.

Transfers use PostgreSQL transactions and deterministic account-locking order to protect against concurrent balance changes.

Idempotency keys help prevent duplicate financial operations when clients retry requests.

Account balances are calculated from ledger entries.

**Important:** Deposits and withdrawals are simulated internal ledger postings. They do not connect to a real bank, payment processor, or external settlement network. A matching system clearing account must exist for the relevant currency.

### Verification Results

- Backend TypeScript build: passed
- Backend automated tests: 105 tests passed
- Frontend ESLint: passed
- Frontend production build: passed
- Controlled concurrent transfer load test: passed (2 runs)
- Load-test transfers: 20 successful per run, 0 failures
- Concurrent requests: 5
- Ledger reconciliation: passed on both runs

Latest load-test run:
- Throughput: 538.85 requests/second
- Average response time: 8.72 ms
- P95 response time: 19.37 ms

These are local development test results from a controlled environment. They do not establish production-scale capacity, production deployment, or independent security certification.

## Current Project Status

Core banking functionality, frontend development, automated testing, concurrency verification, and project documentation are complete. Remaining work includes actual production deployment, final production-readiness review, and portfolio/demo preparation.

## Disclaimer

This is an educational FinTech project. It is not a real banking service and must not be used to store, transfer, or manage actual funds.

## Controlled Load Testing

The project includes a controlled concurrent transfer test.

From the project root, configure the required test environment variables
and start the backend before running:

```bash
node stress-tests/load-test.js