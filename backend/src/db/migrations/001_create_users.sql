BEGIN;

-- 1. Create the users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Preserve existing account owners.
-- Legacy users receive placeholder emails and no password.
INSERT INTO users (id, email, password_hash)
SELECT DISTINCT
    a.user_id,
    'legacy-' || a.user_id::text || '@legacy.invalid',
    NULL
FROM accounts a
WHERE a.user_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 3. Link accounts to actual user records
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'accounts_user_id_fkey'
          AND conrelid = 'accounts'::regclass
    ) THEN
        ALTER TABLE accounts
        ADD CONSTRAINT accounts_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES users(id);
    END IF;
END $$;

-- 4. Index account ownership lookups
CREATE INDEX IF NOT EXISTS idx_accounts_user_id
ON accounts(user_id);

COMMIT;
