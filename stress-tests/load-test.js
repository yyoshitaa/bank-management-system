import { randomUUID } from 'node:crypto';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

const SENDER_EMAIL = process.env.LOAD_TEST_EMAIL;
const SENDER_PASSWORD = process.env.LOAD_TEST_PASSWORD;
const RECEIVER_EMAIL = process.env.LOAD_TEST_RECEIVER_EMAIL;
const RECEIVER_PASSWORD = process.env.LOAD_TEST_RECEIVER_PASSWORD;

const SENDER_ID = process.env.LOAD_TEST_SENDER_ID;
const RECEIVER_ID = process.env.LOAD_TEST_RECEIVER_ID;

const AMOUNT = Number(process.env.LOAD_TEST_AMOUNT || '0.01');
const REQUESTS = Number(process.env.LOAD_TEST_REQUESTS || '20');
const CONCURRENCY = Number(process.env.LOAD_TEST_CONCURRENCY || '5');

function validateConfiguration() {
  if (process.env.CONFIRM_LOAD_TEST !== 'true') {
    throw new Error('Set CONFIRM_LOAD_TEST=true to authorize test transfers.');
  }

  if (
    !SENDER_EMAIL || !SENDER_PASSWORD ||
    !RECEIVER_EMAIL || !RECEIVER_PASSWORD ||
    !SENDER_ID || !RECEIVER_ID
  ) {
    throw new Error('Missing sender/receiver credentials or account IDs.');
  }

  if (SENDER_ID === RECEIVER_ID) {
    throw new Error('Sender and receiver must be different accounts.');
  }

  if (!Number.isFinite(AMOUNT) || AMOUNT <= 0) {
    throw new Error('LOAD_TEST_AMOUNT must be positive.');
  }

  if (!Number.isInteger(REQUESTS) || REQUESTS < 1 || REQUESTS > 20) {
    throw new Error('LOAD_TEST_REQUESTS must be between 1 and 20.');
  }

  if (
    !Number.isInteger(CONCURRENCY) ||
    CONCURRENCY < 1 ||
    CONCURRENCY > REQUESTS
  ) {
    throw new Error('Invalid LOAD_TEST_CONCURRENCY.');
  }
}

async function parseResponse(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || 'Invalid response body' };
  }
}

async function login(email, password, label) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(15000),
  });

  const data = await parseResponse(response);

  if (!response.ok || !data.token) {
    throw new Error(`${label} login failed (${response.status}).`);
  }

  return data.token;
}

async function getAccounts(token, label) {
  const response = await fetch(`${API_URL}/accounts`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });

  const accounts = await parseResponse(response);

  if (!response.ok || !Array.isArray(accounts)) {
    throw new Error(`Could not retrieve ${label} accounts.`);
  }

  return accounts;
}

function getBalance(accounts, accountId, label) {
  const account = accounts.find((item) => item.id === accountId);

  if (!account) {
    throw new Error(`${label} wallet was not found under its authenticated user.`);
  }

  const balance = Number(account.balance);

  if (!Number.isFinite(balance)) {
    throw new Error(`${label} wallet has an invalid balance.`);
  }

  return { ...account, numericBalance: balance };
}

