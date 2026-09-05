/**
 * D-Fence — user acceptance test, driven over HTTP against a running server.
 *
 *     npm run serve                 # in one terminal
 *     npx tsx src/tools/uat.ts      # in another
 *     npx tsx src/tools/uat.ts --base http://localhost:3111 --log server.log
 *
 * **On `--log`.** 2.1.4 will not let a new account sign in until its email address is verified, and
 * the verification token stands in for an email: the development account store prints it to the
 * server's console rather than returning it from `/api/auth/register`. That is the right shape —
 * returning the token in the response would make the verification step decorative — so this tool
 * reads it out of the server's log, which is the same thing a human tester does with an inbox.
 * Without `--log`, segment B is reported as SKIPPED with the reason, rather than as broken.
 *
 * **What makes this different from the unit suite.** The 530 tests in `tests/` exercise classes in
 * isolation with stores in memory; every one of them can pass while the system as assembled does
 * nothing, because nothing there proves the parts were wired together. This drives the real server
 * over real HTTP, as three real accounts, through the three journeys `lab4/DEMO-SCRIPT.md` says the
 * demonstration consists of — and it fails loudly if a beat cannot be performed.
 *
 * It is written to be run **before a rehearsal**, so that "beat B4 does not work" is discovered in
 * a terminal rather than in front of the class.
 *
 * Every step names the requirement it demonstrates and the demo beat it belongs to. A step that
 * cannot run because an earlier one failed is reported as SKIPPED rather than as a failure: one
 * broken sign-in should not present as fourteen broken features.
 */
import { readFileSync } from 'node:fs';
import { Role } from '../entity/enums';
import { ConfigLoader } from '../config/ConfigLoader';

/**
 * The seed manager's credentials, in the order the server itself resolves them.
 *
 * `process.env` alone was not enough. The server reads `src/.env` through ConfigLoader; these
 * harnesses read only the environment, so once a real seed password was configured they carried on
 * offering the published development default and the manager sign-in failed — taking most of the
 * run down with it as skips. `npm run uat:client` failed out of the box while the application was
 * entirely healthy, which is the worst kind of test failure: one that indicts the wrong thing.
 */
function seedManager(): { email: string; password: string } {
  const config = ConfigLoader.load();
  // `??` is wrong against ConfigSet.get, which returns '' for an absent key rather than undefined.
  const first = (...values: Array<string | undefined>): string =>
    values.find((v) => v !== undefined && v !== '') ?? '';
  return {
    email: first(process.env.DFENCE_SEED_MANAGER_EMAIL, config.get('DFENCE_SEED_MANAGER_EMAIL'), 'manager@d-fence.local'),
    password: first(process.env.DFENCE_SEED_MANAGER_PASSWORD, config.get('DFENCE_SEED_MANAGER_PASSWORD'), 'dfence2026'),
  };
}


interface Outcome {
  beat: string;
  requirement: string;
  what: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
}

const outcomes: Outcome[] = [];
const base = argument('base') ?? 'http://localhost:3000';

/**
 * `--name value` or `--name=value`. Both, because accepting only the first form made this tool
 * silently ignore `--base=http://localhost:3140` and run the whole acceptance suite against
 * whatever happened to be listening on the default port — a set of plausible passes against the
 * wrong process, which is worse than a failure.
 */
function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1) {
    return process.argv[index + 1];
  }
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  return inline === undefined ? undefined : inline.slice(name.length + 3);
}

/** A session: a bearer token and the role it was issued for. */
interface Session {
  token: string | null;
  role: Role | null;
  accountId: string | null;
}

async function call(
  session: Session,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session.token === null ? {} : { Authorization: `Bearer ${session.token}` }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body: parsed };
}

/**
 * The same call, returning the body as text.
 *
 * 7.4.3's export is `text/csv`, and `response.json()` on it throws — an earlier shape of this tool
 * would have reported the export as an empty object rather than as a CSV, which is a passing check
 * for a broken download.
 */
async function callText(
  session: Session,
  path: string,
): Promise<{ status: number; text: string }> {
  const response = await fetch(`${base}${path}`, {
    headers: session.token === null ? {} : { Authorization: `Bearer ${session.token}` },
  });
  return { status: response.status, text: await response.text() };
}

/**
 * Run one step.
 *
 * `check` returns null on success or a sentence on failure, rather than throwing — a failed
 * acceptance step is an expected outcome of this tool, not an exception.
 */
