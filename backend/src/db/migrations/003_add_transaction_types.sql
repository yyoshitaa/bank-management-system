BEGIN;

-- Add transaction classification.
-- Existing transactions retain an explicitly unclassified status.
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(30)
NOT NULL DEFAULT 'LEGACY_UNCLASSIFIED';

-- Restrict transaction types to approved values.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'transactions_transaction_type_check'
          AND conrelid = 'transactions'::regclass
    ) THEN
        ALTER TABLE transactions
        ADD CONSTRAINT transactions_transaction_type_check
        CHECK (
            transaction_type IN (
                'P2P_TRANSFER',
                'DEPOSIT',
                'WITHDRAWAL',
                'LEGACY_UNCLASSIFIED'
            )
        );
    END IF;
END
$$;

-- New transactions default to ordinary peer-to-peer transfers.
ALTER TABLE transactions
ALTER COLUMN transaction_type SET DEFAULT 'P2P_TRANSFER';

COMMIT;
