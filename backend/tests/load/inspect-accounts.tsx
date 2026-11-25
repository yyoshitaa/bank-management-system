import 'dotenv/config';

const BASE_URL = 'http://localhost:3000';

async function main() {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Please set TEST_EMAIL and TEST_PASSWORD environment variables.'
    );
  }

  // 1. Authenticate
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

  // 2. Retrieve wallets
  const accountsResponse = await fetch(`${BASE_URL}/api/accounts`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const accounts = await accountsResponse.json();

  if (!accountsResponse.ok) {
    throw new Error(`Accounts request failed: ${JSON.stringify(accounts)}`);
  }

  // 3. Display results
  console.log('\n=== YOUR ACCOUNTS ===\n');

  if (!accounts.length) {
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
