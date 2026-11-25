# Apex Ledger API Reference

A REST API for a multi-currency wallet and double-entry settlement ledger.

## Base URL

Local development:

`http://localhost:3000`

All request and response bodies use JSON.

## Supported currencies

- SGD
- USD
- EUR
- GBP

## Authentication

Protected endpoints require a JWT.

Include the token in the request header:

`Authorization: Bearer <token>`

Tokens are signed using HS256 and expire after 1 hour.

---

## Endpoints

| Method | Endpoint | Authentication | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Register a user |
| POST | `/api/auth/login` | No | Authenticate a user |
| GET | `/api/accounts` | Yes | List wallets and ledger-derived balances |
| POST | `/api/accounts` | Yes | Create a currency wallet |
| GET | `/api/transactions` | Yes | Get paginated transaction history |
| POST | `/api/transfers` | Yes | Transfer funds between wallets |
| POST | `/api/deposits` | Yes | Post an internal simulated deposit |
| POST | `/api/withdrawals` | Yes | Post an internal simulated withdrawal |
| GET | `/health` | No | Health check |

---

## 1. Register

### `POST /api/auth/register`

Creates a user account.

Request:

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

Validation:

- Email must be valid and no longer than 255 characters.
- Password must contain between 8 and 72 characters.
- Email is normalized to lowercase and trimmed.

Success: `201 Created`

Returns a registration message, user information, and JWT.

Possible errors:

- `400` — Invalid input
- `409` — Email already registered
- `429` — Rate limit exceeded

---

## 2. Login

### `POST /api/auth/login`

Authenticates a user.

Request:

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

Success: `200 OK`

Returns a login message, user information, and JWT.

Possible errors:

- `400` — Invalid request
- `401` — Invalid credentials
- `429` — Rate limit exceeded

---

## 3. List wallets

### `GET /api/accounts`

Returns wallets belonging to the authenticated user.

Header:

`Authorization: Bearer <token>`

Success: `200 OK`

Returns an array of wallet objects containing:

- `id`
- `user_id`
- `currency`
- `balance`

Balances are calculated from ledger entries rather than maintained as a mutable balance column.

---

## 4. Create wallet

### `POST /api/accounts`

Creates a wallet for a supported currency.

Request:

```json
{
  "currency": "SGD"
}
```

Supported values: `SGD`, `USD`, `EUR`, `GBP`.

Success: `201 Created`

Example response:

```json
{
  "message": "Wallet created successfully.",
  "account": {
    "id": "ACCOUNT_UUID",
    "user_id": "USER_UUID",
    "currency": "SGD",
    "created_at": "TIMESTAMP",
    "balance": "0.0000"
  }
}
```

Possible errors:

- `400` — Unsupported currency
- `401` — Authentication required
- `409` — Wallet already exists for that currency
- `500` — Server error

---

## 5. Transaction history

### `GET /api/transactions`

Returns transactions involving the authenticated user's wallets.

Query parameters:

| Parameter | Default | Constraints |
|---|---|---|
| `page` | `1` | Integer >= 1 |
| `limit` | `10` | Integer between 1 and 100 |

Example:

`GET /api/transactions?page=1&limit=10`

Success: `200 OK`

Response structure:

