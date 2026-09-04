/**
 * D-Fence — bundle the server for deployment.
 *
 * **Why this exists at all.** `npm run build` was `tsc -p tsconfig.json`, and its output has never
 * been runnable: the project imports without file extensions (`moduleResolution: "bundler"`), which
 * `tsx` resolves happily and Node's ESM loader refuses outright. Running `node dist/src/server.js`
 * fails on the first import with ERR_MODULE_NOT_FOUND. Nobody noticed because everything —
 * development, tests, the acceptance harnesses — runs through `tsx`. The moment the application has
 * to start on a host that does not have the TypeScript toolchain, that stops being invisible.
 *
 * esbuild resolves every import at build time, so the extension question disappears rather than
 * being worked around. It is also the tool already used for the client, which keeps one bundler in
 * the project instead of two.
 *
 * **Where the output goes, and why exactly there.** `dist/src/server.mjs`, not `dist/server.mjs`.
 * Two paths in the running server are resolved relative to a module's own URL, and bundling
 * collapses both onto the bundle's location:
 *
 *   Database.ts (in `src/persistence/`) → `../certs/…`   → from the bundle, `dist/certs`
 *   server.ts   (in `src/`)             → `../client/dist` → from the bundle, `dist/client/dist`
 *
 * So the build copies both into `dist` rather than rewriting the paths for production. Rewriting
 * them would mean the deployed server resolves its files differently from the one every test
 * exercises, which is how a deployment-only bug is born — and the payoff is that `dist/` is then a
 * self-contained artefact: certificate, client bundle and server in one directory to ship.
 *
 * (The first version of this comment claimed the client path had two `..` segments. It has one.
 * The bundle looked in `dist/client/dist`, found nothing, and started with the API alone — which
 * it reports rather than hiding, which is the only reason it took a minute rather than an evening.)
 */
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'dist');

await rm(outDir, { recursive: true, force: true });
await mkdir(resolve(outDir, 'src'), { recursive: true });

const result = await build({
  entryPoints: [resolve(root, 'src/server.ts')],
  outfile: resolve(outDir, 'src/server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  // Matches the Node the project develops against. Not `esnext`: a target that outruns the host's
  // Node emits syntax the host cannot parse, and the failure is a syntax error at start-up with no
  // indication that a build setting caused it.
  target: 'node20',
  sourcemap: true,
  // Dependencies stay external and are installed on the host by `npm ci`. Bundling `pg` would drag
  // its optional native bindings through esbuild for no benefit, and a host that runs `npm install`
  // anyway — which Azure App Service does — gains nothing from having them inlined.
  packages: 'external',
  logLevel: 'info',
  metafile: true,
});

// The CA certificate is public (it is a CA certificate, not a key), which is why it is committed;
// see the note in src/persistence/Database.ts. It has to travel with the bundle or TLS verification
// against Supabase fails closed — which is the correct direction to fail, but not at 2am.
await cp(resolve(root, 'src/certs'), resolve(outDir, 'certs'), { recursive: true });

// The client, if it has been built. Not fatal when absent: `server.ts` already degrades to serving
// the API alone and says so on start-up, and a server that refused to boot without a front end
// would be worse for exactly the debugging session where you want the API up.
const clientSource = resolve(root, 'client/dist');
if (existsSync(resolve(clientSource, 'index.html'))) {
  await cp(clientSource, resolve(outDir, 'client/dist'), { recursive: true });
  console.log('  client bundle copied into dist/client/dist');
} else {
  console.log('  NOTE: client/dist is empty — run `npm run build:client` first, or the deployment serves the API only');
}

const bytes = Object.values(result.metafile.outputs).reduce((sum, o) => sum + o.bytes, 0);
console.log(`server bundled into ${resolve(outDir, 'src/server.mjs')} (${(bytes / 1024).toFixed(0)} KB)`);
console.log('  start it with: node dist/src/server.mjs');