async function step(
  beat: string,
  requirement: string,
  what: string,
  check: () => Promise<string | null>,
): Promise<boolean> {
  try {
    const failure = await check();
    outcomes.push({
      beat,
      requirement,
      what,
      status: failure === null ? 'PASS' : 'FAIL',
      detail: failure ?? '',
    });
    return failure === null;
  } catch (error) {
    outcomes.push({
      beat,
      requirement,
      what,
      status: 'FAIL',
      detail: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function skip(beat: string, requirement: string, what: string, why: string): void {
  outcomes.push({ beat, requirement, what, status: 'SKIP', detail: why });
}

/** A fresh address every run: 2.1.1 refuses a duplicate, and a UAT must be re-runnable. */
function uniqueEmail(prefix: string): string {
  return `${prefix}+${Date.now().toString(36)}@uat.d-fence.local`;
}

const PASSWORD = 'UatPass2026';

/**
 * A one-pixel PNG, so the harness can upload a photograph that is genuinely a photograph.
 *
 * Small enough to inline and real enough to be decoded: the point of these beats is that bytes
 * arrive in a bucket, and a placeholder string is exactly the failure they exist to catch.
 */
const PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * A fresh point for every run, far enough from every previous run's point to clear 5.1.11.
 *
 * Before the stores moved onto Postgres this was unnecessary: every run met an empty server. Now
 * yesterday's report is still there, and 5.1.11 refuses a second report of the same type within
 * fifty metres for twenty-four hours — correctly. A harness that can only pass once is a harness
 * nobody runs twice, so the site being reported moves with the run rather than the rule being
 * weakened to accommodate the test.
 *
 * This used to add ONE offset to BOTH axes, which put every run in history on a single diagonal
 * line, spaced by the millisecond digits of the clock — about 1.1 metres apart against a 50 metre
 * radius. Each surviving report therefore sterilised roughly ninety of the thousand available
 * slots, and after a dozen runs a collision was likelier than not: the run would be refused as a
 * duplicate of its own predecessor and report a defect in 5.1.11 that was not there. The two axes
 * now move independently, which spreads the same thousand steps over an area instead of a line.
 */
const RUN_CLOCK = Date.now();
const runOffset = (steps: number): number => (steps % 1_000) / 100_000 - 0.005;
const SITE = {
  latitude: 1.3966 + runOffset(RUN_CLOCK),
  longitude: 103.8721 + runOffset(Math.floor(RUN_CLOCK / 1_000)),
};
const logPath = argument('log') ?? null;

/**
 * 2.1.4 — the verification token for an address, read from the server's console output.
 *
 * @returns the token, or null when there is no log to read or the line has not appeared. The
 *   distinction matters: "no log given" is a UAT configuration gap and "no line for this address"
 *   is a real failure of the registration path.
 */
async function verificationTokenFor(email: string): Promise<string | null> {
  if (logPath === null) {
    return null;
  }
  // The server's stdout reaches the file a moment after the response reaches us, so a single read
  // races the write and reports a missing token for a registration that worked. Waiting briefly is
  // the honest analogue of waiting for the email to arrive.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const found = search(email);
    if (found !== null) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return null;
}

function search(email: string): string | null {
  const log = readFileSync(logPath as string, 'utf8');
  // The last occurrence, because a re-run of the UAT appends a newer token for the same address.
  // Scanned line by line rather than with a regex built from the address. The address contains a
  // `+` and dots, which are regex metacharacters — an earlier version interpolated it unescaped,
  // so `resident+m` read as "residen, then one or more t" and matched nothing. Reporting "no token
  // was logged" for a registration that had worked perfectly is the worst kind of test failure.
  const marker = `verification token for ${email}: `;
  const lines = log.split('\n').filter((line) => line.includes(marker));
  // The last one: a re-run appends a newer token for the same address.
  const line = lines[lines.length - 1];
  if (line === undefined) {
    return null;
  }
  const token = line.slice(line.indexOf(marker) + marker.length).trim();
  return token === '' ? null : token;
}

async function main(): Promise<void> {
  console.log(`D-Fence UAT against ${base}\n`);

  // --- Segment A: the system is up and credits its sources publicly -------------------------
  const anonymous: Session = { token: null, role: null, accountId: null };

  const up = await step('A', '10.4.5', 'attribution is readable without signing in', async () => {
    const result = await call(anonymous, 'GET', '/api/attribution');
    if (result.status !== 200) {
      return `expected 200, got ${result.status} — is the server running on ${base}?`;
    }
    const sources = (result.body.attributions ?? []) as unknown[];
    return sources.length >= 3 ? null : `only ${sources.length} source(s) credited`;
  });

  if (!up) {
    report();
    return;
  }

  await step('A', '2.3.7', 'a protected route refuses an anonymous caller', async () => {
    const result = await call(anonymous, 'GET', '/api/ops/dashboard');
    if (result.status !== 401 && result.status !== 403) {
      return `expected 401/403, got ${result.status}`;
    }
    // 2.3.7 — the refusal must not describe what was refused.
    const text = JSON.stringify(result.body).toLowerCase();
    return text.includes('manager') || text.includes('role') ? 'the refusal names a role' : null;
  });

  // --- Segment B: the resident journey -------------------------------------------------------
  const resident: Session = { token: null, role: null, accountId: null };
  const residentEmail = uniqueEmail('resident');
  // Carried into segment C: a manager cannot moderate a report the resident never filed, and the
  // point of an acceptance test is that the two journeys are the same system.
  let reportId = '';
  let secondReportId = '';
  let savedLocationId = '';

  const registered = await step('B1', '2.1.1, 2.1.4', 'a resident can register', async () => {
    const result = await call(anonymous, 'POST', '/api/auth/register', {
      email: residentEmail,
      password: PASSWORD,
    });
    return result.status === 201 ? null : `expected 201, got ${result.status}: ${JSON.stringify(result.body)}`;
  });

  await step('B1', '2.1.2, 2.1.3', 'a weak password is refused', async () => {
    const result = await call(anonymous, 'POST', '/api/auth/register', {
      email: uniqueEmail('weak'),
      password: 'short',
    });
    return result.status >= 400 ? null : `a 5-character password was accepted (${result.status})`;
  });

  const verified =
    registered &&
    (await step('B1', '2.1.4', 'the emailed verification link activates the account', async () => {
      const token = await verificationTokenFor(residentEmail);
      if (token === null) {
        return logPath === null
          ? 'no --log given, so the verification token cannot be read (pass --log <server log>)'
          : 'no verification token was logged for this address';
      }
      const result = await call(anonymous, 'POST', '/api/auth/verify', { token });
      return result.status === 200
        ? null
        : `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
    }));

  if (verified) {
    const signedIn = await step('B1', '2.1.6, 2.1.8', 'a resident can sign in', async () => {
      const result = await call(anonymous, 'POST', '/api/auth/signin', {
        email: residentEmail,
        password: PASSWORD,
      });
      if (result.status !== 200) {
        // 2.1.4 gates sign-in on verification, which needs a mailbox this tool does not have.
        return `expected 200, got ${result.status}: ${JSON.stringify(result.body)} — if this is a verification gate, the UAT needs the dev verification token`;
      }
      resident.token = String(result.body.token);
      resident.role = result.body.role as Role;
      resident.accountId = String(result.body.accountId);
      return resident.role === Role.Resident ? null : `signed in as ${String(resident.role)}`;
    });

    if (signedIn) {
      await step('B2', '3.1.3', 'OneMap resolves an address to candidates', async () => {
        const result = await call(resident, 'POST', '/api/locations/search', { text: 'Ho Ching Road' });
        if (result.status !== 200) {
          return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
        }
        const candidates = (result.body.candidates ?? []) as unknown[];
        return candidates.length > 0 ? null : 'no candidates — is ONE_MAP_TOKEN valid?';
      });

      await step('B2', '3.1.4, 3.1.6', 'a confirmed candidate is saved as a location', async () => {
        const search = await call(resident, 'POST', '/api/locations/search', { text: 'Woodlands Ring Road' });
        const candidates = (search.body.candidates ?? []) as Array<Record<string, unknown>>;
        const first = candidates[0];
        if (first === undefined) {
          return 'OneMap returned no candidate to confirm';
        }
        // A candidate carries a `point`, not loose coordinates — and 3.1.4 requires the saved
        // location to come from one the search returned, so the shape is part of the rule.
        const point = (first.point ?? {}) as Record<string, unknown>;
        const result = await call(resident, 'POST', '/api/locations', {
          candidate: {
            latitude: point.latitude,
            longitude: point.longitude,
            address: first.address,
            postalCode: first.postalCode ?? null,
          },
          label: 'Home',
          name: 'UAT home',
          inputText: 'Woodlands Ring Road',
        });
        if (result.status !== 201) {
          return `expected 201, got ${result.status}: ${JSON.stringify(result.body)}`;
        }
        savedLocationId = String(result.body.id ?? '');
        return savedLocationId === '' ? 'the saved location has no id' : null;
      });

      await step('B2', '3.1.9, 3.1.10', 'the saved location reports an exposure status', async () => {
        const result = await call(resident, 'GET', '/api/locations');
        if (result.status !== 200) {
          return `expected 200, got ${result.status}`;
        }
        const locations = (result.body.locations ?? []) as Array<Record<string, unknown>>;
        const saved = locations.find((l) => String(l.id) === savedLocationId);
        if (saved === undefined) {
          return 'the location just saved is not in the list';
        }
        // 3.1.10 — the three statuses are a stated set; a location with no status at all is a card
        // the resident cannot act on, which is the failure 10.5.x exists to prevent.
        return typeof saved.status === 'string' && saved.status !== ''
          ? null
          : 'the saved location carries no exposure status';
      });

      await step('B2', '3.1.13, 3.1.17', 'an unresolvable address is 404, not 503', async () => {
        const result = await call(resident, 'POST', '/api/locations/search', {
          text: 'Qqzzx Nonexistent Road 999',
        });
        // The two failures must stay distinguishable: 503 tells a resident the service is down,
        // 404 tells them the address is wrong, and collapsing them tells someone their home does
        // not exist every time the OneMap token lapses.
        if (result.status === 503) {
          return 'a nonsense address returned 503 — geocoding unavailable, or the two are collapsed';
        }
        if (result.status === 404) {
          return null;
        }
        if (result.status !== 200) {
          return `expected 200 with no candidates or 404, got ${result.status}`;
        }
        const candidates = (result.body.candidates ?? []) as unknown[];
        return candidates.length === 0 ? null : `${candidates.length} candidate(s) for a nonsense address`;
      });

      await step('B3', '9.1.1, 9.1.11', 'the map layers carry clusters with a tier label', async () => {
        const result = await call(resident, 'GET', '/api/map/layers');
        if (result.status !== 200) {
          return `expected 200, got ${result.status}`;
        }
        const clusters = (result.body.clusters ?? []) as Array<Record<string, unknown>>;
        if (clusters.length === 0) {
          return 'no clusters — run `npm run ingest` first';
        }
        // 9.1.11 — the tier must be conveyed as text, not only as a colour.
        return typeof clusters[0]?.tierLabel === 'string'
          ? null
          : 'clusters carry no tierLabel, so the map would rely on colour alone';
      });

      // 5.1.5's resident half. A report may carry photographs, and until the upload endpoint existed
      // the screen sent `storageKey: file.name` — a report referring to an image that had never
      // been sent anywhere. This beat uploads first and files the key it gets back.
      let reportPhotoKey: string | null = null;
      await step('B4', '5.1.5, 10.3.5', 'a resident can upload a report photograph', async () => {
        const result = await call(resident, 'POST', '/api/uploads/report-photo', {
          contentType: 'image/png',
          data: PIXEL_PNG_BASE64,
        });
        if (result.status !== 201) {
          return `expected 201, got ${result.status}: ${JSON.stringify(result.body)}`;
        }
        reportPhotoKey = typeof result.body.key === 'string' ? result.body.key : null;
        // 10.3.5 — the key must be opaque. A key derived from the account or the filename would
        // make one photograph's URL a map to everyone else's.
        return reportPhotoKey === null
          ? 'the upload returned no key'
          : /^[0-9a-f-]{36}\.(jpg|png)$/.test(reportPhotoKey)
            ? null
            : `the key is not opaque: ${reportPhotoKey}`;
      });

      await step('B4', '5.1.1–5.1.5', 'a resident can submit a report, carrying the photograph', async () => {
        const result = await call(resident, 'POST', '/api/reports', {
          latitude: SITE.latitude,
          longitude: SITE.longitude,
          type: 'StandingWater',
          description: 'UAT — standing water in a disused pot behind the void deck.',
          photos:
            reportPhotoKey === null
              ? []
              : [
                  {
                    filename: 'uat-site.png',
                    contentType: 'image/png',
                    sizeBytes: 70,
                    storageKey: reportPhotoKey,
                  },
                ],
        });
        if (result.status !== 201) {
          return `expected 201, got ${result.status}: ${JSON.stringify(result.body)}`;
        }
        reportId = String(result.body.reportId ?? '');
        return reportId === '' ? 'the submission returned no report id' : null;
      });

      // A second report, far enough away and of a different type that 5.1.11 cannot call it a
      // duplicate. Segment C rejects this one, so that BOTH moderation outcomes are demonstrated —
      // a queue in which nothing is ever rejected has only been half tested.
      await step('B4', '5.1.1–5.1.4', 'a second, unrelated report is accepted', async () => {
        const result = await call(resident, 'POST', '/api/reports', {
          latitude: SITE.latitude - 0.04,
          longitude: SITE.longitude - 0.05,
          type: 'BlockedDrain',
          description: 'UAT — drain blocked with leaf litter at the far end of the estate.',
          photos: [],
        });
        if (result.status !== 201) {
          return `expected 201, got ${result.status}: ${JSON.stringify(result.body)}`;
        }
        secondReportId = String(result.body.reportId ?? '');
        return secondReportId === '' ? 'the submission returned no report id' : null;
      });

      await step('B4', '5.1.4', 'an over-length description is refused', async () => {
        const result = await call(resident, 'POST', '/api/reports', {
          latitude: SITE.latitude + 0.01,
          longitude: SITE.longitude + 0.01,
          type: 'StandingWater',
          description: 'x'.repeat(501),
          photos: [],
        });
        return result.status >= 400 ? null : `501 characters was accepted (${result.status})`;
      });

      await step('B5', '5.1.11', 'a near-duplicate report within the hour is refused', async () => {
        // Twenty metres from the first report, immediately after it.
        const result = await call(resident, 'POST', '/api/reports', {
          latitude: SITE.latitude + 0.00018,
          longitude: SITE.longitude,
          type: 'StandingWater',
          description: 'UAT — the same pot, reported again.',
          photos: [],
        });
        return result.status === 409
          ? null
          : `expected 409 duplicate, got ${result.status}: ${JSON.stringify(result.body)}`;
      });

      await step('B6', '6.1.7', 'a Telegram linking code can be issued', async () => {
        const result = await call(resident, 'POST', '/api/alerts/link', {});
        if (result.status !== 200) {
          return `expected 200, got ${result.status}`;
        }
        return /^\d{6}$/.test(String(result.body.code)) ? null : `code is ${String(result.body.code)}`;
      });

      if (savedLocationId !== '') {
        await step('B6', '6.2.1, 6.2.2', 'alerts can be switched on for one location', async () => {
          const result = await call(resident, 'POST', `/api/locations/${savedLocationId}/alerts`, {
            enabled: true,
            growthThreshold: 5,
          });
          if (result.status !== 200) {
            return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
          }
          return result.body.enabled === true ? null : 'the subscription came back disabled';
        });

        await step('B7', '3.1.12', 'deleting a location says what went with it', async () => {
          const result = await call(resident, 'POST', `/api/locations/${savedLocationId}/delete`, {});
          if (result.status !== 200) {
            return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
          }
          // The cascade is stated, not silent: the resident just turned alerts on for this
          // location, so exactly one subscription must be reported as removed. Zero would mean the
          // subscription outlived the thing it points at.
          return Number(result.body.subscriptionsRemoved) >= 1
            ? null
            : `the alert subscription was not reported as removed (${String(result.body.subscriptionsRemoved)})`;
        });
      } else {
        skip('B6', '6.2.1', 'alerts can be switched on for one location', 'no location was saved');
        skip('B7', '3.1.12', 'deleting a location says what went with it', 'no location was saved');
      }

      await step('B', '2.3.3', 'a resident is refused the operations dashboard', async () => {
        const result = await call(resident, 'GET', '/api/ops/dashboard');
        return result.status === 403 ? null : `expected 403, got ${result.status}`;
      });
    } else {
      for (const [beat, requirement, what] of [
        ['B2', '3.1.3', 'OneMap resolves an address'],
        ['B3', '9.1.1', 'map layers carry clusters'],
        ['B4', '5.1.x', 'a resident can submit a report'],
        ['B5', '5.1.11', 'a near-duplicate is refused'],
        ['B6', '6.1.7', 'a Telegram linking code can be issued'],
      ] as const) {
        skip(beat, requirement, what, 'the resident could not sign in');
      }
    }
  } else {
    for (const [beat, requirement, what] of [
      ['B1', '2.1.6', 'a resident can sign in'],
      ['B2', '3.1.3', 'OneMap resolves an address'],
      ['B3', '9.1.1', 'map layers carry clusters'],
      ['B4', '5.1.x', 'a resident can submit a report'],
      ['B5', '5.1.11', 'a near-duplicate is refused'],
      ['B6', '6.1.7', 'a Telegram linking code can be issued'],
    ] as const) {
      skip(beat, requirement, what, 'the account was never verified (2.1.4)');
    }
  }

  // --- Segment C: the operations journey -----------------------------------------------------
  const manager: Session = { token: null, role: null, accountId: null };

  const managerIn = await step('C', '2.2.1', 'the seeded manager can sign in', async () => {
    const result = await call(anonymous, 'POST', '/api/auth/signin', {
      ...seedManager(),
    });
    if (result.status !== 200) {
      return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
    }
    manager.token = String(result.body.token);
    manager.role = result.body.role as Role;
    manager.accountId = String(result.body.accountId);
    return manager.role === Role.OperationsManager ? null : `signed in as ${String(manager.role)}`;
  });

  if (managerIn) {
    await step('C', '7.1.x, 7.1.9', 'the dashboard reports counts and the age of its data', async () => {
      const result = await call(manager, 'GET', '/api/ops/dashboard');
      if (result.status !== 200) {
        return `expected 200, got ${result.status}`;
      }
      const overview = result.body.overview as Record<string, unknown> | undefined;
      if (overview === undefined) {
        return 'no overview in the payload';
      }
      // 7.1.9 — the field must exist even when null; its absence is what lets a screen omit it.
      return 'dataAsOf' in overview ? null : 'the overview carries no dataAsOf (7.1.9)';
    });

    await step('C', '7.2.1, 4.1.10', 'the priority table is ranked and carries a breakdown', async () => {
      const result = await call(manager, 'GET', '/api/ops/priority');
      if (result.status !== 200) {
        return `expected 200, got ${result.status}`;
      }
      const rows = (result.body.rows ?? []) as Array<Record<string, unknown>>;
      if (rows.length === 0) {
        return 'no rows — run `npm run ingest` first';
      }
      const ranks = rows.map((r) => Number(r.rank));
      const ordered = ranks.every((rank, i) => i === 0 || rank >= (ranks[i - 1] as number));
      return ordered ? null : `ranks are not ascending: ${ranks.join(', ')}`;
    });

    await step('C', '1.4.1–1.4.4', 'source health is reported per source', async () => {
      const result = await call(manager, 'GET', '/api/ops/sources');
      if (result.status !== 200) {
        return `expected 200, got ${result.status}`;
      }
      const sources = (result.body.sources ?? []) as Array<Record<string, unknown>>;
      if (sources.length === 0) {
        return 'no sources reported';
      }
      // 1.4.1 — never-succeeded must be distinguishable from long-ago, so the field may be null
      // but must be present.
      return sources.every((s) => 'lastSuccessAt' in s && 'isWarning' in s)
        ? null
        : 'a source is missing lastSuccessAt or isWarning';
    });

    await step('C', '1.1.18', 'a manager can trigger an ingestion run and gets its outcome back', async () => {
      // The Rainfall source alone: it is the five-minute feed, so a manual run costs the least
      // against 10.4.6's courtesy budget while still exercising the whole path.
      const result = await call(manager, 'POST', '/api/ops/sources/refresh', { source: 'Rainfall' });
      if (result.status !== 200) {
        return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
      }
      const runs = (result.body.runs ?? []) as Array<Record<string, unknown>>;
      if (runs.length !== 1 || runs[0]?.source !== 'Rainfall') {
        return `expected one Rainfall run, got ${JSON.stringify(runs)}`;
      }
      // A FAILED outcome is a real answer here — the feed may genuinely be down — but the run must
      // have been recorded and the panel must come back with it, or the screen has nothing to show.
      return Array.isArray(result.body.sources) ? null : 'the health panel did not come back with the run';
    });

    await step('D', '1.1.18, 2.3.4', 'a resident cannot trigger an ingestion run', async () => {
      const result = await call(resident, 'POST', '/api/ops/sources/refresh', {});
      return result.status === 403 ? null : `expected 403, got ${result.status}`;
    });

    await step('C', '8.1.7, 8.1.8', 'a daily dispatch list is proposed', async () => {
      const result = await call(manager, 'GET', '/api/ops/dispatch');
      if (result.status !== 200) {
        return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
      }
      return Array.isArray(result.body.proposals) ? null : 'no proposals array';
    });

    await step('C', '7.3.1-7.3.5', 'all five analytics charts are built, each stating its sufficiency', async () => {
      const result = await call(manager, 'GET', '/api/ops/analytics');
      if (result.status !== 200) {
        return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
      }
      const charts = result.body.charts as Record<string, Record<string, unknown>> | null;
      if (charts === null) {
        return 'the analytics controller is not wired in';
      }
      const expected = ['activeCases', 'tierDistribution', 'crewWorkload', 'turnaround', 'reportsPerDay'];
      const missing = expected.filter((name) => charts[name] === undefined);
      if (missing.length > 0) {
        return `missing chart(s): ${missing.join(', ')}`;
      }
      // 10.5.3 and 7.3.x: a chart drawn from four days of history is not wrong, it is insufficient,
      // and it has to say which it is. A chart reporting `sufficient: false` with no reason is
      // exactly what this check exists to catch.
      const unexplained = expected.filter(
        (name) => charts[name]?.sufficient === false && !charts[name]?.insufficientReason,
      );
      return unexplained.length === 0
        ? null
        : `chart(s) insufficient with no reason given: ${unexplained.join(', ')}`;
    });

    await step('C', '7.4.2, 7.4.3', 'the priority table exports as CSV with a header row', async () => {
      const table = await call(manager, 'GET', '/api/ops/priority');
      const rows = (table.body.rows ?? []) as unknown[];
      const csv = await callText(manager, '/api/ops/priority.csv');
      if (csv.status !== 200) {
        return `expected 200, got ${csv.status}`;
      }
      const lines = csv.text.trim().split('\n').filter((line) => line.trim() !== '');
      if (lines.length === 0) {
        return 'the export is empty';
      }
      // Every cell is quoted, because several localities contain commas.
      const header = String(lines[0]);
      if (!header.includes('"rank"') || !header.includes('"locality"')) {
        return `the first line is not a header row: ${header.slice(0, 60)}`;
      }
      // 7.4.3 - the export is the view, not the whole table. A count that disagrees with the
      // screen is worse than no export, because it is taken away and used.
      return lines.length - 1 === rows.length
        ? null
        : `the export has ${lines.length - 1} row(s) for a table of ${rows.length}`;
    });

    await step('C', '9.2.1, 4.1.10', 'a cluster opens with its full driver breakdown', async () => {
      const id = await firstClusterId(manager);
      if (id === null) {
        return 'no clusters ingested';
      }
      const result = await call(manager, 'GET', `/api/map/clusters/${id}`);
      if (result.status !== 200) {
        return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
      }
      const contributions = (result.body.breakdown ?? []) as unknown[];
      // 4.1.10 - a manager acting on a rank is entitled to see what produced it. An empty
      // breakdown renders as a detail panel with a number and no argument behind it.
      return contributions.length > 0
        ? null
        : 'the detail panel carries no driver contributions (4.1.10)';
    });

    await step('C', '5.3.1', 'the moderation queue is readable', async () => {
      const result = await call(manager, 'GET', '/api/ops/moderation');
      return result.status === 200 ? null : `expected 200, got ${result.status}`;
    });

    if (reportId !== '') {
      await step('C', '5.3.2, 5.2.5', 'a moderator can verify a report', async () => {
        const result = await call(manager, 'POST', `/api/ops/moderation/${reportId}/verify`, {});
        if (result.status !== 200) {
          return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
        }
        return result.body.status === 'Verified' ? null : `the report is ${String(result.body.status)}`;
      });

      await step('C', '7.5.3', 'the attention panel names the moderation backlog', async () => {
        const result = await call(manager, 'GET', '/api/ops/dashboard');
        const items = (result.body.attention ?? []) as Array<Record<string, unknown>>;
        // The second report is still Submitted at this point. 7.5.3 asks for the count and the age
        // of the oldest, so an item that merely says "some are waiting" is not it.
        const backlog = items.find((i) => i.kind === 'reportAwaitingModeration');
        if (backlog === undefined) {
          return 'no reportAwaitingModeration item, though a report is awaiting moderation';
        }
        return /\d+ report\(s\)/.test(String(backlog.detail))
          ? null
          : `the item does not state a count: ${String(backlog.detail)}`;
      });
    } else {
      skip('C', '5.3.2', 'a moderator can verify a report', 'no report was submitted');
      skip('C', '7.5.3', 'the attention panel names the moderation backlog', 'no report was submitted');
    }

    if (secondReportId !== '') {
      await step('C', '5.3.3, 5.3.4', 'a moderator can reject a report, with a reason', async () => {
        const bare = await call(manager, 'POST', `/api/ops/moderation/${secondReportId}/reject`, {});
        if (bare.status < 400) {
          // 5.3.4 - a rejection with no reason is a decision the resident can learn nothing from,
          // and the requirement makes the reason mandatory rather than encouraged.
          return `a rejection with no reason was accepted (${bare.status})`;
        }
        const result = await call(manager, 'POST', `/api/ops/moderation/${secondReportId}/reject`, {
          reason: 'UAT - the photograph shows a drain that is flowing normally.',
        });
        if (result.status !== 200) {
          return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
        }
        return result.body.status === 'Rejected' ? null : `the report is ${String(result.body.status)}`;
      });
    } else {
      skip('C', '5.3.3', 'a moderator can reject a report', 'no second report was submitted');
    }

    if (resident.token !== null && reportId !== '') {
      await step('C', '5.2.8', 'the resident sees their own report move to Verified', async () => {
        const result = await call(resident, 'GET', '/api/reports/mine');
        if (result.status !== 200) {
          return `expected 200, got ${result.status}`;
        }
        const mine = (result.body.reports ?? []) as Array<Record<string, unknown>>;
        const own = mine.find((r) => String(r.id ?? r.reportId) === reportId);
        if (own === undefined) {
          return 'the resident cannot see the report they filed';
        }
        return own.status === 'Verified' ? null : `the resident still sees it as ${String(own.status)}`;
      });
    }

    // --- Segment D: the crew loop ------------------------------------------------------------
    const crewEmail = uniqueEmail('crew');
    const crew: Session = { token: null, role: null, accountId: null };

    const crewMade = await step('D', '2.2.1', 'a manager can create a crew account', async () => {
      const result = await call(manager, 'POST', '/api/ops/staff', {
        email: crewEmail,
        role: Role.CleaningCrew,
        password: PASSWORD,
      });
      if (result.status !== 200 && result.status !== 201) {
        return `expected 200/201, got ${result.status}: ${JSON.stringify(result.body)}`;
      }
      crew.accountId = String(result.body.id ?? result.body.accountId ?? '');
      return crew.accountId === '' ? 'no account id returned' : null;
    });

    let workOrderId = '';
    const clusterId = await firstClusterId(manager);

    if (clusterId === null) {
      skip('D', '8.1.1', 'a manager can raise a work order', 'no clusters ingested');
    } else {
      // 8.1.11 blocks a second open work order of the same type on the same cluster, and with the
      // work orders now in Postgres an earlier run that failed halfway leaves its order open for
      // ever — so every later run would be refused before it began. Cancelling the leftover is what
      // a manager would actually do, and it demonstrates 8.3.18 on the way past.
      await step('D', '8.3.18', 'a work order left open by an earlier run can be cancelled', async () => {
        const open = await call(manager, 'GET', '/api/ops/work-orders');
        const orders = (open.body.workOrders ?? open.body.rows ?? []) as Array<Record<string, unknown>>;
        const stale = orders.filter(
          (w) =>
            String(w.clusterId) === clusterId &&
            w.taskType === 'Fogging' &&
            w.status !== 'Verified' &&
            w.status !== 'Cancelled',
        );
        for (const order of stale) {
          const result = await call(manager, 'POST', `/api/ops/work-orders/${String(order.id)}/cancel`, {
            reason: 'UAT — clearing a work order left open by an earlier run.',
          });
          if (result.status !== 200) {
            return `could not cancel ${String(order.id)}: ${result.status} ${JSON.stringify(result.body)}`;
          }
        }
        return null;
      });

      await step('D', '8.1.1–8.1.6', 'a manager can raise a work order', async () => {
        const result = await call(manager, 'POST', '/api/ops/work-orders', {
          clusterId,
          taskType: 'Fogging',
          scheduledDate: new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10),
          instructions: 'UAT — fog the perimeter drains.',
        });
        if (result.status !== 201) {
          return `expected 201, got ${result.status}: ${JSON.stringify(result.body)}`;
        }
        workOrderId = String(result.body.id);
        return null;
      });

      if (workOrderId !== '') {
        await step('D', '8.1.11, 8.1.12', 'a duplicate work order is refused, naming the blocker', async () => {
          const result = await call(manager, 'POST', '/api/ops/work-orders', {
            clusterId,
            taskType: 'Fogging',
            scheduledDate: new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10),
          });
          if (result.status !== 409) {
            return `expected 409, got ${result.status}`;
          }
          // 8.1.12 — the refusal must carry the order that blocked it, or the manager must search.
          return result.body.existing === undefined
            ? 'the 409 does not carry the blocking work order (8.1.12)'
            : null;
        });

        await step('D', '8.1.4', 'a work order scheduled in the past is refused', async () => {
          const result = await call(manager, 'POST', '/api/ops/work-orders', {
            clusterId,
            taskType: 'Inspection',
            scheduledDate: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10),
            instructions: 'UAT - should never be accepted.',
          });
          return result.status >= 400
            ? null
            : `a date three days ago was accepted (${result.status})`;
        });

        // 8.3.14 / 7.5.2 cannot be demonstrated from outside: the only way to make a work order
        // overdue through the API is to schedule it in the past, and 8.1.4 - correctly - refuses
        // that. Recorded as a skip with the reason rather than left out, so the gap is visible in
        // the run and not only in someone's memory. It is covered by the unit suite instead.
        skip(
          'D',
          '8.3.14, 7.5.2',
          'an overdue work order is flagged for attention',
          'unreachable over HTTP: 8.1.4 refuses a past scheduled date, so no overdue order can be created',
        );

        await step('D', '8.2.5', 'crew workload is reported for the assignment decision', async () => {
          const result = await call(manager, 'GET', '/api/ops/work-orders/crew-workload');
          if (result.status !== 200) {
            return `expected 200, got ${result.status} — is crew-workload registered before :id?`;
          }
          const list = (result.body.crew ?? []) as Array<Record<string, unknown>>;
          return list.every((c) => 'openWorkOrders' in c) ? null : 'a crew row has no openWorkOrders';
        });

        if (crewMade) {
          await step('D', '8.2.1', 'a manager can assign the work order to a crew member', async () => {
            const result = await call(manager, 'POST', `/api/ops/work-orders/${workOrderId}/assign`, {
              crewId: crew.accountId,
            });
            return result.status === 200
              ? null
              : `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
          });

          const crewIn = await step('D', '2.1.6', 'the crew member can sign in', async () => {
            const result = await call(anonymous, 'POST', '/api/auth/signin', {
              email: crewEmail,
              password: PASSWORD,
            });
            if (result.status !== 200) {
              return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
            }
            crew.token = String(result.body.token);
            crew.role = result.body.role as Role;
            return crew.role === Role.CleaningCrew ? null : `signed in as ${String(crew.role)}`;
          });

          if (crewIn) {
            await step('D', '8.4.1', 'the crew member sees the job assigned to them', async () => {
              const result = await call(crew, 'GET', '/api/crew/work-orders?filter=All');
              if (result.status !== 200) {
                return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
              }
              const jobs = (result.body.workOrders ?? []) as Array<Record<string, unknown>>;
              return jobs.some((j) => j.id === workOrderId)
                ? null
                : `the assigned job is not in the crew member's list (${jobs.length} job(s))`;
            });

            await step('D', '2.3.5', 'the crew member is refused a manager screen', async () => {
              const result = await call(crew, 'GET', '/api/ops/work-orders');
              return result.status === 403 ? null : `expected 403, got ${result.status}`;
            });

            await step('D', '8.3.3, 8.3.4', 'the crew member can accept and start the job', async () => {
              const accepted = await call(crew, 'POST', `/api/crew/work-orders/${workOrderId}/accept`, {});
              if (accepted.status !== 200) {
                return `accept: expected 200, got ${accepted.status}: ${JSON.stringify(accepted.body)}`;
              }
              const started = await call(crew, 'POST', `/api/crew/work-orders/${workOrderId}/start`, {});
              return started.status === 200
                ? null
                : `start: expected 200, got ${started.status}: ${JSON.stringify(started.body)}`;
            });

            await step('D', '8.3.7', 'a completion with no photograph is refused', async () => {
              const result = await call(crew, 'POST', `/api/crew/work-orders/${workOrderId}/complete`, {
                notes: 'UAT — done, but with no evidence.',
                photoKeys: [],
              });
              return result.status >= 400
                ? null
                : `a completion with no photograph was accepted (${result.status})`;
            });

            /**
             * The beat this harness was missing, and the reason it reported 8.3.7 as met for weeks
             * while nothing was ever stored: it checked that an *empty* key list was refused and
             * never checked that a key referred to anything. `photoKeys:
             * ["not-a-real-file-at-all"]` closed a work order and every run printed PASS.
             */
            await step('D', '8.3.7, 10.3.6', 'a completion citing a photograph that does not exist is refused', async () => {
              const result = await call(crew, 'POST', `/api/crew/work-orders/${workOrderId}/complete`, {
                notes: 'UAT — citing a key that names nothing.',
                photoKeys: ['not-a-real-file-at-all'],
              });
              return result.status >= 400
                ? null
                : `a fabricated photograph key was accepted as evidence (${result.status})`;
            });

            // A real photograph, uploaded through the real endpoint, so what follows is testing the
            // requirement rather than testing a string.
            let photoKey: string | null = null;
            await step('D', '5.1.5, 8.3.6', 'the crew member can upload a photograph', async () => {
              const result = await call(crew, 'POST', '/api/uploads/completion-evidence', {
                contentType: 'image/png',
                data: PIXEL_PNG_BASE64,
              });
              if (result.status !== 201) {
                return `expected 201, got ${result.status}: ${JSON.stringify(result.body)}`;
              }
              photoKey = typeof result.body.key === 'string' ? result.body.key : null;
              return photoKey === null ? 'the upload returned no key' : null;
            });

            await step('D', '5.1.5, 10.3.6', 'a PDF is refused as a photograph', async () => {
              const result = await call(crew, 'POST', '/api/uploads/completion-evidence', {
                contentType: 'application/pdf',
                data: PIXEL_PNG_BASE64,
              });
              return result.status === 422
                ? null
                : `expected 422, got ${result.status}: ${JSON.stringify(result.body)}`;
            });

            const completed =
              photoKey === null
                ? (skip('D', '8.3.6, 8.3.7', 'the crew member can record a completion', 'the photograph upload failed'), false)
                : await step('D', '8.3.6, 8.3.7', 'the crew member can record a completion', async () => {
                    const result = await call(crew, 'POST', `/api/crew/work-orders/${workOrderId}/complete`, {
                      notes: 'UAT — perimeter drains fogged.',
                      photoKeys: [photoKey],
                    });
                    return result.status === 200
                      ? null
                      : `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
                  });

            if (completed) {
              /**
             * 2.4.1, 2.4.2 — the trail, read back over HTTP.
             *
             * Placed after the whole dispatch loop on purpose: by this point the run has assigned,
             * accepted, started, been refused twice and completed, so a trail that answers with
             * any of those is a trail that survived the round trip to Postgres. Until 2026-09-05
             * `audit_record` held zero rows in the deployment — the hooks all wrote to an array a
             * container restart discarded.
             */
            await step('D', '2.4.1, 2.3.4', 'the manager can read the audit trail', async () => {
              const result = await call(manager, 'GET', '/api/ops/audit?limit=50');
              if (result.status !== 200) {
                return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
              }
              const entries = (result.body.entries ?? []) as Array<Record<string, unknown>>;
              if (entries.length === 0) {
                return 'the trail is empty after a full dispatch run — nothing is being persisted';
              }
              const row = entries[0] as Record<string, unknown>;
              // All four of 2.4.1's columns, or it is not the trail.
              return typeof row.accountId === 'string'
                && typeof row.action === 'string'
                && typeof row.targetEntity === 'string'
                && typeof row.occurredAt === 'string'
                ? null
                : `an entry is missing one of the four required fields: ${JSON.stringify(row)}`;
            });

            await step('D', '2.4.1, 8.3.x', 'the work order has an audited history of its own', async () => {
              const result = await call(manager, 'GET', `/api/ops/work-orders/${workOrderId}/history`);
              if (result.status !== 200) {
                return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
              }
              const entries = (result.body.entries ?? []) as Array<Record<string, unknown>>;
              // The endpoint `WorkOrderRoutes` has documented since §8 was built, and which did
              // not exist until now: the entity keeps no second copy of who moved it.
              if (!entries.some((e) => String(e.action).includes('assign'))) {
                return `the assignment is not in the order's history (${entries.length} entr(ies))`;
              }
              return entries.every((e) => e.targetId === workOrderId)
                ? null
                : "the history contains another entity's rows";
            });

            await step('D', '2.3.4, 2.3.8', 'a crew member is refused the audit trail, and the refusal is logged', async () => {
              const refused = await call(crew, 'GET', '/api/ops/audit');
              if (refused.status !== 403) {
                return `expected 403, got ${refused.status}`;
              }
              // 2.3.8 — someone probing the trail is exactly what the trail is for.
              const result = await call(manager, 'GET', '/api/ops/audit?limit=50');
              const entries = (result.body.entries ?? []) as Array<Record<string, unknown>>;
              return entries.some((e) => e.refused === true && String(e.action) === 'audit:read')
                ? null
                : 'the refusal was not recorded in the trail';
            });

            await step('D', '8.3.12, 4.1.15', 'the manager can verify it, writing a treatment record', async () => {
                const result = await call(manager, 'POST', `/api/ops/work-orders/${workOrderId}/verify`, {});
                if (result.status !== 200) {
                  return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
                }
                // This record is what moves 4.1.16's driver, which is what closes the loop the
                // demonstration exists to show.
                return result.body.treatmentRecordId === undefined
                  ? 'verification produced no treatment record (8.3.12)'
                  : null;
              });
            } else {
              skip('D', '8.3.12', 'the manager can verify the completion', 'the completion failed');
            }
          }
        }
      }
    }
  }

  report();
}

