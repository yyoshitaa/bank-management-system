
BEGIN;

-- 1. Allow system accounts to have no customer owner.
ALTER TABLE accounts
ALTER COLUMN user_id DROP NOT NULL;

-- 2. Convert existing system clearing accounts to ownerless accounts.
UPDATE accounts
SET user_id = NULL
WHERE account_type = 'SYSTEM';

-- 3. Enforce the ownership rules.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'accounts_ownership_check'
          AND conrelid = 'accounts'::regclass
    ) THEN
        ALTER TABLE accounts
        ADD CONSTRAINT accounts_ownership_check
        CHECK (
            (account_type = 'CUSTOMER' AND user_id IS NOT NULL)
            OR
            (account_type = 'SYSTEM' AND user_id IS NULL)
        );
    END IF;
END
$$;

COMMIT;
