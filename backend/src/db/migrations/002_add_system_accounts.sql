BEGIN;

-- 1. Classify existing and future accounts.
-- Existing accounts automatically receive the CUSTOMER type.
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS account_type VARCHAR(20)
NOT NULL DEFAULT 'CUSTOMER';

-- 2. Record the purpose of system-owned accounts.
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS system_purpose VARCHAR(50);

-- 3. Restrict account types and their permitted purposes.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'accounts_account_type_check'
          AND conrelid = 'accounts'::regclass
    ) THEN
        ALTER TABLE accounts
        ADD CONSTRAINT accounts_account_type_check
        CHECK (account_type IN ('CUSTOMER', 'SYSTEM'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'accounts_system_purpose_check'
          AND conrelid = 'accounts'::regclass
    ) THEN
        ALTER TABLE accounts
        ADD CONSTRAINT accounts_system_purpose_check
        CHECK (
            (account_type = 'CUSTOMER' AND system_purpose IS NULL)
            OR
            (
                account_type = 'SYSTEM'
                AND system_purpose IS NOT NULL
                AND length(trim(system_purpose)) > 0
            )
        );
    END IF;
END
$$;

-- 4. Prevent duplicate system accounts for the same purpose and currency.
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_unique_system_purpose_currency
ON accounts (system_purpose, currency)
WHERE account_type = 'SYSTEM';

-- 5. Improve filtering by account type.
CREATE INDEX IF NOT EXISTS idx_accounts_account_type
ON accounts (account_type);

COMMIT;
