# Deploying D-Fence to Azure App Service

Everything in this document that can be automated has been. What is left is the part that needs an
account only Yen Kit can create and a card-free student verification only he can pass.

---

## 0. What had to change before this was possible

Four things, all committed, none of them cosmetic:

1. **`npm run build` produced output that could not run.** It was `tsc -p tsconfig.json`, and the
   project imports without file extensions (`moduleResolution: "bundler"`). `tsx` resolves those;
   Node's ESM loader refuses. `node dist/src/server.js` failed on its first import. Nobody had
   noticed, because development, the tests and both acceptance harnesses all run through `tsx` — the
   defect was invisible until the application had to start somewhere without the TypeScript
   toolchain. `npm run build` now bundles with esbuild (`tools/build-server.mjs`) and the output
   runs.
2. **The server was unreachable for its first thirty seconds.** It primed a full ingestion cycle —
   three public APIs and a scoring pass — *before* calling `listen()`. On a laptop that is a
   nuisance. On a host it is a failed deployment: a platform health check against a port nothing is
   listening on concludes the container is broken and restarts it, and every restart begins with the
   same thirty seconds. The cycle now runs after `listen()`. This is safe in a way it would not have
   been six months ago: the stores are persistent, so a request arriving during the first cycle is
   answered from the previous run's data rather than from an empty `Map`.
3. **There was no liveness probe.** `GET /api/health` now answers `{status, uptimeSeconds}`. It
   deliberately does **not** touch the database: a probe that queried Postgres would turn a
   transient database blip into a restart loop, and a restart cannot fix somebody else's database.
4. **`dist/` is now a self-contained artefact** — server bundle, the Supabase CA certificate and the
   built client, in one directory.

Verified locally: the bundled server answers `/api/health` **three seconds** after start, against
roughly thirty before.

---

## 1. The account (Yen Kit — I cannot do this part)

1. Go to **azure.microsoft.com/free/students** and sign in with **YCHOW015@e.ntu.edu.sg**.
2. Azure for Students gives **$100 of credit for 12 months and asks for no credit card.** You do not
   need the GitHub Student Developer Pack for this — the NTU address qualifies on its own. (Worth
   knowing separately: DigitalOcean left the Student Pack on 1 August 2026 and withdrew credits
   already issued, so it is no longer the obvious fallback it used to be.)
3. Verification is usually instant with a university address; occasionally it asks for a document.

---

## 2. The two settings that are not free choices

**Region: Southeast Asia.** Not a preference. Supabase is in `ap-southeast-1` (Singapore), and a
single dashboard response makes roughly fifteen *sequential* round trips to it. At Singapore-to-
Singapore latency that is the 179 ms measured locally. From, say, East US, the same fifteen trips
cross the Pacific and back fifteen times, and the dashboard becomes slow enough to notice **with one
user** — which would turn the performance finding from "does not affect your demo" into one that
does.

**Plan: B1 Basic, not F1 Free.** F1 is capped at 60 CPU-minutes a day and does not support Always
On, so the process is evicted when idle. D-Fence is not a request/response app only — it runs
ingestion timers (rainfall every 5 minutes, clusters hourly), and an evicted process ingests
nothing, leaving holes in the accumulated history that the trend charts and week-over-week figures
are computed from. B1 is about **US$13/month**, so the $100 credit covers roughly seven months —
comfortably past the semester.

---

## 3. Create the app

```bash
az login
az group create --name dfence --location southeastasia
az appservice plan create --name dfence-plan --resource-group dfence \
  --location southeastasia --sku B1 --is-linux
az webapp create --name dfence-sc2006 --resource-group dfence \
  --plan dfence-plan --runtime "NODE:20-lts"

# Always On keeps the ingestion timers alive; the health path stops a database
# blip from being mistaken for a dead container.
az webapp config set --name dfence-sc2006 --resource-group dfence \
  --always-on true --startup-file "npm start"
az webapp config set --name dfence-sc2006 --resource-group dfence \
  --health-check-path "/api/health"
```

`dfence-sc2006` must be globally unique; if it is taken, choose another and use it consistently.

---

