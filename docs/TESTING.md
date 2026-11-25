# Apex Ledger Testing Guide

This document describes the automated testing, build verification, concurrency testing, and performance testing procedures for Apex Ledger.

## Testing Stack

- Vitest — backend automated testing
- Supertest — HTTP/API testing
- TypeScript — static type checking and backend compilation
- ESLint — frontend code quality
- Vite — frontend production build
- Shell scripts and Node.js — concurrency and load testing

## 1. Backend Automated Tests

Navigate to the backend directory:

```bash
cd backend
```

Run the complete backend test suite:

```bash
npm test
```

Run tests in watch mode during development:

```bash
npm run test:watch
```

Run tests with coverage:

```bash
npm run test:coverage
```

The test suite covers authentication, API behavior, authorization middleware, idempotency, ledger controllers, and ledger transaction logic.

Test files are located in:

`backend/tests/`

## 2. Backend Build Verification

From the backend directory:

```bash
npm run build
```

This runs the TypeScript compiler to verify the backend source.

A successful build should complete without TypeScript compilation errors.

## 3. Frontend Linting

Navigate to the frontend:

```bash
cd ../frontend
```

Run ESLint:

```bash
npm run lint
```

Linting checks the frontend source for code-quality issues and potential errors.

## 4. Frontend Production Build

From the frontend directory:

```bash
npm run build
```

This runs TypeScript checking and creates an optimized Vite production build.

Generated production files are written to:

`frontend/dist/`

## 5. Concurrency Testing

A concurrency test is available in:

`backend/tests/load/concurrency-test.sh`

This test is intended to validate concurrent transfer behavior against the backend and database.

Run the script from the project root:

```bash
bash backend/tests/load/concurrency-test.sh
```

Concurrency testing focuses on:

- Simultaneous transfer requests
- Account balance consistency
- Preventing overspending
- Transaction settlement behavior
- Ledger consistency under concurrent activity

## 6. Concurrent Idempotency Testing

A concurrent idempotency test is available in:

`backend/tests/load/idempotency-concurrent-test.sh`

Run it from the project root:

```bash
bash backend/tests/load/idempotency-concurrent-test.sh
```

This test is intended to evaluate duplicate-request handling and idempotency protection under concurrent requests.

## 7. Performance Testing

The performance test is located at:

`backend/tests/load/performance-test.mjs`

It measures backend request performance under a controlled test workload.

Review the script before running it to confirm the target endpoint, test parameters, required environment variables, and database prerequisites.

Run it according to the script's configuration:

```bash
node backend/tests/load/performance-test.mjs
```

## 8. External Load Testing

An additional load test is located at:

`stress-tests/load-test.js`

This test is maintained separately from the backend automated test suite.

Before running external load tests:

- Verify that the intended API server is running.
- Confirm the test URL and request configuration.
- Use a dedicated test environment and test accounts.
- Avoid running load tests against production financial systems.

## 9. Previously Verified Results

The following results were recorded during controlled local testing:

| Test | Recorded result |
|---|---|
| Backend automated tests | 105 passed |
| Backend TypeScript build | Passed |
| Frontend ESLint | Passed |
| Frontend production build | Passed |
| Concurrent transfer load test | Passed in 2 runs |
| Successful transfers per load-test run | 20 |
| Failed transfers per load-test run | 0 |
| Concurrent requests | 5 |
| Ledger reconciliation | Passed in both runs |
| Throughput | 538.85 requests/second |
| Average response time | 8.72 ms |
| P95 response time | 19.37 ms |

These measurements represent previously observed results from a controlled local environment. They are not guarantees of production throughput, scalability, or performance.

## 10. Recommended Verification Sequence

Run the following checks before considering a code change ready:

### Backend

```bash
cd ~/Documents/my\ projects/bank-management-system/backend

npm test
npm run build
```

### Frontend

```bash
cd ~/Documents/my\ projects/bank-management-system/frontend

npm run lint
npm run build
```

### Ledger and concurrency

From the project root, run the concurrency and idempotency scripts after verifying their prerequisites and configuration:

```bash
bash backend/tests/load/concurrency-test.sh
bash backend/tests/load/idempotency-concurrent-test.sh
```

Review the final results and perform ledger reconciliation after the load tests.

## Testing Limitations

- Tests run in a controlled development environment.
- Load-test results depend on the local machine, database, Redis configuration, and workload.
- Simulated deposits and withdrawals do not test real payment-network integrations.
- Automated tests do not replace security audits, penetration testing, or production monitoring.
- Production capacity must be established through deployment-specific testing.
