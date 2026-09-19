/**
 * D-Fence — photograph every screen, so the interface can be reviewed by looking at it.
 *
 *     npx tsx src/tools/screen-shots.ts                       # against localhost:3000
 *     npx tsx src/tools/screen-shots.ts -- --base https://…   # against the deployment
 *     npx tsx src/tools/screen-shots.ts -- --only ops         # only paths containing "ops"
 *
 * **Why this exists, when `demo-drive.ts` already takes screenshots.** `demo-drive` photographs the
 * *demonstration* — the fifteen or so screens the script walks through, at the moment the script
 * reaches them. §11.2 defines twenty-eight screens. The ones the demo never opens are the ones
 * nobody has looked at, and "nobody has looked at it" is the condition under which a screen quietly
 * becomes a bare list of paragraphs that satisfies every test and reads like a stack trace.
 *
 * So this walks `ROUTES` — the route table itself, not a hand-kept list beside it — and photographs
 * every entry at the viewport its role actually uses. A screen added to `routes.ts` is photographed
 * the next time this runs without anyone remembering to add it here. That is the whole design.
 *
 * It is **read-only except for one thing**: a crew account must exist to photograph the three crew
 * screens, so it creates one with a fixed address if it is not already there. Everything else is a
 * GET. It never submits a form, never raises a work order and never moderates a report — unlike
 * `demo-drive`, which is a rehearsal and writes as the demonstration writes.
 */
import { chromium, Browser, Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigLoader } from '../config/ConfigLoader';
import { ROUTES, RouteDefinition } from '../../client/src/app/routes';
import { Role } from '../entity/enums';
import { SESSION_KEY } from '../../client/src/lib/SessionPersistence';

const args = process.argv.slice(2);

