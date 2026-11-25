import { Client } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupDatabase() {
  // 1. Connect to PostgreSQL's default database
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/bank_ledger_db';

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';

  const adminClient = new Client({
    connectionString: adminUrl.toString(),
  });

  try {
    await adminClient.connect();
    console.log('🔌 Connected to PostgreSQL server...');

    const dbName = 'bank_ledger_db';

    const result = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );

    if (result.rows.length === 0) {
      await adminClient.query(`CREATE DATABASE ${dbName}`);
      console.log(`✨ Database '${dbName}' created successfully!`);
    } else {
      console.log(`ℹ️ Database '${dbName}' already exists.`);
    }
  } finally {
    await adminClient.end();
  }

  // 2. Connect to the banking database
  const dbClient = new Client({
    connectionString: databaseUrl,
  });

  try {
    await dbClient.connect();
    console.log('📂 Connected to bank_ledger_db. Executing schema migration...');

    const schemaPath = path.join(__dirname, 'schema.sql');

    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    await dbClient.query(schemaSql);

    console.log('🎉 Database schema applied successfully!');

    // 3. Verify tables
    const migrationPath = path.join(__dirname, 'migrations', '001_create_users.sql');

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Users migration not found: ${migrationPath}`);
    }

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    await dbClient.query(migrationSql);
    console.log('🎉 Users migration applied successfully!');

    // 4. Apply system account classification migration
    const systemAccountsMigrationPath = path.join(
      __dirname,
      'migrations',
      '002_add_system_accounts.sql'
    );

    if (!fs.existsSync(systemAccountsMigrationPath)) {
      throw new Error(
        `System accounts migration not found: ${systemAccountsMigrationPath}`
      );
    }

    const systemAccountsMigrationSql = fs.readFileSync(
      systemAccountsMigrationPath,
      'utf8'
    );

    await dbClient.query(systemAccountsMigrationSql);
    console.log('🎉 System accounts migration applied successfully!');

    // 5. Apply transaction types migration
    const transactionTypesMigrationPath = path.join(
      __dirname,
      'migrations',
      '003_add_transaction_types.sql'
    );

    if (!fs.existsSync(transactionTypesMigrationPath)) {
      throw new Error(
        `Transaction types migration not found: ${transactionTypesMigrationPath}`
      );
    }

    const transactionTypesMigrationSql = fs.readFileSync(
      transactionTypesMigrationPath,
      'utf8'
    );

    await dbClient.query(transactionTypesMigrationSql);
    console.log('🎉 Transaction types migration applied successfully!');


    // 6. Apply system account ownership migration
    const ownershipMigrationPath = path.join(
      __dirname,
      'migrations',
      '004_support_system_account_ownership.sql'
    );

    if (!fs.existsSync(ownershipMigrationPath)) {
      throw new Error(
        `System account ownership migration not found: ${ownershipMigrationPath}`
      );
    }

    const ownershipMigrationSql = fs.readFileSync(
      ownershipMigrationPath,
      'utf8'
    );

    await dbClient.query(ownershipMigrationSql);
    console.log('🎉 System account ownership migration applied successfully!');


    const tables = await dbClient.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log(
      '📋 Created tables:',
      tables.rows.map((row) => row.table_name)
    );
  } finally {
    await dbClient.end();
  }
}

setupDatabase().catch((error) => {
  console.error('❌ Database setup failed:', error.message);
  process.exitCode = 1;
});
