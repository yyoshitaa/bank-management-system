import 'dotenv/config';

const BASE_URL = 'http://localhost:3000';

async function main() {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error('Please set TEST_EMAIL and TEST_PASSWORD.');
  }

  const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const loginData = await loginResponse.json();

  if (!loginResponse.ok) {
    throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  }

  const token = loginData.token;

  const accountsResponse = await fetch(`${BASE_URL}/api/accounts`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const accounts = await accountsResponse.json();

  if (!accountsResponse.ok) {
    throw new Error(`Accounts request failed: ${JSON.stringify(accounts)}`);
  }

  console.log('\n=== YOUR ACCOUNTS ===\n');

  if (!Array.isArray(accounts) || accounts.length === 0) {
    console.log('No accounts found.');
    return;
  }

  accounts.forEach((account: any, index: number) => {
    console.log(`Account ${index + 1}`);
    console.log(`  ID:       ${account.id}`);
    console.log(`  Currency: ${account.currency}`);
    console.log(`  Balance:  ${account.balance}`);
    console.log('');
  });
}

main().catch((error) => {
  console.error('\nAccount inspection failed:', error.message);
  process.exit(1);
});