function argument(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

const base = argument('base') ?? 'http://localhost:3000';
const only = argument('only');
const outDir = resolve(process.cwd(), argument('out') ?? 'screen-shots');

/** Fixed so the account is created once and reused, rather than accumulating one per run. */
const CREW_EMAIL = 'shots-crew@d-fence.local';
const CREW_PASSWORD = 'ShotsCrew2026!';

/**
 * Laptop for the manager, phone for everyone else — the two devices §11.8 designs for. A manager
 * screen photographed at 390px and a resident screen photographed at 1440px both look broken, and
 * neither finding would be about the screen.
 */
const LAPTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

type Shot = { screenId: string; path: string; url: string; role: string; file: string; note: string };
const shots: Shot[] = [];
const problems: string[] = [];

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${base}/signin`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForFunction(() => !window.location.pathname.startsWith('/signin'), null, {
    timeout: 20_000,
  });
}

/**
 * Ask the API from inside the signed-in page.
 *
 * Not `context.request`: 2.1.8's session is a bearer token in `localStorage`, not a cookie, so a
 * request issued beside the page carries no session and is answered 401 — which this tool read as
 * "no clusters exist" and photographed a dozen not-found screens over.
 */
async function api<T>(page: Page, path: string, init?: { method: string; body: unknown }): Promise<T | null> {
  try {
    return (await page.evaluate(
      async ([url, key, method, body]) => {
        const token = window.localStorage.getItem(key as string);
        const response = await fetch(url as string, {
          method: (method as string) || 'GET',
          headers: {
            'content-type': 'application/json',
            ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
          },
          ...(body === null ? {} : { body: JSON.stringify(body) }),
        });
        return response.ok ? ((await response.json()) as unknown) : null;
      },
      [`${base}${path}`, SESSION_KEY, init?.method ?? 'GET', init?.body ?? null] as const,
    )) as T | null;
  } catch {
    return null;
  }
}

/**
 * The first identifier in a list response, whatever the response calls its list and its key.
 *
 * Written tolerantly on purpose. This tool's job is to photograph screens, and a hard-coded
 * `body.rows[0].clusterId` that silently becomes `undefined` when a projection is renamed does not
 * fail — it photographs twelve "not found" screens and reports twelve successes. Walking for the
 * first UUID-shaped value under any of the likely keys degrades to a visible `none` instead.
 */
function firstId(body: unknown, keys: string[]): string {
  const seen = new Set<unknown>();
  const walk = (node: unknown): string | null => {
    if (node === null || typeof node !== 'object' || seen.has(node)) {
      return null;
    }
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item);
        if (found !== null) return found;
      }
      return null;
    }
    const record = node as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)) {
        return value;
      }
    }
    for (const value of Object.values(record)) {
      const found = walk(value);
      if (found !== null) return found;
    }
    return null;
  };
  return walk(body) ?? 'none';
}

/**
 * Photograph one route.
 *
 * `fullPage` deliberately: a screen whose content runs off the bottom is a finding, and a viewport
 * crop hides exactly that. The viewport height still decides what is above the fold, which is
 * recorded in the note rather than in the image.
 */
async function shoot(page: Page, route: RouteDefinition, url: string, role: string): Promise<void> {
  const file = `${role}-${route.screenId}.png`;
  let note = '';
  try {
    await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded' });
    // The shell restores the session before it routes; photographing during that window
    // photographs a splash screen and calls it the screen.
    await page
      .waitForFunction(() => !document.body.innerText.includes('Restoring your session'), null, { timeout: 20_000 })
      .catch(() => undefined);
    // Then wait for the screen to declare itself, and for whatever it loads to settle.
    await page.locator(`[data-screen]`).first().waitFor({ timeout: 20_000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(900);

    const shown = await page.locator('[data-screen]').first().getAttribute('data-screen').catch(() => null);
    if (shown !== null && shown !== route.screenId) {
      note = `showed ${shown}, not ${route.screenId}`;
      problems.push(`${route.screenId} (${url}): ${note}`);
    }
    await page.screenshot({ path: resolve(outDir, file), fullPage: true });
    shots.push({ screenId: route.screenId, path: route.path, url, role, file, note });
  } catch (error) {
    const why = error instanceof Error ? error.message.split('\n')[0] : String(error);
    problems.push(`${route.screenId} (${url}): ${why}`);
  }
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const config = ConfigLoader.load();
  const residentEmail = config.get('DFENCE_SEED_RESIDENT_EMAIL') || 'resident@d-fence.local';
  const residentPassword = config.get('DFENCE_SEED_RESIDENT_PASSWORD');
  const managerEmail = config.get('DFENCE_SEED_MANAGER_EMAIL');
  const managerPassword = config.get('DFENCE_SEED_MANAGER_PASSWORD');
  if (residentPassword === '' || managerEmail === '' || managerPassword === '') {
    console.error('Set DFENCE_SEED_* in src/.env before photographing the screens.');
    process.exitCode = 1;
    return;
  }

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (error) {
    console.error(`could not launch Edge: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  console.log(`D-Fence screen shots against ${base}\n  into ${outDir}\n`);

  try {
    const laptop = await browser.newContext({ viewport: LAPTOP, deviceScaleFactor: 1 });
    const phone = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    // ─── public screens, photographed with no session at all ───────────────────────────────
    const anonPhone = await phone.newPage();
    const anonLaptop = await laptop.newPage();
    for (const route of ROUTES.filter((r) => r.roles === null)) {
      const url = route.path.replace(':token', 'example-reset-token').replace(':id', 'none');
      if (only !== undefined && !route.path.includes(only)) {
        continue;
      }
      // Public screens are seen on both devices, and the landing page is the one most likely to be
      // opened on a phone and the one most likely to be demonstrated on a laptop.
      await shoot(anonPhone, route, url, 'public-phone');
      await shoot(anonLaptop, route, url, 'public-laptop');
    }

    // ─── resident ──────────────────────────────────────────────────────────────────────────
    const resident = await phone.newPage();
    await signIn(resident, residentEmail, residentPassword);
    const mine = await api<{ reports?: Array<{ id: string }> }>(resident, '/api/reports/mine');
    const reportId = mine?.reports?.[0]?.id ?? 'none';

    for (const route of ROUTES.filter((r) => r.roles?.includes(Role.Resident))) {
      if (only !== undefined && !route.path.includes(only)) {
        continue;
      }
      await shoot(resident, route, route.path.replace(':id', reportId), 'resident');
    }

    // ─── manager ───────────────────────────────────────────────────────────────────────────
    const manager = await laptop.newPage();
    await signIn(manager, managerEmail, managerPassword);

    const clusterId = firstId(await api<unknown>(manager, '/api/ops/priority'), ['clusterId', 'localityId', 'id']);
    const pendingId = firstId(await api<unknown>(manager, '/api/ops/moderation'), ['reportId', 'id']) ?? reportId;
    const workOrderId = firstId(await api<unknown>(manager, '/api/ops/work-orders'), ['workOrderId', 'id']) ?? 'none';
    console.log(`  ids: cluster ${clusterId}, pending report ${pendingId}, work order ${workOrderId}`);

    // The crew account, created only if it is not already there. This is the one write.
    const staff = await api<{ staff?: Array<{ email?: string }> }>(manager, '/api/ops/staff');
    const haveCrew = (staff?.staff ?? []).some((s) => s.email === CREW_EMAIL);
    if (!haveCrew) {
      const made = await api<{ accountId?: string }>(manager, '/api/ops/staff', {
        method: 'POST',
        body: { email: CREW_EMAIL, role: Role.CleaningCrew, password: CREW_PASSWORD },
      });
      console.log(`  crew account ${CREW_EMAIL}: ${made === null ? 'NOT created' : 'created'}`);
    }

    for (const route of ROUTES.filter((r) => r.roles?.includes(Role.OperationsManager))) {
      if (only !== undefined && !route.path.includes(only)) {
        continue;
      }
      let url = route.path;
      if (route.screenId === 'ClusterDetail') url = url.replace(':id', clusterId);
      else if (route.screenId === 'ReportReview' || route.screenId === 'Referral') url = url.replace(':id', pendingId);
      else if (route.screenId === 'WODetail') url = url.replace(':id', workOrderId);
      else if (route.screenId === 'WOCreate') url = `${url}?clusterId=${clusterId}`;
      await shoot(manager, route, url, 'manager');
    }

    // ─── crew ──────────────────────────────────────────────────────────────────────────────
    const crew = await phone.newPage();
    let crewJobId = 'none';
    try {
      await signIn(crew, CREW_EMAIL, CREW_PASSWORD);
      const jobs = await api<{ workOrders?: Array<{ id: string }> }>(crew, '/api/crew/work-orders');
      crewJobId = jobs?.workOrders?.[0]?.id ?? workOrderId;
      for (const route of ROUTES.filter((r) => r.roles?.includes(Role.CleaningCrew))) {
        if (only !== undefined && !route.path.includes(only)) {
          continue;
        }
        await shoot(crew, route, route.path.replace(':id', crewJobId), 'crew');
      }
    } catch (error) {
      problems.push(`crew screens: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    }

    // ─── the index ─────────────────────────────────────────────────────────────────────────
    const lines = [
      '# D-Fence screen shots',
      '',
      `Taken ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC against ${base}.`,
      `Manager at ${LAPTOP.width}x${LAPTOP.height}, resident and crew at ${PHONE.width}x${PHONE.height}.`,
      '',
      '| Screen | Requirement | Role | File | Note |',
      '| --- | --- | --- | --- | --- |',
      ...shots.map((s) => {
        const route = ROUTES.find((r) => r.screenId === s.screenId);
        return `| ${s.screenId} | ${route?.requirement ?? ''} | ${s.role} | ${s.file} | ${s.note} |`;
      }),
      '',
      problems.length === 0 ? 'No route failed to photograph.' : `## Could not photograph\n\n${problems.map((p) => `- ${p}`).join('\n')}`,
      '',
    ];
    writeFileSync(resolve(outDir, 'INDEX.md'), lines.join('\n'), 'utf8');

    console.log(`\n  ${shots.length} screen(s) photographed, ${problems.length} problem(s).`);
    for (const p of problems) {
      console.log(`  ! ${p}`);
    }
    console.log(`\n  index: ${resolve(outDir, 'INDEX.md')}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(`screen-shots failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
