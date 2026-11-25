# Deployment Guide

## 1. Deployment Status

Apex Ledger is currently a locally developed and tested full-stack banking
simulation application.

The project has passed backend tests, frontend linting, production builds,
and controlled concurrency testing.

It has not yet been deployed to a production hosting environment.

This guide describes the deployment requirements and preparation steps.

---

## 2. Architecture

The application consists of three primary services:

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL
- Cache and idempotency support: Redis

Production architecture should use:

- HTTPS for all external traffic
- A hosted frontend
- A private backend service
- A managed PostgreSQL database
- A managed Redis instance
- Environment variables for configuration and secrets

The frontend communicates with the backend API. The backend manages
authentication, wallet operations, transaction processing, and ledger entries.

---

## 3. Prerequisites

Before deploying, provision:

- Node.js compatible with the project's dependencies
- PostgreSQL
- Redis
- A frontend hosting service
- A backend hosting service
- A domain name and HTTPS configuration
- Secure environment variable management

PostgreSQL and Redis should not be exposed publicly unless access is
protected by appropriate network and authentication controls.

---

## 4. Environment Configuration

### Backend

Create a backend environment file based on:

    backend/.env.example

Required production variables:

| Variable | Purpose |
|---|---|
| PORT | Backend server port |
| NODE_ENV | Set to production |
| DATABASE_URL | PostgreSQL connection string |
| REDIS_URL | Redis connection string |
| JWT_SECRET | Secret used to sign authentication tokens |
| FRONTEND_URL | Production frontend origin |

Example configuration:

    NODE_ENV=production
    PORT=3000
    DATABASE_URL=your_secure_postgresql_connection_string
    REDIS_URL=your_secure_redis_connection_string
    JWT_SECRET=your_secure_random_secret
    FRONTEND_URL=https://your-frontend-domain.example

Do not use the example values in an actual deployment.

The JWT secret must be at least 32 bytes. Generate a strong,
cryptographically secure secret and store it in the hosting provider's
secret manager or environment configuration.

Never commit `.env` files, credentials, database passwords, or JWT secrets.

### Frontend

Create the frontend environment file using:

    frontend/.env.example

Configure the frontend API URL to point to the deployed backend.

Frontend environment variables exposed to the browser must not contain
private credentials or secrets.

---

## 5. Database Deployment

1. Provision a PostgreSQL database.
2. Create a dedicated application database user.
3. Configure the backend with the database connection string.
4. Apply the project's database schema.
5. Verify the required tables, constraints, indexes, and enum types.
6. Confirm that the backend can connect successfully.
7. Configure backups and a recovery strategy.

The application uses a ledger-based accounting design.

Wallet balances are derived from ledger entries rather than being treated
as the authoritative balance stored in a single mutable balance column.

Production database access should be restricted to the application and
authorized administrative services.

---

## 6. Redis Deployment

Provision a Redis service and configure:

    REDIS_URL

Redis is used for application caching and idempotency-related functionality.

Production Redis should have:

- Restricted network access
- Authentication or provider-managed access controls
- Appropriate TLS configuration when required by the provider
- Monitoring
- An appropriate persistence and recovery policy

The database remains the authoritative source for financial transaction
records.

---

## 7. Backend Build and Startup

From the backend directory:

    cd backend
    npm install
    npm run build

The backend must compile successfully before deployment.

Start the backend using the project's production start script,
after confirming the available scripts in `backend/package.json`.

Set:

    NODE_ENV=production

The backend performs production environment validation during startup.

Verify the health endpoint after deployment:

    GET /health

Expected response:

    {
      "status": "UP",
      "message": "Bank Management System API is running"
    }

Verify that the application can connect to PostgreSQL and Redis.

---

## 8. Frontend Build

From the frontend directory:

    cd frontend
    npm install
    npm run lint
    npm run build

The production build output is generated in:

    frontend/dist

Deploy the generated static assets using a static frontend hosting service.

Configure the frontend's API endpoint to use the deployed backend URL,
not localhost.

---

## 9. Deployment Sequence

Recommended deployment sequence:

1. Provision PostgreSQL and Redis.
2. Configure production secrets and environment variables.
3. Initialize and verify the database schema.
4. Deploy the backend.
5. Verify backend startup and health checks.
6. Configure the frontend API endpoint.
7. Build the frontend.
8. Deploy the frontend static assets.
9. Configure HTTPS and allowed frontend origins.
10. Test registration, login, account creation, transfers, deposits,
    withdrawals, and transaction history.
11. Run reconciliation checks.
12. Verify logging, monitoring, backups, and recovery procedures.

---

## 10. Production Security Checklist

Before allowing external users:

- [ ] HTTPS enabled for frontend and API
- [ ] Strong production JWT secret configured
- [ ] Production environment variables configured
- [ ] No secrets committed to Git
- [ ] PostgreSQL access restricted
- [ ] Redis access restricted
- [ ] Production frontend origin configured
- [ ] CORS reviewed and restricted
- [ ] Authentication and API rate limits reviewed
- [ ] Database backups configured
- [ ] Recovery procedure tested
- [ ] Error logs reviewed for sensitive data
- [ ] Monitoring and alerting configured
- [ ] Dependency vulnerabilities reviewed
- [ ] Production smoke tests completed
- [ ] Ledger reconciliation verified

---

## 11. Financial System Limitations

This project is a portfolio and educational banking simulation.

Deposits and withdrawals use simulated internal clearing accounts.

The system does not currently connect to:

- Real bank accounts
- Payment networks
- Card processors
- Open banking providers
- External settlement infrastructure

The project should not be used to hold, transfer, or process real customer funds.

A real financial deployment would require additional security controls,
operational processes, compliance requirements, payment integrations,
monitoring, incident response, and independent security review.

---

## 12. Deployment Verification

After deployment, verify:

- Frontend loads over HTTPS.
- Backend health endpoint responds.
- Database connection succeeds.
- Redis connection succeeds.
- User registration works.
- User authentication works.
- Wallet creation works.
- Transfers work.
- Idempotency prevents duplicate processing.
- Deposits and withdrawals work as simulated operations.
- Transaction history loads.
- Insufficient-funds requests are rejected.
- Concurrent transfers preserve ledger consistency.
- Reconciliation reports no ledger inconsistencies.

---

## 13. Future Deployment Improvements

Potential future improvements include:

- Docker and Docker Compose
- CI/CD pipeline
- Automated deployment
- Database migration tooling
- Structured logging
- Centralized monitoring
- Distributed tracing
- Production backup automation
- Disaster recovery testing
- Security scanning
- Dedicated staging environment
- Automated smoke tests
- Infrastructure as Code
