# Apex Ledger
### High-Concurrency Banking & FinTech Ledger Platform

A full-stack FinTech application focused on secure financial transactions, double-entry accounting, and concurrency-safe ledger operations.

Apex Ledger demonstrates how a financial backend can maintain transaction integrity under concurrent workloads through PostgreSQL ACID transactions, deterministic account locking, and idempotent request handling.

Unlike a conventional banking CRUD application, account balances are derived from a double-entry ledger rather than maintained as directly editable balance fields.

**Key engineering highlights**
- Double-entry bookkeeping with ledger-derived account balances
- Concurrency-safe peer-to-peer transfers using PostgreSQL row-level locking
- Idempotency protection against duplicate financial requests
- JWT authentication and user-scoped account access
- Redis integration and automated backend testing

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


## Engineering Challenges & Solutions

| Engineering Challenge | Implementation |
|---|---|
| Concurrent transfers and double-spending | PostgreSQL ACID transactions, row-level locking, and deterministic account-lock ordering |
| Duplicate financial requests | User-scoped idempotency keys, PostgreSQL unique constraints, and Redis response caching |
| Financial data consistency | Double-entry ledger with debit and credit entries |
| Balance accuracy | Account balances derived from ledger entries |
| Unauthorized account access | JWT authentication and user-scoped account ownership checks |
| Transaction atomicity | PostgreSQL database transactions |

These design decisions help preserve financial consistency, prevent duplicate transaction processing, and protect account balances under concurrent workloads.

## Technology Stack

**Frontend**
- React 19
- TypeScript
- Vite
- Tailwind CSS
- Axios
- Lucide React

**Backend**
- Node.js
- Express 5
- TypeScript
- PostgreSQL (`pg`)
- Redis (`ioredis`)
- Zod for request validation

**Security & Authentication**
- JSON Web Tokens (JWT)
- bcryptjs for password hashing
- Helmet for HTTP security headers
- CORS
- Express Rate Limit

**Testing**
- Vitest
- Supertest
- Controlled concurrent transfer load testing

**Development Tools**
- ESLint
- Prettier
- TypeScript compiler

## Project Structure

```text
bank-management-system/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── db/
│   │   │   └── migrations/
│   │   ├── middleware/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   └── ledger/
│   │   ├── app.ts
│   │   └── server.ts
│   ├── tests/
│   │   ├── api.test.ts
│   │   ├── auth.controller.test.ts
│   │   ├── auth.middleware.test.ts
│   │   ├── auth.service.test.ts
│   │   ├── idempotency.middleware.test.ts
│   │   ├── ledger.controller.test.ts
│   │   └── ledger.service.test.ts
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── assets/
│   │   ├── services/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── .env.example
│   └── .env.production.example
├── stress-tests/
│   ├── load-test.js
│   └── package.json
├── docs/
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── TESTING.md
│   └── TRADEOFFS.md
├── .env.example
└── README.md
```

## Prerequisites

Install the following before running the project:

- Node.js 24 or later
- npm
- PostgreSQL 18 or compatible
- Redis 8 or compatible

The instructions below use macOS and Homebrew for local Redis installation.

## Local Development Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd bank-management-system
```
### 2. Install and start Redis

On macOS with Homebrew:

```bash
brew install redis
brew services start redis
```

### 3. Configure and install the backend

Open a terminal in the project root:

```bash
cd backend
cp .env.example .env
npm install
```

Update `backend/.env` with your local PostgreSQL connection string, Redis URL, and a secure JWT secret.

### 4. Configure the database

Ensure PostgreSQL is running and that the configured database user has permission to connect to the PostgreSQL server and create databases.

The setup script creates `bank_ledger_db` if it does not already exist, then applies the database schema and migrations.

Run the database setup script from the `backend` directory:

```bash
node --experimental-strip-types src/db/setup.ts
```

### 5. Start the backend

From the `backend` directory:

```bash
npm run dev
```

The backend runs on port `3000` by default.

### 6. Configure and start the frontend

Open a second terminal in the project root:

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

Previously recorded local load-test benchmark:
- Throughput: 538.85 requests/second
- Average response time: 8.72 ms
- P95 response time: 19.37 ms

These are local development test results from a controlled environment. They do not establish production-scale capacity, production deployment, or independent security certification.

## Current Project Status

Core banking functionality, frontend development, automated testing, concurrency verification, and project documentation are complete. Remaining work includes actual production deployment, final production-readiness review, and portfolio/demo preparation.

## Disclaimer

This is an educational FinTech project. It is not a real banking service and must not be used to store, transfer, or manage actual funds.

## Controlled Load Testing

The project includes a controlled concurrent transfer test that sends requests
through the authenticated transfer API and verifies the resulting wallet balances.

### Prerequisites

- PostgreSQL and Redis must be running.
- The backend API must be running.
- Two dedicated test users must exist, each with an SGD wallet.
- The sender wallet must have sufficient funds for all requested transfers.
- The sender and receiver must be different users and have different wallet IDs.

Use dedicated test accounts and disposable test funds. This script performs real
ledger postings in the configured database.

### Configuration

Set the following environment variables:

| Variable | Description |
|---|---|
| `CONFIRM_LOAD_TEST` | Must be `true` to authorize test transfers |
| `LOAD_TEST_EMAIL` | Sender test-user email |
| `LOAD_TEST_PASSWORD` | Sender test-user password |
| `LOAD_TEST_RECEIVER_EMAIL` | Receiver test-user email |
| `LOAD_TEST_RECEIVER_PASSWORD` | Receiver test-user password |
| `LOAD_TEST_SENDER_ID` | Sender SGD wallet ID |
| `LOAD_TEST_RECEIVER_ID` | Receiver SGD wallet ID |

Optional settings:

| Variable | Default | Description |
|---|---:|---|
| `API_URL` | `http://localhost:3000/api` | Backend API base URL |
| `LOAD_TEST_AMOUNT` | `0.01` | SGD amount per transfer |
| `LOAD_TEST_REQUESTS` | `20` | Number of transfer requests (maximum 20) |
| `LOAD_TEST_CONCURRENCY` | `5` | Number of concurrent workers |

### Run the test

Export the required variables in your terminal, replacing the placeholders
with your dedicated test-account details:

```bash
export CONFIRM_LOAD_TEST=true
export LOAD_TEST_EMAIL="sender@example.com"
export LOAD_TEST_PASSWORD="your-sender-test-password"
export LOAD_TEST_RECEIVER_EMAIL="receiver@example.com"
export LOAD_TEST_RECEIVER_PASSWORD="your-receiver-test-password"
export LOAD_TEST_SENDER_ID="your-sender-wallet-id"
export LOAD_TEST_RECEIVER_ID="your-receiver-wallet-id"

node stress-tests/load-test.js

```

The script authenticates both users, verifies wallet ownership and currency, checks the sender's available balance, and submits concurrent transfers with unique idempotency keys.

After the requests finish, it retrieves both wallet balances and reconciles the actual balances against the expected balances calculated from successful transfers. The test exits with an error if reconciliation fails.

The script is limited to 20 requests per run. Do not point it at a production environment or use real customer accounts or funds.
