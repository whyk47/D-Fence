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

interface Outcome {
  beat: string;
  requirement: string;
  what: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
}

const outcomes: Outcome[] = [];
const base = argument('base') ?? 'http://localhost:3000';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
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

      await step('B4', '5.1.1–5.1.4', 'a resident can submit a report', async () => {
        const result = await call(resident, 'POST', '/api/reports', {
          latitude: 1.3966,
          longitude: 103.8721,
          type: 'StandingWater',
          description: 'UAT — standing water in a disused pot behind the void deck.',
          photos: [],
        });
        return result.status === 201
          ? null
          : `expected 201, got ${result.status}: ${JSON.stringify(result.body)}`;
      });

      await step('B4', '5.1.4', 'an over-length description is refused', async () => {
        const result = await call(resident, 'POST', '/api/reports', {
          latitude: 1.4,
          longitude: 103.87,
          type: 'StandingWater',
          description: 'x'.repeat(501),
          photos: [],
        });
        return result.status >= 400 ? null : `501 characters was accepted (${result.status})`;
      });

      await step('B5', '5.1.11', 'a near-duplicate report within the hour is refused', async () => {
        // Twenty metres from the first report, immediately after it.
        const result = await call(resident, 'POST', '/api/reports', {
          latitude: 1.39678,
          longitude: 103.8721,
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
      email: process.env.DFENCE_SEED_MANAGER_EMAIL ?? 'manager@d-fence.local',
      password: process.env.DFENCE_SEED_MANAGER_PASSWORD ?? 'dfence2026',
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

    await step('C', '8.1.7, 8.1.8', 'a daily dispatch list is proposed', async () => {
      const result = await call(manager, 'GET', '/api/ops/dispatch');
      if (result.status !== 200) {
        return `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
      }
      return Array.isArray(result.body.proposals) ? null : 'no proposals array';
    });

    await step('C', '5.3.1', 'the moderation queue is readable', async () => {
      const result = await call(manager, 'GET', '/api/ops/moderation');
      return result.status === 200 ? null : `expected 200, got ${result.status}`;
    });

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

            await step('D', '8.3.10', 'a completion with no photograph is refused', async () => {
              const result = await call(crew, 'POST', `/api/crew/work-orders/${workOrderId}/complete`, {
                notes: 'UAT — done, but with no evidence.',
                photoKeys: [],
              });
              return result.status >= 400
                ? null
                : `a completion with no photograph was accepted (${result.status})`;
            });

            const completed = await step('D', '8.3.6, 8.3.7', 'the crew member can record a completion', async () => {
              const result = await call(crew, 'POST', `/api/crew/work-orders/${workOrderId}/complete`, {
                notes: 'UAT — perimeter drains fogged.',
                photoKeys: ['uat-after.jpg'],
              });
              return result.status === 200
                ? null
                : `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`;
            });

            if (completed) {
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
