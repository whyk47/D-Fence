/**
 * D-Fence — verify the Supabase configuration without printing any of it.
 *
 *     npx tsx src/tools/supabase-check.ts
 *
 * Four values have to be right before any of the Postgres work can start, and three of the four
 * fail in ways that look identical from the application: a wrong password, an IPv6-only host on an
 * IPv4 network, and a missing PostGIS extension all surface as "the repository threw". This checks
 * each one separately and says which.
 *
 * **It prints no secret.** Keys are reported as present or absent and by length, never by value;
 * the connection string is reported by host and database name with the password removed. A tool
 * that echoes credentials into a terminal is a tool that puts them in a scrollback buffer, and
 * 10.3.4 keeps them out of the repository for the same reason.
 */
import { Client } from 'pg';
import { ConfigLoader } from '../config/ConfigLoader';

const TICK = '✓';
const CROSS = '✗';

function report(ok: boolean, label: string, detail: string): boolean {
  console.log(`  ${ok ? TICK : CROSS} ${label.padEnd(22)} ${detail}`);
  return ok;
}

/** Host and database only. The password is never read out of the string. */
function describe(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const pooler = url.port === '6543' ? 'transaction pooler' : url.hostname.includes('pooler') ? 'session pooler' : 'direct';
    return `${url.hostname}:${url.port}${url.pathname} (${pooler})`;
  } catch {
    return 'unparseable — it should start with postgresql://';
  }
}

async function checkRestApi(url: string, anonKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: anonKey } });
    // 200 is an empty schema; 401/404 still prove the host resolved and answered as Supabase.
    return report(res.status < 500, 'REST API', `HTTP ${res.status} from ${new URL(url).hostname}`);
  } catch (error) {
    return report(false, 'REST API', `unreachable — ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * A password with a reserved character in it produces a string that is structurally plausible and
 * unparseable, and `new Client()` throws before any of the useful checks run. `#` is the common
 * one — Supabase generates passwords containing it, and in a URL it starts the fragment, so
 * everything after it is silently discarded.
 *
 * @returns null when the string is usable, otherwise the sentence to show instead of a stack trace
 */
function unusableBecause(connectionString: string): string | null {
  if (!/^postgres(ql)?:\/\//.test(connectionString)) {
    return 'it does not start with postgresql://';
  }
  try {
    new URL(connectionString);
    return null;
  } catch {
    const at = connectionString.lastIndexOf('@');
    const password = at === -1 ? '' : connectionString.slice(connectionString.indexOf(':', 13) + 1, at);
    // Named rather than shown. The character is the diagnosis; the password is not ours to print.
    const offenders = ['#', '%', '?', '/', '[', ']', '@', ' '].filter((c) => password.includes(c));
    return offenders.length === 0
      ? 'it is not a valid URL'
      : `the password contains ${offenders.map((c) => `'${c}'`).join(' and ')}, which must be percent-encoded ` +
        `(${offenders.map((c) => `'${c}' becomes '%${c.charCodeAt(0).toString(16).toUpperCase()}'`).join(', ')})`;
  }
}

async function checkDatabase(connectionString: string): Promise<void> {
  const unusable = unusableBecause(connectionString);
  if (unusable !== null) {
    report(false, 'DATABASE_URL', unusable);
    console.log('    → change it in src/.env only; the password itself is fine everywhere else.');
    return;
  }
  console.log(`  · connecting to           ${describe(connectionString)}`);
  // Certificate verification is left ON. If it fails, that is worth seeing rather than silently
  // disabling — a check tool that turns off TLS verification teaches the habit of turning it off.
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: true } });
  try {
    await client.connect();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report(false, 'database', message);
    if (/ENETUNREACH|EHOSTUNREACH|ENOTFOUND/.test(message)) {
      console.log('    → looks like the IPv6-only DIRECT connection. Use the Session pooler string instead.');
    } else if (/password|authentication/i.test(message)) {
      console.log('    → the password in the string is wrong, or [YOUR-PASSWORD] was never replaced.');
    } else if (/certificate|self.signed/i.test(message)) {
      console.log('    → TLS verification failed. Do not disable it; check the host is the pooler.');
    }
    return;
  }

  try {
    const version = await client.query<{ v: string }>('select version() as v');
    report(true, 'database', (version.rows[0]?.v ?? '').split(',')[0] ?? 'connected');

    const postgis = await client.query<{ v: string }>(
      "select extversion as v from pg_extension where extname = 'postgis'",
    );
    const installed = postgis.rows[0]?.v;
    report(
      installed !== undefined,
      'PostGIS',
      installed === undefined
        ? "not installed — run: create extension if not exists postgis with schema extensions;"
        : `${installed} — 3.1.8 and 5.1.7 can be answered by the database`,
    );

    // The migration is still a stub, so an empty public schema is the expected state today.
    const tables = await client.query<{ n: string }>(
      "select count(*)::text as n from information_schema.tables where table_schema = 'public'",
    );
    console.log(`  · public tables           ${tables.rows[0]?.n ?? '0'} (the schema migration is still a stub)`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const config = ConfigLoader.load();
  const url = config.get('SUPABASE_URL');
  const anon = config.get('SUPABASE_ANON_KEY');
  const service = config.get('SUPABASE_SERVICE_KEY');
  const database = config.get('DATABASE_URL');

  console.log('D-Fence — Supabase configuration check (no secret is printed)\n');

  const present =
    report(url !== '', 'SUPABASE_URL', url === '' ? 'not set' : `${url} ${/^https:\/\/.*\.supabase\.co\/?$/.test(url) ? '' : '(expected https://<ref>.supabase.co)'}`) &&
    report(anon !== '', 'SUPABASE_ANON_KEY', anon === '' ? 'not set' : `set, ${anon.length} chars`) &&
    report(service !== '', 'SUPABASE_SERVICE_KEY', service === '' ? 'not set' : `set, ${service.length} chars`) &&
    report(database !== '', 'DATABASE_URL', database === '' ? 'not set' : 'set');

  if (anon !== '' && anon === service) {
    report(false, 'key pair', 'the anon and service keys are identical — one of them was pasted twice');
  }

  if (!present) {
    console.log('\nFill in the missing values in src/.env, then run this again.');
    return;
  }

  console.log('');
  await checkRestApi(url.replace(/\/$/, ''), anon);
  await checkDatabase(database);

  console.log('\nWhen every line above is a tick, the Postgres schema and repositories can be built.');
}

void main();
