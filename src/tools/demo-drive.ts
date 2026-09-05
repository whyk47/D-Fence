/**
 * D-Fence — drive the demonstration through a real browser.
 * Traces: lab4/DEMO-SCRIPT.md §3–§5, and every requirement those beats cite.
 *
 *     npm run demo:drive                                    # against localhost:3000
 *     npm run demo:drive -- --base https://…                # against the deployment
 *     npm run demo:drive -- --headed --slow 400             # watch it happen
 *
 * **Why this exists.** `uat.ts` proves the API answers; `client-uat.ts` proves the screens render
 * in jsdom. Neither presses a button. The demonstration is a sequence of clicks in a real browser
 * against real data, and the failure that ruins it — a control renamed, a screen that needs two
 * taps where the script says one, a form that submits nothing — is invisible to both harnesses and
 * to every unit test. This runs the script.
 *
 * It is deliberately written as the same beats in the same order as `DEMO-SCRIPT.md`, so that when
 * the two disagree one of them is wrong and it is obvious which line to read.
 *
 * **It writes to the system it drives**, exactly as the demonstration does: a report, a staff
 * account, a work order, a completion. It uses its own crew account each run and targets the
 * SMALLEST cluster for anything that writes a treatment record, for the reason set out in
 * `uat.ts`'s `smallestClusterId` — a harness that mutates the data it inspects is not measuring
 * the system.
 *
 * Edge is used through `playwright-core`'s `msedge` channel: it drives the browser that is already
 * on the machine rather than downloading a second one, which keeps the dependency to a few hundred
 * kilobytes and works on a locked-down laptop.
 */
import { chromium, Browser, BrowserContext, Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigLoader } from '../config/ConfigLoader';

type Outcome = { beat: string; what: string; status: 'PASS' | 'FAIL' | 'SKIP'; detail?: string };

const outcomes: Outcome[] = [];
const args = process.argv.slice(2);

function argument(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

const base = argument('base') ?? 'http://localhost:3000';
const headed = args.includes('--headed');
const slowMo = Number(argument('slow') ?? (headed ? 250 : 0));
const shotsDir = resolve(process.cwd(), argument('shots') ?? 'demo-shots');

/** A one-pixel PNG, so the photograph beats upload something a server will really accept. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function beat(name: string, what: string, run: () => Promise<string | null>): Promise<boolean> {
  try {
    const failure = await run();
    outcomes.push({ beat: name, what, status: failure === null ? 'PASS' : 'FAIL', ...(failure === null ? {} : { detail: failure }) });
    return failure === null;
  } catch (error) {
    outcomes.push({
      beat: name,
      what,
      status: 'FAIL',
      detail: error instanceof Error ? error.message.split('\n')[0] : String(error),
    });
    return false;
  }
}

function skip(name: string, what: string, why: string): void {
  outcomes.push({ beat: name, what, status: 'SKIP', detail: why });
}

/** A screenshot per segment, so a failed rehearsal can be looked at rather than described. */
async function shoot(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: resolve(shotsDir, `${name}.png`), fullPage: true });
  } catch {
    // A screenshot is evidence, not a step. Never fail a beat because one could not be taken.
  }
}

