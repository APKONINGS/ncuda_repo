# NCUDA — Ngwo Cultural and Development Association

Version 1 of NCUDA's website and secure member portal.

- **Public site:** Home, About, Activities, Contact
- **Member Portal:** sign-in, dashboard, meetings and minutes, attendance, contributions, documents, notifications and profile. Officers also get members, roles & access, and the audit log. There is **no public registration**: officers create accounts.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

### Running it on another computer

Requires **Node.js 20.9 or newer** (`node -v`).

1. Copy the project **without** `node_modules` and `.next`. Those folders are built for the computer they were made on and break when copied to another one.
2. In the project folder, run `npm install`. This rebuilds `node_modules` for that computer.
3. To carry over the test data and settings, include `.env.local` and the `.data` folder.
4. Run `npm run dev -- --hostname 0.0.0.0` and open http://localhost:3000. Keep that terminal window open while using the site.

### Demo accounts

The portal runs in **demo mode** with fictional data. Open `/member-portal`, expand **"Try a demonstration account"** and pick a role. The password for every demo account is `ncuda-demo`.

| Account | Shows |
| --- | --- |
| `member` | Ordinary member: own records only |
| `president` | Chapter President: appoints chapter officers; finances **view-only** |
| `finsec` | Financial Secretary: record and void contributions in their chapter |
| `secretary` | Chapter Secretary: attendance register, draft minutes |
| `coordinator` | Regional Coordinator: oversight of the chapters in their region |
| `president.general` | President General: organisation-wide view (finances grouped and filterable), appoints the central EXCO and coordinators, messages any group, creates regions with their Regional Coordinators (coordinators create chapters) |
| `central.finsec` | National Financial Secretary: keeps the central ledger and central expenses; all chapters' records; sets up organisation-wide projects (e.g. the tractor project) |
| `secretary.general` | National Secretary General: central meetings, minutes and documents |
| `coordinator.b` | Regional Coordinator for Region B: creates chapters in Region B with their founding EXCO |
| `president.b2` | Chapter President of B2 |

Demo changes (new contributions, role changes, enrolments) persist until the server restarts.

**A suggested demo path:**
1. Sign in as `president.general`. Open **Finances → Chapter records**: records are grouped by chapter; filter by the tractor collection and a date range. Under **Notifications → Send a message**, message all Chapter Presidents.
2. Sign in as `president`. Open the message (the unread count drops when you close it), then make *Sample Member 01* a Financial Secretary under **Roles & access**.
3. Sign in as `finsec`. Open **Finances → Record a payment**: choose a member and a project — the description and expected amount fill in — record what was paid, then void it with a reason. Record a fine, an **Expense**, and see who still owes under **Collections**.
4. Back as `president.general`, open the **Audit log** to see every step, with before and after values.

## Scripts

| | |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Authorization engine and command tests (Vitest) |
| `npm run test:db` | Runs every Supabase migration in PGlite and checks the RLS behaviour |
| `npm run typecheck` / `lint` | TypeScript / ESLint |
| `npm run db:seed-roles` | Regenerates the roles/permissions seed migration from `lib/permissions` |

## Configuration

Copy `.env.example` to `.env.local`. In production you **must** set `SESSION_SECRET`. The contact form delivers to `CONTACT_WEBHOOK_URL`; without it, the form tells visitors that it isn't switched on yet.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): RBAC model, Supabase plan, security checklist
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md): visual direction, tokens, components
- [docs/RESEARCH.md](docs/RESEARCH.md): cultural research, sources, and what was deliberately not used
- [docs/CONTENT_TODO.md](docs/CONTENT_TODO.md): everything NCUDA needs to supply
- [public/images/SOURCES.md](public/images/SOURCES.md): photo licences and credits

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, Zod and Supabase (`@supabase/ssr`).
