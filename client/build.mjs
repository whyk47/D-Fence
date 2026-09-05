/**
 * D-Fence — bundle the client.
 *
 *     node client/build.mjs           # one build into client/dist
 *     node client/build.mjs --watch   # rebuild on change, for development
 *
 * esbuild rather than a framework toolchain, deliberately. The client imports types and constants
 * from `src/` — `ReportSiteScreen` takes its character limit from the server's own module rather
 * than retyping it — so the bundler has to follow imports out of `client/` and into the server
 * tree, and it has to do so without a configuration file that becomes its own thing to maintain.
 * This is the whole build: one entry point, one output, no plugins.
 *
 * **Type checking is not done here.** esbuild strips types without reading them; `npm run
 * typecheck` is what proves the client compiles, and it runs over the same files. A build that
 * "succeeded" while the code did not typecheck would be the worst of both.
 */
import { build, context } from 'esbuild';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(here, 'dist');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [resolve(here, 'src', 'main.tsx')],
  outfile: resolve(outdir, 'app.js'),
  bundle: true,
  // IIFE rather than ESM, and for one reason worth recording: jsdom cannot execute ES modules, so
  // an ESM bundle can only be smoke-tested by building a second, different artefact — and a test
  // that runs a different bundle from the one served proves the wrong thing. There is one entry
  // point and no dynamic import here, so IIFE costs nothing and keeps the tested artefact and the
  // served artefact byte-identical.
  format: 'iife',
  platform: 'browser',
  // The browsers a marker and a teaching lab will actually have. Lower than this and React 18's
  // own output stops being valid anyway.
  target: ['es2020', 'chrome100', 'firefox100', 'safari15'],
  jsx: 'automatic',
  sourcemap: true,
  // Minified, because 10.1.2's one-second budget includes the download, and the difference is
  // roughly a factor of three. The source map means the minification costs nothing in debuggability.
  minify: true,
  // `process.env.NODE_ENV` appears inside React's own source; without this the bundle carries the
  // development build, which is markedly slower and warns into the console of a live demonstration.
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
};

await mkdir(outdir, { recursive: true });
await copyFile(resolve(here, 'index.html'), resolve(outdir, 'index.html'));
await copyFile(resolve(here, 'styles.css'), resolve(outdir, 'styles.css'));

/**
 * Everything in `client/public` is served from the root: the manifest, the icons and the service
 * worker (11.8.1-11.8.4, 11.8.7).
 *
 * The service worker in particular MUST be at the root, because a worker's scope cannot rise above
 * the path it was served from — one served from `/assets/sw.js` could not control `/` and would
 * silently control nothing.
 */
const publicDir = resolve(here, 'public');
for (const name of await readdir(publicDir)) {
  await copyFile(resolve(publicDir, name), resolve(outdir, name));
}

/**
 * 11.8.11 — stamp the service worker with a hash of what it caches.
 *
 * The cache name contains this stamp, and `activate` deletes every cache that is not the current
 * one, so a deployment that changes the bundle changes the cache and the old shell goes. With a
 * fixed cache name an installed application serves a version of itself that no longer exists on
 * the server, and the user's only escape is clearing site data — which they will not think of.
 */
async function stampServiceWorker() {
  const hash = createHash('sha256');
  for (const name of ['app.js', 'index.html', 'styles.css']) {
    hash.update(await readFile(resolve(outdir, name)));
  }
  const stamp = hash.digest('hex').slice(0, 12);
  const worker = await readFile(resolve(publicDir, 'sw.js'), 'utf8');
  // `replaceAll`, not `replace`. The placeholder appears in the file's own doc comment before it
  // appears in the `VERSION` constant, so `replace` stamped the comment and left the constant
  // reading `__BUILD__` — one fixed cache name for every build ever, which is precisely the defect
  // the stamp exists to prevent. Caught by a test that executed the worker rather than reading it.
  const stamped = worker.replaceAll('__BUILD__', stamp);
  if (stamped.includes('__BUILD__')) {
    throw new Error('the service worker still contains an unstamped placeholder');
  }
  await writeFile(resolve(outdir, 'sw.js'), stamped, 'utf8');
  return stamp;
}

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching client/src for changes…');
} else {
  await build(options);
  const stamp = await stampServiceWorker();
  console.log(`client bundled into ${outdir} (service worker build ${stamp})`);
}
