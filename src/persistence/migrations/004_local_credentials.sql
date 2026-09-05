-- =============================================================================================
-- D-Fence — migration 004: the development auth provider's secrets get somewhere to live.
--
-- `LocalAuthProvider` is the stand-in for Supabase Auth (10.3.1 gives credential handling to the
-- provider, and that decision stands). It held every password hash, every verification token and
-- every reset token in three in-process Maps — while the `account` row itself was already in
-- Postgres. A restart therefore produced the worst available combination: the account still
-- existed, still had a role, still appeared in the staff list, and nobody could ever sign in to it
-- again. "Your account does not exist" is a bad outcome; "your account exists and your password is
-- wrong" is worse, because the user retries, trips 2.1.10's lock-out, and ends up with evidence
-- that the system is lying to them.
--
-- **What is stored is a salted scrypt hash and nothing else.** No plaintext, no reversible
-- encoding, a fresh 16-byte salt per user, and `bytea` rather than text so nothing depends on an
-- encoding round trip. This is the same material the Maps held; the change is that it survives.
--
-- **These tables are temporary by design.** When Supabase Auth is bound they become dead code and
-- should be dropped, not kept "just in case" — a table of password hashes that nothing reads is a
-- liability with no compensating benefit.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS local_credential (
  auth_user_id  text PRIMARY KEY,                        -- the provider's id, not account.id
  email         text NOT NULL UNIQUE,                    -- 2.1.4: one account per address
  salt          bytea NOT NULL,                          -- per user; two equal passwords differ
  password_hash bytea NOT NULL,                          -- scrypt, 64 bytes
  disabled      boolean NOT NULL DEFAULT false,          -- 2.2.5
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2.1.5 and 2.1.11. Both links are single use and one of them expires, so `used` and `expires_at`
-- are columns rather than a deletion: a token that has been spent must be distinguishable from one
-- that was never issued, or "already used" and "never existed" become the same answer.
--
-- `kind` keeps them in one table because they have identical shape and identical rules; a second
-- table would be the same DDL with a different name and a second place to forget the index.
CREATE TABLE IF NOT EXISTS local_credential_token (
  token        text PRIMARY KEY,
  auth_user_id text NOT NULL REFERENCES local_credential(auth_user_id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('verification', 'reset')),
  -- Null for a verification token: 2.1.5 does not put a deadline on it, and inventing one here
  -- would be inventing a requirement.
  expires_at   timestamptz,
  used         boolean NOT NULL DEFAULT false,
  issued_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS local_credential_token_user_idx
  ON local_credential_token (auth_user_id, kind, issued_at DESC);
