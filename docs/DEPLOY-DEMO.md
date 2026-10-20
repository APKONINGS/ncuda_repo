# Deploying the stakeholder demo (Vercel)

The portal runs in demo mode on Vercel, with its data in an online store
(Upstash Redis) so that every copy of the site shares the same data and nothing
is lost between clicks.

## One-time setup

1. **GitHub**: create a private repository and push the project (the `.data/`
   folder and `.env*` files are excluded by `.gitignore`).
2. **Vercel**: *Add New → Project*, import the repository. Framework: Next.js
   (detected). Do not deploy yet.
3. **Online store**: in the Vercel project, *Storage → Create → Upstash (Redis)*,
   free plan, and connect it to the project. This adds `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` automatically.
4. **Environment variables** (Vercel project → Settings → Environment Variables):
   - `SESSION_SECRET`: 32+ random characters, e.g. from
     `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
   - `NCUDA_AUTH_MODE` = `demo`
   - `NCUDA_DEMO_SEED` = `stakeholders`
   - `NEXT_PUBLIC_SITE_URL` = the site's address (e.g. `https://ncuda.vercel.app`)
5. **Deploy.** The first visit fills the empty store with the stakeholder demo.

## During the demo

- The sign-in page lists the demo roles under *Try a demonstration account*:
  one click fills the email and the shared demo password.
- Everything done on the site is saved to the online store and seen by everyone.

## Starting over

In the Upstash console (via Vercel → Storage), delete the keys starting with
`ncuda-demo:` (or flush the database). The next visit starts again from the
stakeholder demo.

## The demo data

`lib/demo/stakeholder-seed.json` is built from `scripts/stakeholder-members.json` (the
member list: 60 members in Buea, Bomaka, Bamenda, Ngwo, USA and EU). Everyone holds
their listed post and has paid their chapter's registration fee (FCFA 5,000 in
Cameroon, FCFA 25,000 in the diaspora chapters), with receipts. Diaspora has no
Regional Coordinator yet. To rebuild it after editing the list:

    BUILD_STAKEHOLDER_SEED=1 npx vitest run tests/build-stakeholder-seed.test.ts

`tests/stakeholder-seed.test.ts` checks the result. To try it on your PC, set
`NCUDA_DEMO_SEED=stakeholders` (and no `NCUDA_DEMO_STORE_FILE`, or a new one).

## Limits

- Uploads are limited to 7 MB each online.
- If two people save at the very same moment, the later save wins. This doesn't
  matter in a guided demo; it is replaced by the database when Supabase is
  connected.
