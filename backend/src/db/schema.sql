-- 1. Create Transaction Status Enum Type
DO $$ BEGIN
    CREATE TYPE tx_status AS ENUM ('PENDING', 'PENDING_REVIEW', 'SETTLED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Accounts Table (Sub-wallets per user & currency)
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    currency VARCHAR(3) NOT NULL, -- SGD, USD, EUR, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_currency UNIQUE(user_id, currency)
);

-- 3. Transactions Log Table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    transaction_type VARCHAR(30) NOT NULL DEFAULT 'P2P_TRANSFER',
    sender_account_id UUID NOT NULL REFERENCES accounts(id),
    receiver_account_id UUID NOT NULL REFERENCES accounts(id),
    amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL,
    fx_rate NUMERIC(10, 6) DEFAULT 1.0,
    status tx_status DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT transactions_transaction_type_check
        CHECK (
            transaction_type IN (
                'P2P_TRANSFER',
                'DEPOSIT',
                'WITHDRAWAL',
                'LEGACY_UNCLASSIFIED'
            )
        )
);

-- 4. Immutable Ledger Entries (Double-Entry Audit Log)
-- Every transfer generates two rows: a negative debit entry and a positive credit entry.
-- This guarantees SUM(debits) - SUM(credits) == 0 system-wide.
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    account_id UUID NOT NULL REFERENCES accounts(id),
    amount NUMERIC(18, 4) NOT NULL, -- Negative for Debit, Positive for Credit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for high-performance balance calculation and concurrency locking lookups
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_id ON ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key);