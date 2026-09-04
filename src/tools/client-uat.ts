/**
 * D-Fence — user acceptance test for the CLIENT, driven through the real bundle.
 *
 *     npm run serve                              # in one terminal
 *     npm run uat:client -- --base http://localhost:3000
 *
 * **Why this exists.** `uat.ts` drives the HTTP API and never opens a page; the screen tests render
 * components with a stubbed client and never touch a server. Both passed on the morning the landing
 * page shipped reading `sources[].name` from an endpoint that returns `attributions[].source` — it
 * rendered an empty credits list, silently failing 10.4.5 on the only screen an anonymous visitor
 * sees. Neither layer could catch it, because the defect lived exactly between them.
 *
 * This layer loads `index.html` and the **served** `app.js` — the same bytes a browser gets — into
 * jsdom, points its `fetch` at the running server, and drives the application the way a person
 * would: clicking links, filling fields, pressing buttons, and reading what appears.
 *
 * **jsdom is not a browser**, and the difference is stated rather than glossed over: no layout, no
 * paint, no real event loop for CSS transitions. What it does give is the real bundle executing the
 * real React tree against the real API, which is the seam that was untested. Anything about
 * appearance — contrast, tap-target size, legibility in sun (11.7.x) — still needs human eyes.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
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
  screen: string;
  requirement: string;
  what: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
}

const outcomes: Outcome[] = [];

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

const base = argument('base') ?? 'http://localhost:3000';

/** Anchors that would cause a real page load. Not a failure - see the note in `boot`. */
let fullPageLoads = 0;

