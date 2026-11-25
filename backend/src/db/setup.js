const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupDatabase() {
  // 1. Connect to the default 'postgres' system database to create 'bank_ledger_db'
  const baseConnString = process.env.DATABASE_URL?.replace(/\/[^\/]+$/, '/postgres') || 'postgresql://localhost:5432/postgres';

  const adminClient = new Client({ connectionString: baseConnString });

  try {
    await adminClient.connect();
    console.log('🔌 Connected to PostgreSQL server...');

    const dbName = 'bank_ledger_db';
    const res = await adminClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);

    if (res.rows.length === 0) {
      await adminClient.query(`CREATE DATABASE ${dbName}`);
      console.log(`✨ Database '${dbName}' created successfully!`);
    } else {
      console.log(`ℹ️ Database '${dbName}' already exists.`);
    }
  } catch (error) {
    console.error('❌ Error creating database. Make sure PostgreSQL is running:', error.message);
    process.exit(1);
  } finally {
    await adminClient.end();
  }

  // 2. Connect directly to 'bank_ledger_db' and execute your schema.sql
  const targetConnString = process.env.DATABASE_URL || 'postgresql://localhost:5432/bank_ledger_db';
  const dbClient = new Client({ connectionString: targetConnString });

  try {
    await dbClient.connect();
    console.log('📂 Connected to bank_ledger_db. Executing schema migration...');

    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    await dbClient.query(schemaSql);
    console.log('🎉 Database schema applied successfully! All tables created.');
  } catch (error) {
    console.error('❌ Error executing schema migration:', error.message);
  } finally {
    await dbClient.end();
  }
}

setupDatabase();