/** The first cluster id the manager can see, or null when nothing has been ingested. */
async function firstClusterId(manager: Session): Promise<string | null> {
  const result = await call(manager, 'GET', '/api/ops/priority');
  const rows = (result.body.rows ?? []) as Array<Record<string, unknown>>;
  return rows.length === 0 ? null : String(rows[0]?.clusterId);
}

function report(): void {
  console.log('  beat  requirement          result   what');
  console.log('  ----  -------------------  -------  ---------------------------------------------');
  for (const outcome of outcomes) {
    console.log(
      `  ${outcome.beat.padEnd(4)}  ${outcome.requirement.padEnd(19)}  ${outcome.status.padEnd(7)}  ${outcome.what}`,
    );
    if (outcome.detail !== '') {
      console.log(`        ${outcome.detail}`);
    }
  }

  const passed = outcomes.filter((o) => o.status === 'PASS').length;
  const failed = outcomes.filter((o) => o.status === 'FAIL').length;
  const skipped = outcomes.filter((o) => o.status === 'SKIP').length;
  console.log(`\n  ${passed} passed, ${failed} failed, ${skipped} skipped.`);
  if (failed > 0) {
    console.log('  A failed beat cannot be rehearsed. Fix it before the demonstration.');
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error('UAT could not run:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
