/**
 * D-Fence — 10.1.5, measured: fifty concurrent authenticated users against a running server.
 *
 *     npm run serve                                   # in one terminal
 *     npx tsx src/tools/load-check.ts --base http://localhost:3000
 *
 * **Why this is a tool and not a test.** 10.1.5 is a claim about the *system* — the HTTP stack, the
 * session lookup on every request, the connection pooler and PostGIS behind it. Measuring it inside
 * vitest against in-memory stores would measure this laptop's event loop and report a number that
 * cannot fail, which is the exact dishonesty US-0.5 was written to prevent. So it runs against
 * whatever is actually deployed, and prints what it found.
 *
 * **What it measures.** 10.1.5 says fifty concurrent authenticated users must hold **10.1.2's**
 * latency: 95% of read requests within one second. So the number that matters is the p95, and it is
 * reported alongside the median and the worst case — a p95 inside budget with a ten-second tail is
 * a different system from one with a tight distribution, and only one of them survives a demo.
 *
 * Fifty *sessions*, not fifty sockets: each virtual user signs in for real and carries its own
 * bearer token, because session resolution happens on every authenticated request (2.1.9 extends it
 * on use) and a load test sharing one token would skip the part most likely to be the bottleneck.
 */
import { ConfigLoader } from '../config/ConfigLoader';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1) {
    return process.argv[index + 1];
  }
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  return inline === undefined ? undefined : inline.slice(name.length + 3);
}

const base = argument('base') ?? 'http://localhost:3000';
/** 10.1.5's number. Overridable so the shape of the curve can be seen, not so the claim can be eased. */
const users = Number(argument('users') ?? 50);
/** Read requests per user. Enough for a p95 to mean something at this sample size. */
const each = Number(argument('requests') ?? 10);

/** 10.1.2's budget, in milliseconds. */
const BUDGET_MS = 1_000;

/**
 * The reads a signed-in manager actually performs, in the proportion they perform them. A load test
 * that hammered one cheap endpoint fifty times would report the cost of that endpoint, not of the
 * system; the dashboard and the priority table are the two that touch the most rows.
 */
const READ_PATHS = [
  '/api/ops/dashboard',
  '/api/ops/priority',
  '/api/ops/dashboard',
  '/api/ops/sources',
  '/api/ops/priority',
  '/api/map/layers',
  '/api/ops/work-orders',
  '/api/ops/dashboard',
  '/api/ops/moderation',
  '/api/ops/priority',
];

interface Sample {
  path: string;
  ms: number;
  status: number;
}

async function signIn(email: string, password: string): Promise<string | null> {
  const response = await fetch(`${base}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { token?: string };
  return body.token ?? null;
}

async function virtualUser(token: string): Promise<Sample[]> {
  const samples: Sample[] = [];
  for (let i = 0; i < each; i += 1) {
    const path = READ_PATHS[i % READ_PATHS.length] as string;
    const started = performance.now();
    const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    // The body is drained, not discarded: a timing that stops at the response headers omits the
    // serialisation and transfer of a 300-row priority table, which is most of the work.
    await response.text();
    samples.push({ path, ms: performance.now() - started, status: response.status });
  }
  return samples;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return NaN;
  }
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] as number;
}

async function main(): Promise<void> {
  const config = ConfigLoader.load();
  // `??` is wrong here and was wrong on the first run: `ConfigSet.get` returns `''` for an absent
  // key, not `undefined`, so the fallback never fired and the tool tried to sign in as nobody.
  const first = (...values: Array<string | undefined>): string => values.find((v) => v !== undefined && v !== '') ?? '';
  const email = first(process.env.DFENCE_SEED_MANAGER_EMAIL, config.get('DFENCE_SEED_MANAGER_EMAIL'), 'manager@d-fence.local');
  const password = first(process.env.DFENCE_SEED_MANAGER_PASSWORD, config.get('DFENCE_SEED_MANAGER_PASSWORD'), 'dfence2026');

  console.log(`D-Fence load check against ${base}`);
  console.log(`  ${users} concurrent authenticated users x ${each} reads each (10.1.5, holding 10.1.2)\n`);

  // Sign in serially. Sign-in is deliberately expensive — scrypt, by 10.3.1 — and fifty concurrent
  // scrypt hashes would measure the KDF rather than the read path 10.1.2 is about.
  const tokens: string[] = [];
  for (let i = 0; i < users; i += 1) {
    const token = await signIn(email, password);
    if (token === null) {
      console.log(`  could not sign in as ${email} — is the server running, and is this the seed manager?`);
      process.exitCode = 1;
      return;
    }
    tokens.push(token);
  }
  console.log(`  ${tokens.length} sessions established.`);

  const started = performance.now();
  const results = await Promise.all(tokens.map((token) => virtualUser(token)));
  const wallClock = performance.now() - started;
  const samples = results.flat();

  const failures = samples.filter((s) => s.status !== 200);
  const times = samples.map((s) => s.ms).sort((a, b) => a - b);
  const p50 = percentile(times, 50);
  const p95 = percentile(times, 95);
  const worst = times[times.length - 1] ?? NaN;

  console.log(`\n  requests        ${samples.length} in ${(wallClock / 1000).toFixed(1)} s ` +
    `(${(samples.length / (wallClock / 1000)).toFixed(0)}/s)`);
  console.log(`  median          ${p50.toFixed(0)} ms`);
  console.log(`  p95             ${p95.toFixed(0)} ms   (10.1.2's budget: ${BUDGET_MS} ms)`);
  console.log(`  worst           ${worst.toFixed(0)} ms`);
  console.log(`  non-200         ${failures.length}`);

  // Per path, because an aggregate p95 hides which endpoint is the one that will fail first.
  console.log('\n  by path:');
  for (const path of [...new Set(READ_PATHS)]) {
    const forPath = samples.filter((s) => s.path === path).map((s) => s.ms).sort((a, b) => a - b);
    console.log(`    ${path.padEnd(26)} n=${String(forPath.length).padStart(3)}  ` +
      `p50 ${percentile(forPath, 50).toFixed(0).padStart(5)} ms   p95 ${percentile(forPath, 95).toFixed(0).padStart(5)} ms`);
  }

  const held = p95 < BUDGET_MS && failures.length === 0;
  console.log(
    `\n  10.1.5: ${held ? 'HELD' : 'NOT HELD'} — p95 ${p95.toFixed(0)} ms with ${users} concurrent ` +
      `authenticated users${failures.length === 0 ? '' : `, and ${failures.length} request(s) did not return 200`}.`,
  );
  if (!held) {
    // Not thrown: the number is the deliverable, and a stack trace on top of it helps nobody.
    process.exitCode = 1;
  }
  console.log(
    '  Measured from one client process on the same machine as the caller, so the network is not ' +
      'the internet. A deployed instance measured from elsewhere is the number that would go in a report.',
  );
}

void main();