async function main() {
  validateConfiguration();

  console.log('\nApex Ledger — Controlled Transfer Load Test');
  console.log(`API: ${API_URL}`);
  console.log(`Requests: ${REQUESTS}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Amount per transfer: ${AMOUNT}`);
  console.log('\nAuthenticating dedicated test users...');

  const senderToken = await login(
    SENDER_EMAIL,
    SENDER_PASSWORD,
    'Sender'
  );

  const receiverToken = await login(
    RECEIVER_EMAIL,
    RECEIVER_PASSWORD,
    'Receiver'
  );

  const senderAccounts = await getAccounts(senderToken, 'sender');
  const receiverAccounts = await getAccounts(receiverToken, 'receiver');

  const sender = getBalance(senderAccounts, SENDER_ID, 'Sender');
  const receiver = getBalance(receiverAccounts, RECEIVER_ID, 'Receiver');

  if (sender.user_id === receiver.user_id) {
    throw new Error('Sender and receiver must be separate users.');
  }

  if (
    sender.currency !== receiver.currency ||
    sender.currency !== 'SGD'
  ) {
    throw new Error('Both test wallets must use the same SGD currency.');
  }

  const startingSenderBalance = sender.numericBalance;
  const startingReceiverBalance = receiver.numericBalance;
  const requiredBalance = AMOUNT * REQUESTS;

  if (startingSenderBalance + 1e-9 < requiredBalance) {
    throw new Error(
      `Insufficient test funds. Required: ${requiredBalance}; available: ${startingSenderBalance}.`
    );
  }

  console.log('\nTest configuration verified.');
  console.log(`Sender starting balance: SGD ${startingSenderBalance.toFixed(4)}`);
  console.log(`Receiver starting balance: SGD ${startingReceiverBalance.toFixed(4)}`);
  console.log(`Maximum transfer exposure: SGD ${requiredBalance.toFixed(4)}`);
  console.log('\nStarting concurrent transfers...\n');

  const results = [];
  let nextRequest = 0;

  async function worker() {
    while (nextRequest < REQUESTS) {
      const requestNumber = nextRequest++;
      const startedAt = performance.now();

      try {
        const response = await fetch(`${API_URL}/transfers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${senderToken}`,
            'X-Idempotency-Key': `load-test-${randomUUID()}`,
          },
          body: JSON.stringify({
            senderAccountId: SENDER_ID,
            receiverAccountId: RECEIVER_ID,
            amount: AMOUNT,
            currency: sender.currency,
          }),
          signal: AbortSignal.timeout(20000),
        });

        const body = await parseResponse(response);

        results.push({
          requestNumber,
          status: response.status,
          duration: performance.now() - startedAt,
          success: response.status === 201,
          error: body.error || null,
        });
      } catch (error) {
        results.push({
          requestNumber,
          status: 0,
          duration: performance.now() - startedAt,
          success: false,
          error: error.message,
        });
      }
    }
  }

  const testStartedAt = performance.now();

  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker())
  );

  const totalDuration = performance.now() - testStartedAt;

  const successful = results.filter((result) => result.success);
  const failed = results.filter((result) => !result.success);

  const durations = results
    .map((result) => result.duration)
    .sort((a, b) => a - b);

  const averageDuration =
    durations.reduce((sum, value) => sum + value, 0) / durations.length;

  const percentile = (p) =>
    durations[Math.min(
      Math.ceil((p / 100) * durations.length) - 1,
      durations.length - 1
    )];

  console.log('\n========== LOAD TEST RESULTS ==========');
  console.log(`Total requests: ${results.length}`);
  console.log(`Successful transfers: ${successful.length}`);
  console.log(`Failed transfers: ${failed.length}`);
  console.log(`Total duration: ${(totalDuration / 1000).toFixed(2)} seconds`);
  console.log(`Requests per second: ${(results.length / (totalDuration / 1000)).toFixed(2)}`);
  console.log(`Average response: ${averageDuration.toFixed(2)} ms`);
  console.log(`P95 response: ${percentile(95).toFixed(2)} ms`);

  if (failed.length > 0) {
    console.log('\nFailure details:');

    for (const failure of failed) {
      console.log(
        `Request ${failure.requestNumber + 1} — HTTP ${failure.status}: ${failure.error || 'Request failed'}`
      );
    }
  }

  console.log('\nChecking final wallet balances...');

  const [finalSenderAccounts, finalReceiverAccounts] = await Promise.all([
    getAccounts(senderToken, 'sender'),
    getAccounts(receiverToken, 'receiver'),
  ]);

  const finalSender = getBalance(finalSenderAccounts, SENDER_ID, 'Sender');
  const finalReceiver = getBalance(finalReceiverAccounts, RECEIVER_ID, 'Receiver');

  const expectedSenderBalance =
    startingSenderBalance - successful.length * AMOUNT;

  const expectedReceiverBalance =
    startingReceiverBalance + successful.length * AMOUNT;

  const senderDifference = Math.abs(
    finalSender.numericBalance - expectedSenderBalance
  );

  const receiverDifference = Math.abs(
    finalReceiver.numericBalance - expectedReceiverBalance
  );

  const reconciliationPassed =
    senderDifference < 0.000001 &&
    receiverDifference < 0.000001;

  console.log('\n========== LEDGER RECONCILIATION ==========');
  console.log(`Sender final balance: SGD ${finalSender.numericBalance.toFixed(4)}`);
  console.log(`Sender expected balance: SGD ${expectedSenderBalance.toFixed(4)}`);
  console.log(`Receiver final balance: SGD ${finalReceiver.numericBalance.toFixed(4)}`);
  console.log(`Receiver expected balance: SGD ${expectedReceiverBalance.toFixed(4)}`);
  console.log(`Reconciliation: ${reconciliationPassed ? 'PASSED' : 'FAILED'}`);

  console.log('\nTest complete.');

  if (!reconciliationPassed) {
    throw new Error('Final balances do not match the successful transfer count.');
  }
}

main().catch((error) => {
  console.error('\nLoad test stopped:', error.message);
  process.exitCode = 1;
});
