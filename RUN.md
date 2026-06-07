# Running Mavly Lead Qualifier locally

Stack: **Next.js 15 (App Router) + tRPC + Drizzle + Supabase (Postgres)**. Runs in single-user mode — no OAuth, no login screen.

## 1. Install Node and pnpm (if you don't have them)

```bash
node --version       # need Node 20+
npm install -g pnpm  # if pnpm is missing
```

## 2. Set up the database in Supabase

Open the Supabase dashboard → **SQL Editor** → paste the contents of `supabase-setup.sql` (in this repo) → click **Run**. That creates the `users`, `sessions`, and `leads` tables.

## 3. Configure `.env`

```bash
cp .env.example .env
```

Fill in `DATABASE_URL`. To find it:

1. Supabase → your project → **Project Settings** → **Database**
2. Scroll to **Connection string** → copy the **URI** form
3. Replace `[YOUR-PASSWORD]` with your DB password (URL-encode special characters)

Twilio creds are optional — leave them blank and the phone-check buttons gray out.

## 4. Install dependencies

```bash
pnpm install
```

If pnpm complains about peer deps, `pnpm install --no-strict-peer-dependencies` or `npm install --legacy-peer-deps` works.

## 5. Run

```bash
pnpm dev
```

Open `http://localhost:3000` — you'll land straight on the upload screen, no login.

## Other commands

```bash
pnpm test    # 23-test vitest suite
pnpm check   # TypeScript type-check
pnpm build   # production build
pnpm start   # serve the production build
```

## Project layout

```
app/                     ← Next.js App Router
  layout.tsx             ← Root layout (server component)
  page.tsx               ← Wraps the existing <Home /> in a client tree
  providers.tsx          ← tRPC + React Query + Theme + ErrorBoundary providers
  globals.css            ← Tailwind 4 + theme tokens
  api/trpc/[trpc]/route.ts  ← Single tRPC HTTP handler (GET + POST)

server/
  db.ts                  ← Drizzle helpers — Postgres
  routers.ts             ← Root tRPC router
  routers/leads.ts       ← Leads / sessions / Twilio / dedup procedures
  _core/context.ts       ← createContext() — bootstraps the local user
  _core/trpc.ts          ← procedure builders (publicProcedure, protectedProcedure)
  _core/env.ts           ← Env var loader

drizzle/
  schema.ts              ← Drizzle schema (pgTable / pgEnum / jsonb)
  0000_bored_sunspot.sql ← Initial migration (Postgres)

shared/
  qualify.ts             ← Scoring, grading, dedup, phone helpers
  const.ts               ← Shared constants

client/src/               ← Reused as-is by Next via the @/* alias
  pages/Home.tsx         ← Main screen (carries "use client" directive)
  components/qualifier/  ← Sidebar, QualifyPanel, Dropzone, ExportBar, SessionPicker
  components/ui/         ← shadcn/ui primitives
  hooks/useLeads.ts      ← Optimistic update hook
  lib/csv.ts             ← Parsing + export builders
  lib/trpc.ts            ← createTRPCReact<AppRouter>()
  _core/hooks/useAuth.ts ← Returns the local user (always authenticated)
```

## Troubleshooting

- **`DATABASE_URL` not set** → app loads but every tRPC call fails; check `.env` is at the project root.
- **SASL / password errors** → wrong DB password or wrong region. Use the URI string Supabase shows you, with the actual password URL-encoded.
- **Tables not found** → re-run `supabase-setup.sql` in the SQL editor.
- **`Module not found: Can't resolve '@/...'`** → run `pnpm install` after pulling — Next.js reads the path alias from `tsconfig.json`.
- **Build complains about `mysql2` or wouter** → those are old deps from the previous template; they're no longer in `package.json` — make sure your `node_modules` is fresh (`rm -rf node_modules && pnpm install`).
