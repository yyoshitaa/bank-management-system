const { Client } = require('pg');
require('dotenv').config();

async function seedDatabase() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    console.log('🌱 Seeding test accounts and initial balances...');

    // 1. Create two test users/accounts (e.g., Alice and Bob)
    const aliceUserId = 'a0000000-0000-0000-0000-000000000001';
    const bobUserId = 'b0000000-0000-0000-0000-000000000002';
    const currency = 'SGD';

    // Insert accounts if they don't exist
    const accountQuery = `
      INSERT INTO accounts (user_id, currency)
      VALUES ($1, $2), ($3, $4)
      ON CONFLICT (user_id, currency) DO NOTHING
      RETURNING id, user_id;
    `;
    const accountsRes = await client.query(accountQuery, [aliceUserId, currency, bobUserId, currency]);

    // Fetch all accounts for reference
    const allAccounts = await client.query('SELECT id, user_id, currency FROM accounts');
    console.log('📋 Existing Accounts:', allAccounts.rows);

    if (allAccounts.rows.length >= 2) {
      const aliceAccount = allAccounts.rows[0];

      // Check if Alice already has a ledger entry/deposit
      const checkLedger = await client.query('SELECT COUNT(*) FROM ledger_entries WHERE account_id = $1', [aliceAccount.id]);

      if (parseInt(checkLedger.rows[0].count) === 0) {
        // Create an initial funding transaction for Alice ($1,000 SGD)
        const txRes = await client.query(`
          INSERT INTO transactions (idempotency_key, sender_account_id, receiver_account_id, amount, currency, status)
          VALUES ('initial-seed-deposit-alice', $1, $1, 1000.00, 'SGD', 'SETTLED')
          RETURNING id;
        `, [aliceAccount.id]);

        // Insert double-entry credit for Alice's starting balance
        await client.query(`
          INSERT INTO ledger_entries (transaction_id, account_id, amount)
          VALUES ($1, $2, 1000.00)
        `, [txRes.rows[0].id, aliceAccount.id]);

        console.log('💰 Seeded Alice with an initial balance of $1,000.00 SGD!');
      } else {
        console.log('ℹ️ Accounts already have ledger history.');
      }
    }

    console.log('🎉 Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
  } finally {
    await client.end();
  }
}

seedDatabase();