```json
{
  "transactions": [],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

Transactions are returned newest first.

Possible errors:

- `400` — Invalid pagination parameters
- `401` — Authentication required
- `500` — Server error

---

## 6. Transfer funds

### `POST /api/transfers`

Transfers funds between customer wallets using the double-entry ledger engine.

Required headers:

| Header | Description |
|---|---|
| `Authorization` | Bearer JWT |
| `Content-Type` | `application/json` |
| `X-Idempotency-Key` | Unique key for the transfer request, max 200 characters |

Request:

```json
{
  "senderAccountId": "SENDER_UUID",
  "receiverAccountId": "RECEIVER_UUID",
  "amount": 10.50,
  "currency": "SGD"
}
```

Validation:

- Account IDs must be valid UUIDs.
- Amount must be positive and finite.
- Amount may be a number or decimal string with up to 4 decimal places.
- Currency must be one of `SGD`, `USD`, `EUR`, `GBP`.
- Unknown request fields are rejected.
- Sender must belong to the authenticated user.
- Idempotency keys are scoped to the user.

Success:

- `201 Created` — New transfer settled
- `200 OK` — Previously processed request returned

Possible errors:

- `400` — Invalid request or missing idempotency key
- `401` — Authentication required
- `422` — Settlement rejected, including insufficient funds or invalid transfer conditions
- `500` — Unexpected server error

---

## 7. Deposit

### `POST /api/deposits`

Posts an internal simulated deposit into a customer wallet through the double-entry ledger.

Required headers:

- `Authorization: Bearer <token>`
- `Content-Type: application/json`
- `X-Idempotency-Key: <unique-key>`

Request:

```json
{
  "accountId": "ACCOUNT_UUID",
  "amount": 100.00
}
```

The currency is determined by the selected wallet.

Success:

- `201 Created` — Deposit posted
- `200 OK` — Previously processed deposit returned

Possible errors:

- `400` — Invalid request or idempotency header
- `401` — Authentication required
- `404` — Customer account not found
- `403` — Operation not permitted on account
- `422` — Invalid posting or ledger error
- `503` — Clearing account unavailable for the currency
- `500` — Server error

**Note:** Deposits are simulated internal ledger postings. They are not connected to external banks, payment gateways, or real money.

---

## 8. Withdrawal

### `POST /api/withdrawals`

Posts an internal simulated withdrawal from a customer wallet through the double-entry ledger.

Required headers:

- `Authorization: Bearer <token>`
- `Content-Type: application/json`
- `X-Idempotency-Key: <unique-key>`

Request:

```json
{
  "accountId": "ACCOUNT_UUID",
  "amount": 25.00
}
```

The currency is determined by the selected wallet.

Success:

- `201 Created` — Withdrawal posted
- `200 OK` — Previously processed withdrawal returned

Possible errors:

- `400` — Invalid request or idempotency header
- `401` — Authentication required
- `404` — Customer account not found
- `403` — Operation not permitted on account
- `422` — Insufficient funds or posting error
- `503` — Clearing account unavailable for the currency
- `500` — Server error

Withdrawals cannot exceed the wallet's available ledger balance.

**Note:** Withdrawals are simulated internal ledger postings. They do not send funds to an external bank.

---

## 9. Health check

### `GET /health`

Checks the API's basic availability.

Authentication is not required.

Success: `200 OK`

Example:

```json
{
  "status": "UP",
  "message": "Bank Management System API is running"
}
```

---

## Idempotency

Idempotency prevents repeated requests from creating duplicate transactions.

Use a unique `X-Idempotency-Key` for each new transfer, deposit, or withdrawal.

The system implements:

- User-scoped idempotency keys
- Redis response caching
- 24-hour cache TTL for successful HTTP responses
- Database-level idempotency checks
- Transaction-detail verification for reused internal posting keys
- Unique database constraints for transaction idempotency

Reusing a key for the same operation can return the original result. Reusing a key with different transaction details may be rejected.

For a new transaction, generate a new idempotency key.

---

## Rate limiting

API requests are rate-limited.

| Scope | Limit | Window |
|---|---|---|
| General `/api` routes | 100 requests | 15 minutes |
| Authentication routes | 10 requests | 15 minutes |

Rate-limit responses use HTTP `429 Too Many Requests`.

---

## Security and request handling

- JWT authentication on protected endpoints
- Helmet security headers
- CORS restrictions
- JSON request body limit of 10 KB
- Zod request validation
- Strict validation on transfer request bodies
- User-scoped account and transaction access
- Password hashing using bcrypt
- PostgreSQL transactional ledger posting

---

## Common HTTP status codes

| Status | Meaning |
|---|---|
| `200` | Successful request or idempotent replay |
| `201` | Resource or transaction successfully created |
| `400` | Invalid request |
| `401` | Authentication required or invalid credentials |
| `403` | Operation forbidden |
| `404` | Resource not found |
| `409` | Conflict, such as duplicate wallet |
| `413` | Request body too large |
| `422` | Validation or transaction processing failure |
| `429` | Rate limit exceeded |
| `500` | Internal server error |
| `503` | Service temporarily unavailable |

---

## Architecture note

Account balances are derived from ledger entries.

Transactions are processed through PostgreSQL transactions, with account locking and double-entry posting to protect ledger consistency under concurrent activity.

Deposits and withdrawals use system clearing accounts and are simulated. This project does not currently integrate with real payment networks or external banking providers.