async function step(
  screen: string,
  requirement: string,
  what: string,
  check: () => Promise<string | null>,
): Promise<boolean> {
  try {
    const failure = await check();
    outcomes.push({ screen, requirement, what, status: failure === null ? 'PASS' : 'FAIL', detail: failure ?? '' });
    return failure === null;
  } catch (error) {
    outcomes.push({
      screen,
      requirement,
      what,
      status: 'FAIL',
      detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
    return false;
  }
}

function skip(screen: string, requirement: string, what: string, why: string): void {
  outcomes.push({ screen, requirement, what, status: 'SKIP', detail: why });
}

/**
 * Boot the application at a URL, and hand back the window once React has rendered something.
 *
 * A fresh jsdom per screen rather than one navigated instance: the client holds its session in
 * memory (2.1.8), so reusing a window would let one check inherit another's sign-in and quietly
 * stop testing the guard at all.
 */
async function boot(path: string): Promise<JSDOM> {
  const html = await (await fetch(`${base}/`)).text();
  const script = await (await fetch(`${base}/app.js`)).text();

  // jsdom cannot perform a real navigation, and says so loudly every time a plain `<a href>` is
  // clicked - the brand link and the "back to the start" link on the refusal screens are both
  // ordinary anchors, which is correct: a full page load there is fine. Those errors are counted
  // and reported as a line, not printed sixty times over the results.
  const console_ = new VirtualConsole();
  console_.on('jsdomError', (error: Error) => {
    if (/Not implemented: navigation/.test(error.message)) {
      fullPageLoads += 1;
      return;
    }
    // Anything else is a real error inside the bundle and must not be swallowed.
    process.stderr.write(`  [page error] ${error.message}\n`);
  });

  const dom = new JSDOM(html, {
    url: `${base}${path}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: console_,
  });

  // jsdom has no fetch. Give the window Node's, with relative paths resolved against the server —
  // which is precisely what a browser does, and what makes `api.get('/api/...')` reach the real
  // thing rather than a stub.
  const win = dom.window as unknown as Record<string, unknown>;
  win.fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    fetch(new URL(typeof input === 'string' ? input : String(input), base), init);

  dom.window.eval(script);
  await settle(dom);
  return dom;
}

/**
 * Let React flush and any first fetch resolve.
 *
 * Polls for content rather than sleeping a fixed time: a fixed wait is either too short on a slow
 * network — making a working screen look broken — or too long on every run.
 */
async function settle(
  dom: JSDOM,
  until: (dom: JSDOM) => boolean = hasContent,
  /** Three seconds suits a screen load. A manual ingestion run fetches three public APIs and
   *  legitimately takes longer, so it says so rather than being declared broken at three. */
  timeoutMs = 3_000,
): Promise<void> {
  for (let attempt = 0; attempt < timeoutMs / 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (until(dom)) {
      return;
    }
  }
}

function hasContent(dom: JSDOM): boolean {
  const main = dom.window.document.querySelector('main');
  return main !== null && (main.textContent ?? '').trim().length > 0;
}

function text(dom: JSDOM): string {
  return dom.window.document.body.textContent ?? '';
}

function screenOf(dom: JSDOM): string {
  return dom.window.document.querySelector('[data-screen]')?.getAttribute('data-screen') ?? '(none)';
}

/** Click something by its visible text, the way a person finds it. */
function clickText(dom: JSDOM, selector: string, label: string): boolean {
  const found = [...dom.window.document.querySelectorAll(selector)].find((el) =>
    (el.textContent ?? '').toLowerCase().includes(label.toLowerCase()),
  );
  if (found === undefined) {
    return false;
  }
  (found as HTMLElement).click();
  return true;
}

/** Type into a field found by its label, which is the only way a real user finds one (11.7.2). */
function fill(dom: JSDOM, labelText: string, value: string): boolean {
  const doc = dom.window.document;
  const label = [...doc.querySelectorAll('label')].find((l) =>
    (l.textContent ?? '').toLowerCase().includes(labelText.toLowerCase()),
  );
  const id = label?.getAttribute('for');
  const field = id === null || id === undefined ? null : doc.getElementById(id);
  if (field === null) {
    return false;
  }
  const input = field as HTMLInputElement;
  // React tracks the value on the DOM node, so assigning `.value` directly is ignored by the
  // synthetic event system. This is the documented way to drive a controlled input from outside.
  const proto = Object.getPrototypeOf(input) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  return true;
}

async function main(): Promise<void> {
  console.log(`D-Fence client UAT against ${base}\n`);

  // --- The landing screen: the only thing an anonymous visitor sees ---------------------------
  const landing = await step('Landing', '11.2.1, 10.4.5', 'the landing screen renders and credits its sources', async () => {
    const dom = await boot('/');
    const body = text(dom);
    if (!body.includes('D-Fence')) {
      return `the shell did not render; the page reads: ${body.slice(0, 120)}`;
    }
    // The exact defect this layer exists for: the credits list rendered empty because the screen
    // and the endpoint disagreed about the shape, and every other test agreed with itself.
    const credits = dom.window.document.querySelectorAll('[data-part="attribution"] li').length;
    if (credits === 0) {
      return 'the data credits list is empty (10.4.5) — the screen and /api/attribution disagree';
    }
    return body.includes('National Environment Agency')
      ? null
      : 'the credits do not name the National Environment Agency';
  });

  if (!landing) {
    report();
    return;
  }

  await step('Landing', '11.1.9', 'a signed-out visitor is offered sign in, not staff navigation', async () => {
    const dom = await boot('/');
    const body = text(dom);
    // 11.1.9 — the public shell shows no role navigation. A nav item leading somewhere the visitor
    // cannot go is a dead end the dialog map does not draw.
    if (/Operations|Moderation|Work orders|My jobs/.test(body)) {
      return 'the signed-out shell offers staff navigation';
    }
    return /sign in/i.test(body) ? null : 'no way to sign in is offered';
  });

  await step('SignIn', '11.1.10, 2.3.7', 'a protected URL sends a signed-out visitor to sign in', async () => {
    const dom = await boot('/ops');
    await settle(dom, (d) => d.window.location.pathname !== '/ops');
    const where = dom.window.location.pathname;
    if (where !== '/signin') {
      return `expected a redirect to /signin, the URL is ${where} showing ${screenOf(dom)}`;
    }
    // 11.1.10 — and it must remember where they were going, or sign-in lands them somewhere else.
    return dom.window.location.search.includes('returnTo')
      ? null
      : 'the redirect carries no returnTo, so the visitor loses their place';
  });

  await step('NotFound', '11.2.25', 'an unknown URL renders Not Found, not a blank page', async () => {
    const dom = await boot('/no-such-screen');
    const screen = screenOf(dom);
    return screen === 'NotFound' ? null : `the screen is ${screen} and the page reads: ${text(dom).slice(0, 100)}`;
  });

  // --- Signing in, as a real person would ------------------------------------------------------
  const { email, password } = seedManager();

  const signedIn = await step('SignIn', '11.2.3, 2.1.6', 'a manager can sign in through the form', async () => {
    const dom = await boot('/signin');
    if (!fill(dom, 'email', email)) {
      return 'no field labelled "email" — 11.7.2 requires a real label, and so does a person';
    }
    if (!fill(dom, 'password', password)) {
      return 'no field labelled "password"';
    }
    if (!clickText(dom, 'button', 'sign in')) {
      return 'no button reading "Sign in"';
    }
    await settle(dom, (d) => d.window.location.pathname !== '/signin');
    const where = dom.window.location.pathname;
    if (where === '/signin') {
      return `still on the sign-in screen; it reads: ${text(dom).slice(0, 200)}`;
    }
    // 11.1.11 — a manager's landing screen after sign-in is the operations dashboard.
    return where === '/ops' ? null : `signed in but landed on ${where}`;
  });

  if (signedIn) {
    await step('OpsDashboard', '11.2.12, 7.1.x', 'the dashboard shows real counts from the server', async () => {
      const dom = await boot('/signin');
      fill(dom, 'email', email);
      fill(dom, 'password', password);
      clickText(dom, 'button', 'sign in');
      await settle(dom, (d) => d.window.location.pathname === '/ops');
      await settle(dom, (d) => /\d/.test((d.window.document.querySelector('main')?.textContent ?? '')));
      const body = text(dom);
      if (/loading/i.test(body) && !/\d/.test(body)) {
        return 'the dashboard never left its loading state';
      }
      if (/could not|error|failed/i.test(body)) {
        return `the dashboard rendered an error: ${body.slice(0, 200)}`;
      }
      // 7.1.2 — the counts are the point of the screen; a dashboard with no numbers on it has
      // rendered its chrome and nothing else.
      return /\d/.test(body) ? null : 'the dashboard carries no numbers at all';
    });

    await step('OpsDashboard', '11.1.4, 11.1.6', 'the shell shows the role and its navigation', async () => {
      const dom = await boot('/signin');
      fill(dom, 'email', email);
      fill(dom, 'password', password);
      clickText(dom, 'button', 'sign in');
      // `pushState` runs before React commits the render that follows it, so waiting on the URL
      // alone reads the shell one tick too early and finds an empty header. Wait for the thing
      // being asserted to exist - the same discipline as `settle`'s content check.
      await settle(dom, (d) => (d.window.document.querySelector('[data-part="role"]')?.textContent ?? '') !== '');
      const role = dom.window.document.querySelector('[data-part="role"]')?.textContent ?? '';
      if (!role.toLowerCase().includes('operations')) {
        return `the shell does not name the role; it reads "${role}"`;
      }
      const current = dom.window.document.querySelector('nav a[aria-current="page"]');
      // 11.1.4 — and it is announced, not merely coloured (11.7.5).
      return current === null ? 'no navigation item is marked as current (11.1.4)' : null;
    });

    await step('Navigation', '11.3.2', 'every navigation item leads to a screen, not a refusal', async () => {
      const dom = await boot('/signin');
      fill(dom, 'email', email);
      fill(dom, 'password', password);
      clickText(dom, 'button', 'sign in');
      await settle(dom, (d) => d.window.document.querySelectorAll('nav a').length > 0);
      const items = [...dom.window.document.querySelectorAll('nav a')];
      if (items.length === 0) {
        return 'the signed-in shell has no navigation';
      }
      const broken: string[] = [];
      for (const item of items) {
        (item as HTMLElement).click();
        await settle(dom, () => true);
        const screen = screenOf(dom);
        if (screen === 'NotAuthorised' || screen === 'NotFound') {
          broken.push(`${item.getAttribute('href') ?? '?'} → ${screen}`);
        }
      }
      return broken.length === 0 ? null : `navigation leads to a dead end: ${broken.join(', ')}`;
    });

    await step('DataSources', '1.1.18, 11.2.23', 'the manager can trigger an ingestion run from the screen', async () => {
      const dom = await boot('/ops/sources');
      fill(dom, 'email', email);
      fill(dom, 'password', password);
      clickText(dom, 'button', 'sign in');
      // The guard sends an unauthenticated visitor to /signin and returns them here afterwards
      // (11.1.10), so this also exercises that path rather than navigating twice.
      await settle(dom, (d) => d.window.document.querySelector('[data-action="refresh"]') !== null);

      const button = dom.window.document.querySelector('[data-action="refresh"]') as HTMLElement | null;
      if (button === null) {
        return `no refresh control on ${screenOf(dom)}`;
      }
      button.click();
      // The real thing: three public APIs are actually called on the other side of this click.
      await settle(dom, (d) => d.window.document.querySelector('[data-part="refresh-outcome"]') !== null, 30_000);
      const outcome = dom.window.document.querySelector('[data-part="refresh-outcome"]')?.textContent ?? '';
      if (outcome === '') {
        return 'the run reported nothing back';
      }
      // A source may genuinely be down, and that is a real answer — but the panel must name a
      // source either way, rather than showing a bare apology.
      return /Clusters|Rainfall|Forecast/.test(outcome) ? null : `unexpected outcome: ${outcome}`;
    });
  } else {
    skip('OpsDashboard', '11.2.12', 'the dashboard shows real counts', 'the manager could not sign in');
    skip('OpsDashboard', '11.1.4', 'the shell shows the role', 'the manager could not sign in');
    skip('Navigation', '11.3.2', 'every navigation item leads to a screen', 'the manager could not sign in');
    skip('DataSources', '1.1.18', 'the manager can trigger an ingestion run', 'the manager could not sign in');
  }

  report();
}

function report(): void {
  console.log('  screen           requirement       result   what');
  console.log('  ---------------  ----------------  -------  ------------------------------------');
  for (const outcome of outcomes) {
    console.log(
      `  ${outcome.screen.padEnd(15)}  ${outcome.requirement.padEnd(16)}  ${outcome.status.padEnd(7)}  ${outcome.what}`,
    );
    if (outcome.detail !== '') {
      console.log(`        ${outcome.detail}`);
    }
  }
  const passed = outcomes.filter((o) => o.status === 'PASS').length;
  const failed = outcomes.filter((o) => o.status === 'FAIL').length;
  const skipped = outcomes.filter((o) => o.status === 'SKIP').length;
  console.log(`\n  ${passed} passed, ${failed} failed, ${skipped} skipped.`);
  if (fullPageLoads > 0) {
    console.log(`  ${fullPageLoads} link(s) would cause a full page load (the brand and the refusal screens' way back).`);
  }
  console.log('  jsdom renders no pixels: contrast, tap targets and sunlight legibility (11.7.x) still need eyes.');
  if (failed > 0) {
    process.exitCode = 1;
  }
}

/** Referenced so the Role import is not dropped; the seed's role is what 11.1.11 keys on. */
export const EXPECTED_ROLE = Role.OperationsManager;

void main().catch((error: unknown) => {
  console.error('client UAT could not run:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
