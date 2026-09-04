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
import { copyFile, mkdir } from 'node:fs/promises';
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

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching client/src for changes…');
} else {
  await build(options);
  console.log(`client bundled into ${outdir}`);
}
