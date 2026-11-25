# Engineering Trade-offs and Design Decisions

## 1. Overview

Apex Ledger was designed to demonstrate financial transaction integrity, concurrency safety, and maintainable full-stack application architecture.

This document explains the major engineering decisions and their trade-offs.

## 2. Double-Entry Ledger vs. Direct Balance Updates

**Decision:** Use a double-entry ledger as the source of truth for account balances.

**Reasoning:**

A directly editable balance column can become inconsistent when multiple transactions occur concurrently or when partial updates fail.

A double-entry ledger records both sides of each financial movement and provides an auditable transaction history.

**Trade-off:**

- Advantages: auditability, traceability, and stronger financial consistency.
- Disadvantages: more complex transaction logic and balance calculations.

## 3. PostgreSQL Transactions and Row-Level Locking

**Decision:** Use PostgreSQL ACID transactions and `SELECT ... FOR UPDATE`.

**Reasoning:**

Concurrent transfers must not spend the same available funds.

Row-level locks protect affected accounts while the transaction validates balances and records ledger entries.

Accounts are locked in deterministic order to reduce deadlock risk.

**Trade-off:**

- Advantages: strong consistency and reliable concurrent transaction handling.
- Disadvantages: locks can reduce throughput when many operations target the same accounts.

## 4. Idempotency Keys

**Decision:** Require idempotency keys for financial posting requests.

**Reasoning:**

Clients may retry requests after timeouts or network failures. Without idempotency protection, retries can create duplicate transactions.

The backend checks existing requests and scopes transfer idempotency keys by user.

**Trade-off:**

- Advantages: safer request retries and reduced duplicate-posting risk.
- Disadvantages: additional storage, validation, and request-matching complexity.

## 5. PostgreSQL as the Source of Truth

**Decision:** Keep durable financial records in PostgreSQL.

**Reasoning:**

Financial transactions require persistent, transactional storage with relational constraints and reliable commit/rollback behavior.

Redis is used as a supporting component rather than as the authoritative financial ledger.

**Trade-off:**

- Advantages: durable records and ACID guarantees.
- Disadvantages: database performance and availability are critical to the application.

## 6. Redis Integration

**Decision:** Integrate Redis for supporting fast operations, including idempotency-related caching.

**Reasoning:**

Redis can reduce repeated work and provide low-latency access to temporary data.

**Trade-off:**

- Advantages: fast access and reduced database workload for suitable operations.
- Disadvantages: introduces another service to operate, monitor, and recover.

PostgreSQL remains responsible for durable transaction records.

## 7. JWT Authentication

**Decision:** Use JSON Web Tokens for API authentication.

**Reasoning:**

JWTs allow the backend to authenticate requests without maintaining a traditional server-side session for every user.

**Trade-off:**

- Advantages: stateless API authentication and straightforward frontend integration.
- Disadvantages: token expiration, revocation, and secure storage require careful handling.

## 8. React and TypeScript

**Decision:** Use React and TypeScript for the frontend.

**Reasoning:**

React supports reusable UI components and interactive dashboards. TypeScript helps identify type-related problems during development.

**Trade-off:**

- Advantages: maintainability, component reuse, and improved development-time type safety.
- Disadvantages: additional tooling and type-definition complexity.

## 9. Simulated Deposits and Withdrawals

**Decision:** Represent deposits and withdrawals as internal ledger postings using system clearing accounts.

**Reasoning:**

This demonstrates balanced accounting entries without requiring external payment-provider integration.

**Trade-off:**

- Advantages: realistic internal accounting flow without external dependencies.
- Disadvantages: does not demonstrate real payment processing, bank connectivity, or settlement.

## 10. Automated Testing

**Decision:** Use Vitest for backend automated tests.

**Reasoning:**

Automated tests help verify transaction behavior, validation, error handling, and idempotency logic.

**Trade-off:**

- Advantages: repeatable verification and faster regression detection.
- Disadvantages: mocked tests cannot fully reproduce every production database, network, and concurrency condition.

Additional integration and load testing are still required.

## 11. Current Limitations and Future Improvements

Potential future improvements include:

- Production deployment with managed PostgreSQL and Redis
- Load and stress testing under realistic workloads
- External payment-provider integration
- Refresh-token and token-revocation strategy
- Structured logging and monitoring
- Database backup and disaster-recovery procedures
- Automated CI/CD pipelines
- Stronger operational controls and security review

## 12. Conclusion

The system prioritizes financial correctness, traceability, and safe transaction processing over implementation simplicity.

The main architectural choice is to treat the ledger as the source of truth and use database transactions, row-level locking, and idempotency controls to protect financial operations.