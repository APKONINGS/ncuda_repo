# Content NCUDA needs to supply

Anything not yet confirmed is shown on the site with a gold **"To be confirmed"** / **"Draft"** marker (`ph()` in `lib/content/site.ts`). Replace each one only with wording NCUDA has approved.

| Item | Where it lives | Currently |
| --- | --- | --- |
| Official logo / emblem | `components/brand/Logo.tsx` | Original placeholder mark |
| Official motto (if any) | Home hero | No motto shown |
| Founding story & date | `about.story` | Placeholder |
| Mission | `about.mission` | Draft wording |
| Vision | `about.vision` | Draft wording |
| Objectives | `about.objectives` | Draft wording |
| Leadership names | `about.leadership` | Roles only, names "to be confirmed" |
| Email / phone / office address | `contact` | Placeholders |
| Social media accounts | `contact.social` | None shown |
| Development projects | `components/sections/home/Development.tsx` → `projects` | Empty register |
| Activity reports | `activityCategories[].entries` | Empty, honest empty states |
| Photographs of Ngwo and NCUDA events | `lib/content/images.ts` + `public/images` | Momo Division / Northwest Region photos, captioned as such |
| Confirmation of "Njikwa = road to the farm" | `facts.njikwaMeaning` | Shown as "reported" |
| Chapter list & regions | Supabase `chapters` / `regions` | Demo: "Sample Chapter A1" etc. |
| Who may create accounts / appoint roles | `lib/permissions/roles.ts` → re-run `npm run db:seed-roles` | Sensible defaults (see file header) |