## 4. Configuration (never in the repository)

`src/.env` is gitignored and stays that way. On Azure these are **App Settings**, which are injected
as environment variables — `ConfigLoader` already reads `process.env` before falling back to the
file, so nothing in the code changes.

```bash
az webapp config appsettings set --name dfence-sc2006 --resource-group dfence --settings \
  DATABASE_URL="…"                     \
  ONE_MAP_EMAIL="…"                    \
  ONE_MAP_PASSWORD="…"                 \
  TELEGRAM_BOT_TOKEN="…"               \
  DFENCE_REQUIRE_HTTPS=true            \
  DFENCE_SEED_MANAGER_EMAIL="…"        \
  DFENCE_SEED_MANAGER_PASSWORD="…"     \
  SCM_DO_BUILD_DURING_DEPLOYMENT=false
```

Copy the first four values from `src/.env`. **Set them from a terminal, not from a file you commit,
and not into a chat window.**

### `DFENCE_SEED_MANAGER_PASSWORD` — read this one

The development seed is `manager@d-fence.local` / `dfence2026`, and it is printed in the start-up
log. That is fine on a laptop. On a public URL it is an Operations Manager account with a published
password, and an Operations Manager can read every report, every resident's exposure and every work
order.

**Set both seed variables to something you choose before the first deployment**, not after — the
account is created on first boot, and the window between "first boot" and "I changed it" is a window
with a known-credential admin account on the open internet.

`DFENCE_REQUIRE_HTTPS=true` closes **10.3.2**: Azure terminates TLS at its front end and forwards
`x-forwarded-proto`, which `ExpressApp` already reads, so the redirect and HSTS work correctly
behind the platform rather than causing the redirect loop a naive `req.secure` check would.

---

## 5. Deploy

Build locally and ship the result. `SCM_DO_BUILD_DURING_DEPLOYMENT=false` above tells Azure not to
run its own build, which avoids the one failure mode of the alternative: Azure's builder pruning
`devDependencies` and then failing because esbuild — the thing that does the building — was one of
them.

```bash
npm ci
npm run build          # client bundle + server bundle into dist/
npm prune --omit=dev   # ship only what runs

zip -r deploy.zip dist node_modules package.json
az webapp deploy --name dfence-sc2006 --resource-group dfence \
  --src-path deploy.zip --type zip

npm install            # put the dev dependencies back locally
```

---

## 6. Prove it, don't assume it

Both harnesses take a `--base`, so the acceptance suite runs against the deployed instance exactly
as it runs against localhost:

```bash
npm run uat        -- --base https://dfence-sc2006.azurewebsites.net
npm run uat:client -- --base https://dfence-sc2006.azurewebsites.net
npm run load:check -- --base https://dfence-sc2006.azurewebsites.net
```

Expect **48 passed / 0 failed / 1 documented skip** and **9 / 0** as on localhost. `load:check` is
the interesting one after a move: it is the first measurement of 10.1.5 across a real network rather
than a loopback, and the dashboard number is the one to watch.

The `uat` run needs `--log` to read a registration verification token, which a deployed instance does
not put in a local file — so the B1 beat (a resident registering) will report that it cannot read the
token. That is a limitation of the harness against a remote host, not a failure of the system.

---

## 7. Known limitations of a deployed instance

- **Passwords do not survive a restart.** `LocalAuthProvider` is the development stand-in for
  Supabase Auth and holds its scrypt hashes in memory. Accounts, roles, lock-outs and Telegram links
  all persist; the credentials do not, so every restart re-seeds the manager and any resident
  account registered through the UI stops working. This is the largest remaining gap between the
  deployment and a real one.
- **Email verification has no email.** 2.1.4's token is written to the server log, so a resident
  registering on the public instance cannot complete verification without someone reading the log
  stream (`az webapp log tail`).
- **Photograph URLs are not signed** (10.3.5) — that needs Supabase Storage, which does not exist
  yet.
- **Saved locations, alerts, forecasts and the audit trail are still in memory** and are lost on
  restart. The audit trail is the one that matters: its schema guarantees are real, the table
  exists, and nothing writes to it yet.