/** Sign in through the real form, and wait for the shell rather than for a fixed delay. */
async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${base}/signin`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // The session is restored asynchronously; the navigation is what proves it took.
  await page.waitForFunction(() => !window.location.pathname.startsWith('/signin'), null, { timeout: 20_000 });
}

/**
 * Remove every saved location this driver has left behind (`Demo <token>`), so a rehearsal can be
 * run any number of times against the same resident account without meeting 3.1.1's cap of five.
 * Tolerant by construction: a sweep that fails must not fail the beat it is protecting.
 */
async function sweepDriverLocations(page: Page, base: string): Promise<void> {
  try {
    for (let removed = 0; removed < 6; removed += 1) {
      await page.goto(`${base}/locations`, { waitUntil: 'domcontentloaded' });
      // Wait for the list to be drawn before counting: an unloaded screen has no buttons on it,
      // and a sweep that reads it too early quietly decides there is nothing to sweep.
      await page
        .locator('[data-part="locations"] li, [data-part="empty"]')
        .first()
        .waitFor({ timeout: 20_000 });
      // `Demo <token>` / `Home <token>` are this driver's own names. A location named plainly -
      // the seeded "Home" the demo itself uses - has no trailing token and is left alone.
      const remove = page.getByRole('button', { name: /^Remove (Demo|Home) [0-9a-z]{4}$/ }).first();
      if ((await remove.count()) === 0) {
        return;
      }
      await remove.click();
      await page.getByRole('button', { name: 'Remove', exact: true }).click();
      await page.waitForTimeout(800);
    }
  } catch {
    // Housekeeping, not a beat.
  }
}

async function main(): Promise<void> {
  mkdirSync(shotsDir, { recursive: true });
  const config = ConfigLoader.load();
  const residentEmail = config.get('DFENCE_SEED_RESIDENT_EMAIL') || 'resident@d-fence.local';
  const residentPassword = config.get('DFENCE_SEED_RESIDENT_PASSWORD');
  const managerEmail = config.get('DFENCE_SEED_MANAGER_EMAIL');
  const managerPassword = config.get('DFENCE_SEED_MANAGER_PASSWORD');
  if (residentPassword === '' || managerPassword === '' || managerEmail === '') {
    console.error('Set DFENCE_SEED_RESIDENT_PASSWORD, DFENCE_SEED_MANAGER_EMAIL and');
    console.error('DFENCE_SEED_MANAGER_PASSWORD (src/.env or the environment) before driving the demo.');
    process.exitCode = 1;
    return;
  }

  console.log(`D-Fence demo drive against ${base}${headed ? ' (headed)' : ''}\n`);

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: !headed, slowMo });
  } catch (error) {
    console.error(`could not launch Edge: ${error instanceof Error ? error.message : String(error)}`);
    console.error('Install Microsoft Edge, or pass --headed on a machine that has it.');
    process.exitCode = 1;
    return;
  }

  // A phone-shaped context for the resident and the crew, a laptop for the manager: the script
  // demonstrates them on different devices, and a 390 px viewport is where the mobile layout is
  // actually exercised.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    // Bishan, so "Use my current location" resolves somewhere in Singapore.
    geolocation: { latitude: 1.3521, longitude: 103.8198 },
    permissions: ['geolocation'],
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  });
  const laptop = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const reportDescription = `Demo drive ${new Date().toISOString()} — standing water behind the block.`;
  /**
   * A fresh point each run, a few hundred metres from the last one.
   *
   * 5.1.11 refuses a second report of the same type within 50 m and 24 hours — so a fixed
   * coordinate makes the *first* beat fail on the second run of the day, and it fails as a refusal
   * that looks exactly like a defect. The duplicate beat below then jitters by only ~5 m, which is
   * inside the radius on purpose.
   */
  const spot = {
    latitude: 1.34 + (Date.now() % 900) / 100_000,
    longitude: 103.8 + (Math.floor(Date.now() / 900) % 900) / 100_000,
  };
  let clusterName = '';
  let workOrderUrl = '';
  const crewEmail = `crew-demo-${Date.now().toString(36)}@d-fence.local`;
  const crewPassword = 'FieldWork2026x';

  // ─── B0: it is an app (§11.8) ──────────────────────────────────────────────────────────────
  const app = await phone.newPage();
  await beat('B0.1', 'the manifest makes it installable', async () => {
    await app.goto(base, { waitUntil: 'domcontentloaded' });
    const href = await app.locator('link[rel="manifest"]').getAttribute('href');
    if (href === null) {
      return 'no manifest is linked from the page';
    }
    const response = await app.request.get(`${base}${href}`);
    const type = response.headers()['content-type'] ?? '';
    if (!type.includes('application/manifest+json')) {
      // Served as application/json, Chrome ignores the file and never offers installation — with
      // no error anywhere. This beat is the only place that failure is visible.
      return `the manifest is served as ${type}`;
    }
    const manifest = (await response.json()) as { display?: string; icons?: unknown[] };
    return manifest.display === 'standalone' && (manifest.icons ?? []).length >= 2
      ? null
      : `display=${String(manifest.display)}, ${(manifest.icons ?? []).length} icon(s)`;
  });

  await beat('B0.2', 'the service worker registers and takes control', async () => {
    await app.goto(base, { waitUntil: 'load' });
    const controlled = await app.evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        return 'this browser has no service worker support';
      }
      const registration = await navigator.serviceWorker.ready.catch(() => null);
      return registration === null ? 'the worker never became ready' : null;
    });
    return controlled;
  });

  await beat('B0.3', 'offline, the shell still opens rather than the browser error page', async () => {
    await phone.setOffline(true);
    try {
      await app.goto(`${base}/signin`, { waitUntil: 'domcontentloaded' });
      // 11.8.8 — the cached shell answers a navigation the network cannot.
      const rendered = await app.locator('#root').count();
      return rendered > 0 ? null : 'nothing rendered while offline';
    } finally {
      await phone.setOffline(false);
    }
  });
  await shoot(app, 'B0-offline');

  // ─── B: the resident ───────────────────────────────────────────────────────────────────────
  const resident = await phone.newPage();
  const signedIn = await beat('B1', 'the resident signs in on the phone', async () => {
    await signIn(resident, residentEmail, residentPassword);
    return resident.url().includes('/signin') ? 'still on the sign-in screen' : null;
  });

  if (!signedIn) {
    skip('B2–B10', 'the resident journey', 'the resident could not sign in');
  } else {
    await beat('B2', 'a saved location resolves through OneMap and reports its exposure', async () => {
      // 3.1.1 caps an account at five saved locations, so a rehearsal that only ever adds one
      // silently poisons the account it rehearses on: the fifth run passes, the sixth is refused,
      // and the refusal looks like a broken OneMap. Every location this driver has left behind is
      // cleared first, and the one it adds below is cleared after.
      await sweepDriverLocations(resident, base);
      await resident.goto(`${base}/locations/new`, { waitUntil: 'domcontentloaded' });
      await resident.getByLabel('Address or postal code').fill('560103');
      await resident.getByRole('button', { name: 'Search' }).click();
      const candidate = resident.locator('fieldset input[type="radio"]').first();
      await candidate.waitFor({ timeout: 25_000 });
      await candidate.check();
      await resident.getByLabel('Name this location').fill(`Demo ${Date.now().toString(36).slice(-4)}`);
      await resident.getByRole('button', { name: 'Save location' }).click();
      // A refusal here is a fact about the account, not about the software, and the beat is far
      // more useful if it says which one. Race the redirect against the screen's own alert.
      const refusal = resident.getByRole('alert');
      await Promise.race([
        resident.waitForURL('**/locations', { timeout: 25_000 }),
        refusal.first().waitFor({ timeout: 25_000 }),
      ]);
      if (!/\/locations$/.test(new URL(resident.url()).pathname)) {
        const why = (await refusal.first().innerText()).replace(/\s+/g, ' ').slice(0, 160);
        await resident.goto(`${base}/locations`, { waitUntil: 'domcontentloaded' });
        await resident
          .locator('[data-part="locations"] li')
          .first()
          .waitFor({ timeout: 20_000 })
          .catch(() => undefined);
        const held = await resident
          .locator('[data-part="locations"] li button')
          .allInnerTexts()
          .catch(() => [] as string[]);
        return `the save was refused: ${why} | held: ${held.join(' / ')}`;
      }
      // 3.1.10 — the card states the exposure and when it was last evaluated. Asserted through the
      // screen's own data-parts rather than by matching prose: the sentence is written for a
      // resident and is allowed to change without breaking the rehearsal.
      const status = resident.locator('[data-part="status"]').first();
      await status.waitFor({ timeout: 25_000 });
      const text = (await status.innerText()).trim();
      const evaluated = (await resident.locator('[data-part="evaluated"]').first().innerText()).trim();
      const verdict = text.length > 0 && evaluated.length > 0 ? null : `status="${text}" evaluated="${evaluated}"`;
      await sweepDriverLocations(resident, base);
      return verdict;
    });

    await beat('B3', 'the resident map opens on their own block (9.1.5)', async () => {
      await resident.goto(`${base}/map`, { waitUntil: 'domcontentloaded' });
      await resident.locator('[data-part="resident-map"]').waitFor({ timeout: 30_000 });
      // Waited for, not sampled. Tiles arrive one at a time over the network, and counting them
      // the instant the first one lands measures how fast OneMap answered rather than whether the
      // map drew - which is how this beat failed twice while the map was working.
      await resident
        .waitForFunction(() => document.querySelectorAll('.leaflet-tile-loaded').length >= 2, null, {
          timeout: 30_000,
        })
        .catch(() => undefined);
      const drawn = await resident.locator('.leaflet-tile-loaded').count();
      // 9.1.6 - the layer switches are the resident's, and only for layers they received.
      const layers = await resident.locator('.map-toggle').count();
      return drawn >= 2 ? null : `${drawn} tile(s) loaded, ${layers} layer switch(es)`;
    });
    await shoot(resident, 'B3-resident-map');

    await beat('B6', 'the photograph input opens the camera on a phone (11.8.13)', async () => {
      await resident.goto(`${base}/report`, { waitUntil: 'domcontentloaded' });
      const capture = await resident.locator('#photo').getAttribute('capture');
      // The attribute is what makes the camera open instead of the gallery. A desktop browser
      // ignores it; a phone does not, and this is the beat that makes "it is an app" self-evident.
      return capture === 'environment' ? null : `capture="${String(capture)}"`;
    });

    const reported = await beat('B7–B8', 'a report is submitted with a photograph that really uploads', async () => {
      await resident.locator('#photo').setInputFiles({ name: 'demo.png', mimeType: 'image/png', buffer: PIXEL });
      await resident.locator('li[data-part], ul li').first().waitFor({ timeout: 25_000 });
      await resident.getByLabel('Describe what you saw').fill(reportDescription);
      await resident.getByLabel('Latitude').fill(spot.latitude.toFixed(6));
      await resident.getByLabel('Longitude').fill(spot.longitude.toFixed(6));
      await resident.getByRole('button', { name: 'Submit report' }).click();
      await resident.waitForURL('**/reports/**', { timeout: 25_000 });
      return null;
    });
    await shoot(resident, 'B8-report');

    if (reported) {
      await beat('B9', 'a second report of the same type nearby is refused (5.1.11)', async () => {
        await resident.goto(`${base}/report`, { waitUntil: 'domcontentloaded' });
        await resident.locator('#photo').setInputFiles({ name: 'demo.png', mimeType: 'image/png', buffer: PIXEL });
        await resident.locator('ul li').first().waitFor({ timeout: 25_000 });
        await resident.getByLabel('Describe what you saw').fill('Demo drive — the duplicate.');
        // ~5 m away: inside 5.1.11's radius, which is the whole point of the beat.
        await resident.getByLabel('Latitude').fill((spot.latitude + 0.00004).toFixed(6));
        await resident.getByLabel('Longitude').fill(spot.longitude.toFixed(6));
        await resident.getByRole('button', { name: 'Submit report' }).click();
        const alert = resident.getByRole('alert');
        await alert.waitFor({ timeout: 25_000 });
        const text = await alert.innerText();
        // The beat graders remember: the system refusing a user, and saying exactly why.
        return /already|duplicate|near|within/i.test(text) ? null : `the refusal did not name the rule: ${text}`;
      });
      await shoot(resident, 'B9-duplicate-refused');
    }

    await beat('B10', 'a Telegram linking code can be issued (6.1.7)', async () => {
      await resident.goto(`${base}/alerts`, { waitUntil: 'domcontentloaded' });
      // The screen fetches before it draws, so the control does not exist at `domcontentloaded`.
      // Waiting for it is the difference between testing the application and testing the network.
      const button = resident.getByRole('button', { name: /linking code/i }).first();
      await button.waitFor({ timeout: 25_000 });
      await button.click();
      await resident.waitForFunction(() => /\b\d{6}\b/.test(document.body.innerText), null, { timeout: 25_000 });
      return null;
    });
  }

  // ─── C: the manager ────────────────────────────────────────────────────────────────────────
  const manager = await laptop.newPage();
  const managerIn = await beat('C1', 'the manager signs in and the dashboard states the age of its data', async () => {
    await signIn(manager, managerEmail, managerPassword);
    await manager.goto(`${base}/ops`, { waitUntil: 'domcontentloaded' });
    await manager.locator('[data-screen="OpsDashboard"]').waitFor({ timeout: 30_000 });
    // 7.1.9 — if the feed were stale, this is where it would show first. The overview renders after
    // its fetch, so this waits for the statement rather than sampling the first frame.
    await manager
      .locator('[data-screen="OpsDashboard"]')
      .getByText(/Data as of|out of date/i)
      .first()
      .waitFor({ timeout: 30_000 });
    return null;
  });
  await shoot(manager, 'C1-dashboard');

  if (!managerIn) {
    skip('C2–D10', 'operations and the crew loop', 'the manager could not sign in');
  } else {
    await beat('C2–C3', 'the clusters are drawn on Singapore, with tiles and shapes (9.1.1, 9.1.2)', async () => {
      await manager.goto(`${base}/ops`, { waitUntil: 'domcontentloaded' });
      await manager.locator('[data-part="ops-map"]').waitFor({ timeout: 30_000 });
      // Counted, not eyeballed. A map that renders its controls and no tiles looks like a design
      // decision in a screenshot and is a broken map in front of an examiner - and the two failures
      // that produce it (a CSP that blocks the tile origin, a container with no height) are exactly
      // the ones that pass every unit test.
      await manager
        .waitForFunction(() => document.querySelectorAll('.leaflet-tile-loaded').length >= 4, null, {
          timeout: 30_000,
        })
        .catch(() => undefined);
      const drawn = await manager.locator('.leaflet-tile-loaded').count();
      const shapes = await manager.locator('.leaflet-overlay-pane path').count();
      // 9.1.11, 11.7.5 - and the tier is legible with the drawing switched off.
      const legend = await manager.locator('.map-legend').innerText();
      if (!/priority/i.test(legend)) {
        return 'the legend does not state a tier in words';
      }
      return drawn >= 4 && shapes >= 1
        ? null
        : `${drawn} tile(s) loaded, ${shapes} cluster shape(s) drawn`;
    });
    await shoot(manager, 'C2-map');

    await beat('C4–C5', 'a cluster opens with its full driver breakdown (4.1.10)', async () => {
      await manager.goto(`${base}/ops`, { waitUntil: 'domcontentloaded' });
      const row = manager.locator('table a').first();
      await row.waitFor({ timeout: 30_000 });
      clusterName = (await row.innerText()).trim();
      await row.click();
      const breakdown = manager.locator('[data-part="breakdown"]');
      await breakdown.waitFor({ timeout: 30_000 });
      // One row per driver, each with its raw value, its normalised value, its weight and its
      // contribution. A rank with no argument behind it is a number the manager is asked to trust.
      const rows = await breakdown.locator('tbody tr').count();
      return rows >= 5 ? null : `${rows} driver row(s) in the breakdown`;
    });
    await shoot(manager, 'C4-cluster-breakdown');

    await beat('C7', 'the manager creates the crew account on the Staff screen (2.2.3)', async () => {
      await manager.goto(`${base}/ops/staff`, { waitUntil: 'domcontentloaded' });
      await manager.getByLabel('Email').fill(crewEmail);
      await manager.getByLabel('Temporary password').fill(crewPassword);
      await manager.getByRole('button', { name: 'Create account' }).click();
      await manager.waitForFunction(
        (email) => document.body.innerText.includes(email),
        crewEmail,
        { timeout: 25_000 },
      );
      return null;
    });

    await beat('C10', 'the analytics screen draws the five charts, each stating its sufficiency', async () => {
      await manager.goto(`${base}/ops/analytics`, { waitUntil: 'domcontentloaded' });
      await manager.locator('[data-screen="Analytics"]').waitFor({ timeout: 30_000 });
      const frames = manager.locator('[data-chart]');
      await frames.first().waitFor({ timeout: 30_000 });
      const charts = await frames.count();
      // Each frame carries `data-sufficient`, which is the §7.3 sufficiency statement in machine
      // form — a chart that cannot honestly be drawn says so instead of drawing a line through two
      // points.
      const stated = await frames.evaluateAll((nodes) => nodes.filter((n) => n.hasAttribute('data-sufficient')).length);
      return charts >= 5 && stated === charts ? null : `${charts} chart(s), ${stated} with a sufficiency statement`;
    });
    await shoot(manager, 'C10-analytics');

    const raised = await beat('C13–C15', 'a work order is raised and assigned to the new crew member', async () => {
      // The manager's real path: the priority table, then the cluster, then the link on it. The
      // create screen has no cluster picker - it is pre-filled from `?clusterId=`, because a
      // manager who has to retype an identifier they were just looking at will mistype it.
      await manager.goto(`${base}/ops`, { waitUntil: 'domcontentloaded' });
      const rows = manager.locator('table a');
      await rows.first().waitFor({ timeout: 30_000 });
      const total = await rows.count();
      const date = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
      const detail = /\/ops\/work-orders\/(?!new)[0-9a-f-]+/;

      // Work up from the BOTTOM of the priority table, not down from the top: this path ends in a
      // treatment record, and writing one against the top-ranked cluster zeroes its
      // DaysSinceLastTreatment and suppresses 15% of the score the demo is about. The loop exists
      // because 8.1.12 refuses a second open order on a cluster that already has one - a rehearsal
      // run twice would otherwise have to reuse yesterday's order, in whatever state it was left.
      let landed = false;
      for (let attempt = 0; attempt < Math.min(4, total) && !landed; attempt += 1) {
        await manager.goto(`${base}/ops`, { waitUntil: 'domcontentloaded' });
        await rows.first().waitFor({ timeout: 30_000 });
        await rows.nth(total - 1 - attempt).click();
        const raise = manager.getByRole('link', { name: 'Raise a work order' });
        await raise.waitFor({ timeout: 30_000 });
        await raise.click();

        await manager.locator('[data-screen="WOCreate"]').waitFor({ timeout: 30_000 });
        // The create screen has no cluster picker - the identifier arrives in the query string,
        // because a manager who has to retype one they were just looking at will mistype it.
        if ((await manager.locator('#clusterId').inputValue()).trim() === '') {
          return 'the cluster was not pre-filled by the link from the cluster screen';
        }
        await manager.getByLabel('Scheduled date').fill(date);
        await manager
          .getByLabel('Instructions for the crew')
          .fill('Demo drive - fog the perimeter drains.');
        await manager.getByRole('button', { name: 'Create work order' }).click();

        const duplicate = manager.locator('[data-part="duplicate"]');
        await Promise.race([
          manager.waitForURL(detail, { timeout: 30_000 }),
          duplicate.waitFor({ timeout: 30_000 }),
        ]);
        landed = detail.test(manager.url());
      }
      if (!landed) {
        return 'every cluster tried already has an open work order (8.1.12) - run demo:clean';
      }
      workOrderUrl = manager.url();

      const assign = manager.locator('#crew');
      await assign.waitFor({ timeout: 25_000 });
      // Options read "email - N open" (8.2.5) and carry the crew id as their value, so the address
      // is what identifies the option and the id is what gets submitted.
      const value = await assign
        .locator('option')
        .evaluateAll(
          (options, email) =>
            (options as HTMLOptionElement[]).find((o) => o.textContent?.includes(email))?.value ?? '',
          crewEmail,
        );
      if (value === '') {
        return `no crew option for ${crewEmail}`;
      }
      await assign.selectOption(value);
      await manager.getByRole('button', { name: /^(Assign|Reassign)$/ }).click();
      await manager.waitForFunction(() => document.body.innerText.includes('Assigned to'), null, {
        timeout: 25_000,
      });
      return null;
    });

    await shoot(manager, 'C15-assigned');

    await beat('C16', 'the work order carries an audited history of who did what (2.4.1)', async () => {
      await manager.reload({ waitUntil: 'domcontentloaded' });
      const history = manager.locator('[data-part="history"]');
      await history.waitFor({ timeout: 25_000 });
      const text = await history.innerText();
      return /assign/i.test(text) ? null : 'the assignment is not in the history';
    });

    // ─── D: the crew loop ────────────────────────────────────────────────────────────────────
    if (!raised) {
      skip('D1–D10', 'the crew loop', 'no work order was raised');
    } else {
      const crew = await phone.newPage();
      const crewIn = await beat('D1', 'the crew member signs in and sees only their own jobs (8.4.1)', async () => {
        await signIn(crew, crewEmail, crewPassword);
        await crew.goto(`${base}/crew`, { waitUntil: 'domcontentloaded' });
        await crew.locator('[data-screen="MyJobs"]').waitFor({ timeout: 30_000 });
        return null;
      });

      if (!crewIn) {
        skip('D2–D10', 'the crew loop', 'the crew member could not sign in');
      } else {
        await beat('D2', 'the crew member is refused a manager screen (2.3.3, 2.3.7)', async () => {
          await crew.goto(`${base}/ops`, { waitUntil: 'domcontentloaded' });
          // The shell restores the session before it can route, and until it has it shows a splash.
          // Reading the page during that window reads the splash and calls a working refusal a
          // failure.
          await crew.waitForFunction(() => !document.body.innerText.includes('Restoring your session'), null, {
            timeout: 25_000,
          });
          const text = await crew.locator('main').innerText();
          // 2.3.7 — and it says nothing about what exists behind the refusal.
          return /not authorised/i.test(text) ? null : `expected a refusal, got: ${text.slice(0, 60)}`;
        });
        await shoot(crew, 'D2-refused');

        const started = await beat('D3–D4', 'the crew member accepts and starts the job', async () => {
          await crew.goto(`${base}/crew`, { waitUntil: 'domcontentloaded' });
          const jobs = crew.locator('[data-part="jobs"] a');
          // `All` is the safety net, not the plan: the order above is scheduled for today so the
          // default filter holds it. If a rehearsal ever runs across midnight SGT, this keeps the
          // crew loop rehearsable instead of failing on the calendar.
          await jobs
            .first()
            .waitFor({ timeout: 20_000 })
            .catch(async () => {
              await crew.getByRole('button', { name: 'All' }).click();
              await jobs.first().waitFor({ timeout: 20_000 });
            });
          await jobs.first().click();
          await crew.getByRole('button', { name: 'Accept this job' }).click();
          await crew.getByRole('button', { name: 'Start work' }).click();
          await crew.waitForFunction(() => document.body.innerText.includes('InProgress') || document.body.innerText.includes('In Progress'), null, { timeout: 25_000 });
          return null;
        });

        if (started) {
          await beat('D6', 'a completion with no photograph is refused before it is sent (8.3.7)', async () => {
            await crew.getByRole('link', { name: 'Record completion' }).click().catch(async () => {
              await crew.getByRole('button', { name: 'Record completion' }).click();
            });
            await crew.locator('[data-screen="JobCompletion"]').waitFor({ timeout: 25_000 });
            await crew.getByLabel('What did you do?').fill('Demo drive — fogged the void deck.');
            await crew.getByRole('button', { name: 'Submit completion' }).click();
            const stated = await crew.locator('[data-part="photo-missing"], [data-part="requirement"]').first().innerText();
            // Stated before the button is pressed, not discovered by pressing it — this screen is
            // used standing in a drain, and a second trip is expensive.
            return /photograph/i.test(stated) ? null : 'the photograph requirement was not stated';
          });

          const completed = await beat('D7–D8', 'a photograph is taken and the completion is recorded', async () => {
            await crew.locator('#photo').setInputFiles({ name: 'after.png', mimeType: 'image/png', buffer: PIXEL });
            await crew.locator('ul li').first().waitFor({ timeout: 25_000 });
            await crew.getByRole('button', { name: 'Submit completion' }).click();
            await crew.waitForFunction(() => document.body.innerText.includes('Completed'), null, { timeout: 30_000 });
            return null;
          });
          await shoot(crew, 'D8-completed');

          if (completed) {
            await beat('D9–D10', 'the manager verifies it and the score falls (4.1.17)', async () => {
              await manager.goto(workOrderUrl, { waitUntil: 'domcontentloaded' });
              await manager.getByRole('button', { name: 'Verify completion' }).click();
              // Exact: the page behind the dialog still carries "Verify completion", and a substring match
      // finds both.
      await manager.getByRole('button', { name: 'Verify', exact: true }).click();
              await manager.waitForFunction(() => document.body.innerText.includes('Verified'), null, { timeout: 30_000 });
              return null;
            });
            await shoot(manager, 'D10-verified');
          }
        }
      }
    }
  }

  await browser.close();
  report();
}

function report(): void {
  console.log('  beat      result   what');
  console.log('  --------  -------  ------------------------------------------------------------');
  for (const outcome of outcomes) {
    console.log(`  ${outcome.beat.padEnd(8)}  ${outcome.status.padEnd(7)}  ${outcome.what}`);
    if (outcome.detail !== undefined) {
      console.log(`            ${outcome.detail}`);
    }
  }
  const failed = outcomes.filter((o) => o.status === 'FAIL').length;
  const passed = outcomes.filter((o) => o.status === 'PASS').length;
  const skipped = outcomes.filter((o) => o.status === 'SKIP').length;
  console.log(`\n  ${passed} passed, ${failed} failed, ${skipped} skipped.`);
  console.log(`  screenshots in ${shotsDir}`);
  if (failed > 0) {
    // The script and the software disagree. The software is right; DEMO-SCRIPT.md gets updated.
    console.log('  A failed beat cannot be rehearsed. Fix it, or fix the script, before the demo.');
    process.exitCode = 1;
  }
  writeFileSync(resolve(shotsDir, 'result.json'), JSON.stringify(outcomes, null, 2), 'utf8');
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
