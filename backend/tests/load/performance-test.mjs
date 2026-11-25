import { performance } from 'node:perf_hooks';

const API = 'http://localhost:3001';
const EMAIL = 'concurrency.sender@test.local';
const PASSWORD = 'TestSender2026!';

const REQUESTS = 40;
const CONCURRENCY = 20;

const TARGET = process.argv[2] ?? 'both';

const ENDPOINTS = {
  accounts: ['/api/accounts'],
  transactions: ['/api/transactions?page=1&limit=10'],
  both: [
    '/api/accounts',
    '/api/transactions?page=1&limit=10',
  ],
};

if (!ENDPOINTS[TARGET]) {
  throw new Error('Usage: node tests/load/performance-test.mjs [accounts|transactions|both]');
}

async function authenticate() {
  const response = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data.token) {
    throw new Error('Login response did not contain a token.');
  }

  return data.token;
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(percentileValue * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function benchmark(endpoint, token) {
  const results = [];
  let nextRequest = 0;

  const start = performance.now();

  async function worker() {
    while (true) {
      const requestNumber = nextRequest++;

      if (requestNumber >= REQUESTS) return;

      const requestStart = performance.now();

      try {
        const response = await fetch(`${API}${endpoint}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        await response.arrayBuffer();

        results.push({
          status: response.status,
          latency: performance.now() - requestStart,
        });
      } catch (error) {
        results.push({
          status: 0,
          latency: performance.now() - requestStart,
          error: String(error),
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker())
  );

  const duration = (performance.now() - start) / 1000;
  const successful = results.filter(r => r.status === 200);
  const failed = results.filter(r => r.status !== 200);
  const latencies = results.map(r => r.latency);

  console.log('\n======================================');
  console.log(` ENDPOINT: ${endpoint}`);
  console.log('======================================');
  console.log(`Total requests:       ${results.length}`);
  console.log(`Successful (HTTP 200): ${successful.length}`);
  console.log(`Failed requests:      ${failed.length}`);
  console.log(`Concurrency:          ${CONCURRENCY}`);
  console.log(`Duration:             ${duration.toFixed(2)} seconds`);
  console.log(`Requests/second:      ${(results.length / duration).toFixed(2)}`);
  console.log(`Average latency:      ${(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)} ms`);
  console.log(`Median latency (p50): ${percentile(latencies, 0.50).toFixed(2)} ms`);
  console.log(`95th percentile (p95): ${percentile(latencies, 0.95).toFixed(2)} ms`);
  console.log(`Maximum latency:      ${Math.max(...latencies).toFixed(2)} ms`);

  if (failed.length > 0) {
    console.log('\nFailed response details:');
    for (const result of failed.slice(0, 10)) {
      console.log(`HTTP ${result.status}: ${result.error ?? 'Unexpected status'}`);
    }
  }

  return failed.length;
}

async function main() {
  console.log('======================================');
  console.log(' BANK API PERFORMANCE TEST');
  console.log('======================================');
  console.log(`Target: ${API}`);
  console.log(`Requests per endpoint: ${REQUESTS}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log('Read-only endpoints; no transfers will be created.');

  const health = await fetch(`${API}/health`);

  if (!health.ok) {
    throw new Error(`Test backend health check failed: HTTP ${health.status}`);
  }

  const token = await authenticate();

  console.log('\nAuthentication successful.');
  console.log('Starting benchmark...');

  let totalFailures = 0;

for (const endpoint of ENDPOINTS[TARGET]) {
  totalFailures += await benchmark(endpoint, token);
}

  console.log('\n======================================');
  console.log(' FINAL RESULT');
  console.log('======================================');
  console.log(`Total requests: ${REQUESTS * ENDPOINTS[TARGET].length}`);
  console.log(`Total failed requests: ${totalFailures}`);

  if (totalFailures > 0) {
    console.error('PERFORMANCE TEST FAILED: Some requests were unsuccessful.');
    process.exitCode = 1;
  } else {
    console.log('PERFORMANCE TEST PASSED: All requests returned HTTP 200.');
  }
}

main().catch(error => {
  console.error('\nPERFORMANCE TEST ERROR:', error.message);
  process.exitCode = 1;
});
