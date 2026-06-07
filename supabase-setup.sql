-- Mavly Lead Qualifier — Supabase setup.
-- Paste this entire file into the Supabase SQL Editor and click "Run".
-- Safe to run more than once.

DO $$ BEGIN
  CREATE TYPE "user_role" AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "users" (
  "id"           serial PRIMARY KEY,
  "openId"       varchar(64) NOT NULL UNIQUE,
  "name"         text,
  "email"        varchar(320),
  "loginMethod"  varchar(64),
  "role"         "user_role" NOT NULL DEFAULT 'user',
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),
  "lastSignedIn" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id"          serial PRIMARY KEY,
  "ownerOpenId" varchar(64) NOT NULL,
  "fileName"    varchar(512) NOT NULL DEFAULT '',
  "headers"     jsonb NOT NULL,
  "leadCount"   integer NOT NULL DEFAULT 0,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "leads" (
  "id"        serial PRIMARY KEY,
  "sessionId" integer NOT NULL,
  "position"  integer NOT NULL DEFAULT 0,
  "raw"       jsonb NOT NULL,
  "qa"        jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sessions_ownerOpenId_idx" ON "sessions" ("ownerOpenId");
CREATE INDEX IF NOT EXISTS "leads_sessionId_idx"     ON "leads"    ("sessionId");
