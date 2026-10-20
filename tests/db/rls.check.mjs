import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// Runs every migration in an in-process Postgres (PGlite) and checks RLS
// behaviour as different members. Supabase-specific schemas are stubbed.
const MIG = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const db = new PGlite();

// ── Minimal Supabase stubs ──
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id serial primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated; grant select, insert on storage.objects to authenticated;
`);

for (const f of readdirSync(MIG).sort()) {
  try {
    await db.exec(readFileSync(join(MIG, f), "utf8"));
    console.log("✓ migrated", f);
  } catch (e) {
    console.error("✗ FAILED", f, "\n ", e.message);
    process.exit(1);
  }
}

await db.exec(`grant usage on schema public to authenticated, anon;
  grant select, insert, update, delete on all tables in schema public to authenticated;`);

// ── Fixtures (as superuser) ──
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
await db.exec(`
  insert into public.regions (id, organization_id, name) select '${U(901)}', id, 'Region A' from public.organizations;
  insert into public.chapters (id, organization_id, region_id, name) select '${U(801)}', id, '${U(901)}', 'A1' from public.organizations;
  insert into public.chapters (id, organization_id, region_id, name) select '${U(802)}', id, null, 'B1 (no region)' from public.organizations;
  insert into auth.users values ('${U(1)}'),('${U(2)}'),('${U(3)}'),('${U(4)}'),('${U(5)}'),('${U(6)}'),('${U(7)}');
  insert into public.members (id, auth_user_id, organization_id, full_name, email, member_number)
    select x.id::uuid, x.id::uuid, o.id, x.n, x.e, x.num from public.organizations o,
    (values ('${U(1)}','Ordinary Member','m@x','N1'),('${U(2)}','Fin Sec A1','fs@x','N2'),('${U(3)}','President A1','p@x','N3'),
            ('${U(4)}','Coordinator A','rc@x','N4'),('${U(5)}','Fin Sec B1','fsb@x','N5'),('${U(6)}','Member B1','mb@x','N6'),('${U(7)}','President General','pg@x','N7')) x(id,n,e,num);
  insert into public.member_chapter_history (member_id, chapter_id) values
    ('${U(1)}','${U(801)}'),('${U(2)}','${U(801)}'),('${U(3)}','${U(801)}'),('${U(4)}','${U(801)}'),('${U(5)}','${U(802)}'),('${U(6)}','${U(802)}'),('${U(7)}','${U(802)}');
  insert into public.member_roles (member_id, role_key, scope_level, chapter_id) values
    ('${U(2)}','FINANCIAL_SECRETARY','chapter','${U(801)}'),('${U(3)}','CHAPTER_PRESIDENT','chapter','${U(801)}'),('${U(5)}','FINANCIAL_SECRETARY','chapter','${U(802)}');
  insert into public.member_roles (member_id, role_key, scope_level, region_id) values ('${U(4)}','REGIONAL_COORDINATOR','region','${U(901)}');
  insert into public.member_roles (member_id, role_key, scope_level) values ('${U(7)}','PRESIDENT_GENERAL','organization');
  insert into public.contributions (member_id, chapter_id, type, description, expected_amount, amount, received_on, recorded_by) values
    ('${U(1)}','${U(801)}','fine','A1 fine',12000,12000,'2026-02-01','${U(2)}'),
    ('${U(3)}','${U(801)}','fine','President fine',12000,12000,'2026-02-01','${U(2)}'),
    ('${U(6)}','${U(802)}','fine','B1 fine',10000,10000,'2026-02-01','${U(5)}');
`);

// Registration: every chapter has its fee and everyone in a chapter has paid it (members are active).
// Run again after creating people who should be active.
const registerAll = () =>
  db.exec(`update public.chapters set registration_fee = coalesce(registration_fee, 5000);
    insert into public.contributions (ledger, member_id, chapter_id, type, description, amount, received_on, recorded_by, registration_fee_year)
    select 'chapter', m.id, c.id, 'contribution', 'x', c.registration_fee, current_date, m.id, public.registration_year()
    from public.members m join public.chapters c on c.id = public.member_chapter(m.id)
    where c.registration_fee is not null and public.registration_due(m.id)`);
await registerAll();

// ── Harness ──
let pass = 0;
let fail = 0;
async function as(n, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${U(n)}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
}
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok ? "" : "  → " + detail}`);
};
const rows = async (sql) => (await db.query(sql)).rows;
const throws = async (sql) => {
  try {
    await db.query(sql);
    return null;
  } catch (e) {
    return e.message;
  }
};
const insertContribution = (member, chapter, recorder, desc = "x") =>
  `insert into public.contributions (member_id, chapter_id, type, description, expected_amount, amount, received_on, recorded_by) values ('${member}','${chapter}','fine','${desc}',5000,5000,'2026-09-01','${recorder}')`;

console.log("\nRLS behaviour");
await as(1, async () => {
  const r = await rows(`select description from public.contributions where registration_fee_year is null`);
  check("member sees only own contributions", r.length === 1 && r[0].description === "A1 fine", JSON.stringify(r));
  check("member sees only themselves in members", (await rows(`select id from public.members`)).length === 1);
  check("member cannot read audit log", (await rows(`select id from public.audit_logs`)).length === 0);
  check("member cannot record a contribution", !!(await throws(insertContribution(U(1), U(801), U(1)))));
  check("member cannot write audit rows", !!(await throws(`insert into public.audit_logs (action, entity_type) values ('CREATE','x')`)));
});
await as(3, async () => {
  check("president can VIEW chapter contributions", (await rows(`select id from public.contributions where registration_fee_year is null`)).length === 2);
  check("president cannot RECORD contributions", !!(await throws(insertContribution(U(1), U(801), U(3)))));
  const id = (await rows(`select id from public.contributions limit 1`))[0].id;
  check("president cannot VOID contributions", !!(await throws(`select public.void_contribution('${id}', 'not allowed here')`)));
  check("president cannot appoint another Chapter President", !!(await throws(`select public.assign_role('${U(1)}', 'CHAPTER_PRESIDENT')`)));
});
await as(4, async () => {
  const r = await rows(`select chapter_id from public.contributions where registration_fee_year is null`);
  check("a Regional Coordinator reads their region's chapter records", r.length > 0 && r.every((x) => x.chapter_id === U(801)), JSON.stringify(r));
  check("…but cannot record them", !!(await throws(insertContribution(U(1), U(801), U(4)))));
});
await as(2, async () => {
  check("fin sec A1 sees A1 records only", (await rows(`select id from public.contributions where chapter_id <> '${U(801)}'`)).length === 0 && (await rows(`select id from public.contributions where registration_fee_year is null`)).length === 2);
  check("fin sec A1 records in own chapter", !(await throws(insertContribution(U(1), U(801), U(2), "Levy"))), await throws(insertContribution(U(1), U(801), U(2), "Levy2")));
  check("fin sec A1 cannot record in B1", !!(await throws(insertContribution(U(6), U(802), U(2)))));
  check("fin sec cannot record as someone else", !!(await throws(insertContribution(U(1), U(801), U(3)))));
});
check("contribution delete blocked (trigger)", !!(await throws(`delete from public.contributions`)));
await as(2, async () => {
  const id = (await rows(`select id from public.contributions where description='Levy'`))[0].id;
  check("void requires a reason", !!(await throws(`select public.void_contribution('${id}', 'no')`)));
  const e = await throws(`select public.void_contribution('${id}', 'Duplicate entry')`);
  check("fin sec voids with reason", !e, e);
  check("amount cannot be edited in place", !!(await throws(`update public.contributions set amount = 1 where description='A1 fine'`)));
});
// Receipts in the payer's notifications.
{
  const levy = (await rows(`select reference from public.contributions where description = 'Levy'`))[0].reference;
  await as(1, async () => {
    const mine = await rows(`select title, body from public.notifications where type = 'receipt' and audience_member_id = '${U(1)}' order by created_at`);
    check("the payer gets the receipt in their notifications", mine.some((n) => n.title === `Receipt ${levy} · Fine` && n.body.includes("FCFA 5,000") && n.body.includes("A1")), JSON.stringify(mine));
    check("…and is told when it is voided, with the reason", mine.some((n) => n.title === `Cancelled: receipt ${levy}` && n.body.includes("Duplicate entry")), JSON.stringify(mine));
  });
  await as(3, async () => {
    check("nobody else sees someone's receipt", (await rows(`select id from public.notifications where title like '%${levy}%'`)).length === 0);
  });
  await as(2, async () => {
    check("only the database sends receipts", !!(await throws(`select public.contribution_receipt()`)));
  });
}
await as(5, async () => {
  check("fin sec B1 cannot see A1 records", (await rows(`select id from public.contributions where chapter_id='${U(801)}'`)).length === 0);
});
await as(4, async () => {
  check("coordinator no longer appoints chapter officers", !!(await throws(`select public.assign_role('${U(1)}', 'TREASURER')`)));
  check("coordinator no longer enrols members", !!(await throws(`select public.create_member('Coord Person', 'coord@x', null, '${U(801)}')`)));
});
await as(3, async () => {
  check("president cannot assign to self", !!(await throws(`select public.assign_role('${U(3)}', 'TREASURER')`)));
  let e = await throws(`select public.assign_role('${U(1)}', 'TREASURER')`);
  check("president appoints Treasurer in own chapter", !e, e);
  check("president cannot appoint in another chapter", !!(await throws(`select public.assign_role('${U(6)}', 'TREASURER')`)));
  check("the Chapter President no longer registers members", !!(await throws(`select public.create_member('By President', 'bypres@x', null, '${U(801)}')`)));
});
await as(2, async () => {
  const e = await throws(`select public.create_member('New Person', 'new@x', null, '${U(801)}')`);
  check("the Financial Secretary registers a member in their own chapter", !e, e);
  check("…but not in another chapter", !!(await throws(`select public.create_member('Other Person', 'other@x', null, '${U(802)}')`)));
  const fee = (await rows(`select c.amount, c.expected_amount, c.description, c.reference, c.registration_fee_year from public.contributions c
    join public.members m on m.id = c.member_id where m.email = 'new@x'`))[0];
  check("…recording the registration fee, paid in full, with a receipt", fee && Number(fee.amount) === 5000 && Number(fee.expected_amount) === 5000
    && fee.reference.startsWith("RC-") && fee.registration_fee_year === new Date().getFullYear(), JSON.stringify(fee));
  check("phone numbers take no letters", !!(await throws(`select public.create_member('Bad Phone', 'badphone@x', 'jk gt', '${U(801)}')`)));
  const ok = await throws(`select public.create_member('Good Phone', 'goodphone@x', '+237 6 77-12-34-56', '${U(801)}')`);
  check("…digits, spaces, hyphens and a leading + are fine", !ok, ok);
  check("a registration fee cannot be recorded outside registration", !!(await throws(`insert into public.contributions (member_id, chapter_id, type, description, amount, received_on, recorded_by, registration_fee_year)
    values ('${U(1)}', '${U(801)}', 'contribution', 'x', 5000, current_date, '${U(2)}', 2026)`)));
});
await as(1, async () => {
  check("new Treasurer gains VIEW_CONTRIBUTIONS immediately", (await rows(`select id from public.contributions where description = 'President fine'`)).length === 1);
});
await as(3, async () => {
  const roleRow = (await rows(`select id from public.member_roles where member_id='${U(1)}' and role_key='TREASURER'`))[0];
  const e = await throws(`select public.end_role('${roleRow.id}', 'Handover')`);
  check("president ends role with reason", !e, e);
  check("audit visible to president", (await rows(`select id from public.audit_logs`)).length > 0);
});
check("ended role cannot be revived", !!(await throws(`update public.member_roles set status='active', ended_at=null where role_key='TREASURER'`)));
await as(1, async () => {
  check("ex-Treasurer lost access immediately", (await rows(`select id from public.contributions where description = 'President fine'`)).length === 0);
});

console.log("\nChapters & President General");
const exco = JSON.stringify([
  { role_key: "CHAPTER_PRESIDENT", full_name: "Founding President", email: "founder@x" },
  { role_key: "FINANCIAL_SECRETARY", full_name: "Founding FinSec", email: "ffs@x" },
]);
await as(3, async () => {
  check("chapter president cannot create chapters", !!(await throws(`select public.create_chapter('Nope', 'Town', null, '${exco}'::jsonb)`)));
});
await as(7, async () => {
  check("President General cannot enrol local members", !!(await throws(`select public.create_member('PG Person', 'pg.person@x', null, '${U(801)}')`)));
  check("a chapter must start with a President", !!(await throws(`select public.create_chapter('No President', 'Town', null, '[{"role_key":"TREASURER","full_name":"T","email":"t@x"}]'::jsonb)`)));
  check("President General cannot create a chapter inside a region", !!(await throws(`select public.create_chapter('PG Regional', 'Town', '${U(901)}', '${exco}'::jsonb)`)));
  const direct = JSON.stringify([{ role_key: "CHAPTER_PRESIDENT", full_name: "Direct President", email: "direct@x" }]);
  check("President General cannot create a chapter outside any region either", !!(await throws(`select public.create_chapter('Direct Chapter', 'Abroad', null, '${direct}'::jsonb)`)));
  // Regions: the President General creates a region together with its coordinator.
  const newPerson = JSON.stringify({ full_name: "New Coordinator", email: "new.coord@x" });
  let er = await throws(`select public.create_region('Littoral', null, '${newPerson}'::jsonb)`);
  check("President General creates a region with a new Regional Coordinator", !er, er);
  const littoral = (await rows(`select id from public.regions where name = 'Littoral'`))[0]?.id;
  check("…who holds the office with no chapter yet", (await rows(`select m.id from public.members m join public.member_roles r on r.member_id = m.id where m.email = 'new.coord@x' and r.role_key = 'REGIONAL_COORDINATOR' and r.region_id = '${littoral}'`)).length === 1);
  check("a region cannot get a second coordinator this way", !!(await throws(`select public.appoint_region_coordinator('${littoral}', '${U(6)}')`)));
  er = await throws(`select public.create_region('North-West', '${U(6)}')`);
  check("…but not with a member of another region (a coordinator belongs to a chapter of their region)", !!er);
  er = await throws(`select public.create_region('North-West', null, '{"full_name":"NW Coordinator","email":"nw.coord@x"}'::jsonb)`);
  check("a new region gets a new person as its coordinator", !er, er);
  check("the President General cannot appoint themselves", !!(await throws(`select public.create_region('Self region', '${U(7)}')`)));
  const first = JSON.stringify([{ role_key: "CHAPTER_PRESIDENT", full_name: "First President", email: "region.first@x" }]);
  check("…nor create chapters inside a region", !!(await throws(`select public.create_chapter('PG in region', 'Town', '${littoral}', '${first}'::jsonb)`)));
  const e2 = await throws(`insert into public.notifications (type, title, body, scope_level, audience_role_keys, created_by) values ('message', 'To presidents', 'Hello', 'organization', array['CHAPTER_PRESIDENT'], '${U(7)}')`);
  check("President General messages all Chapter Presidents", !e2, e2);
});
await as(1, async () => {
  check("only the President General creates regions", !!(await throws(`select public.create_region('Centre', null, '{"full_name":"X Person","email":"xp@x"}'::jsonb)`)));
});
const nw = (await db.query(`select id from public.regions where name = 'North-West'`)).rows[0].id;
await db.exec(`insert into auth.users values ('${U(32)}'); update public.members set auth_user_id = '${U(32)}' where email = 'nw.coord@x';`);
await as(32, async () => {
  const e = await throws(`select public.create_chapter('Bamenda', 'Bamenda', '${nw}', '[{"role_key":"CHAPTER_PRESIDENT","full_name":"Bamenda President","email":"bda.pres@x"},{"role_key":"FINANCIAL_SECRETARY","full_name":"Bamenda FinSec","email":"bda.fs@x"}]'::jsonb)`);
  check("the new region's coordinator creates its chapters", !e, e);
});
// Everyone must belong to a chapter: Littoral's new coordinator has none. They may set up
// the region until its first chapter exists; from then on they can only join one.
await db.exec(`insert into auth.users values ('${U(30)}'); update public.members set auth_user_id = '${U(30)}' where email = 'new.coord@x';`);
const littoralId = (await rows(`select id from public.regions where name = 'Littoral'`))[0].id;
const littoralCoord = (await rows(`select id from public.members where email = 'new.coord@x'`))[0].id;
await as(30, async () => {
  const e = await throws(`select public.create_chapter('Douala', 'Douala', '${littoralId}', '[{"role_key":"CHAPTER_PRESIDENT","full_name":"Douala President","email":"dla.pres@x"},{"role_key":"FINANCIAL_SECRETARY","full_name":"Douala FinSec","email":"dla.fs@x"}]'::jsonb)`);
  check("a coordinator with no chapter creates their region's first chapter", !e, e);
  check("…then must join a chapter before anything else", (await rows(`select public.must_join_chapter('${littoralCoord}') as v`))[0].v === true);
  check("…so cannot create a second one", !!(await throws(`select public.create_chapter('Douala Two', 'Douala', '${littoralId}', '[{"role_key":"CHAPTER_PRESIDENT","full_name":"D2 President","email":"d2.pres@x"},{"role_key":"FINANCIAL_SECRETARY","full_name":"D2 FinSec","email":"d2.fs@x"}]'::jsonb)`)));
  const douala = (await rows(`select id from public.chapters where name = 'Douala'`))[0]?.id;
  check("…cannot even rename it", !!(await throws(`select public.update_chapter('${douala}', 'Douala Renamed', 'Douala')`)));
  const j = await throws(`select public.transfer_member('${littoralCoord}', '${douala}', 'Joined')`);
  check("…but joins it", !j, j);
  check("once in a chapter, setup powers return (registration still unpaid)", (await rows(`select public.must_join_chapter('${littoralCoord}') as v`))[0].v === false && (await rows(`select public.has_permission('CREATE_CHAPTER', 'region', '${littoralId}') as v`))[0].v === true);
});

// An existing member as founding President moves into the new chapter.
await db.exec(`insert into public.members (id, organization_id, full_name, email, member_number) select '${U(11)}', id, 'Spare Member A1', 'spare@x', 'N11' from public.organizations;
  insert into public.member_chapter_history (member_id, chapter_id) values ('${U(11)}', '${U(801)}');`);
await as(4, async () => {
  const none = "[]";
  const withFs = JSON.stringify([{ role_key: "FINANCIAL_SECRETARY", full_name: "Moved FinSec", email: "moved.fs@x" }]);
  check("a chapter needs a Financial Secretary", !!(await throws(`select public.create_chapter('A No FS', 'Town', '${U(901)}', '${none}'::jsonb, '${U(11)}')`)));
  const e = await throws(`select public.create_chapter('A Moved', 'Town', '${U(901)}', '${withFs}'::jsonb, '${U(11)}')`);
  check("a coordinator makes an existing member President of a new chapter", !e, e);
  check("…the member moves into it, keeping their history", (await db.query(`select count(*)::int n from public.member_chapter_history where member_id = '${U(11)}'`)).rows[0].n === 2);
  check("someone holding another chapter's office cannot be taken", !!(await throws(`select public.create_chapter('A Taken', 'Town', '${U(901)}', '${none}'::jsonb, '${U(2)}')`)));
  check("a chapter needs exactly one President", !!(await throws(`select public.create_chapter('A Two', 'Town', '${U(901)}', '[{"role_key":"CHAPTER_PRESIDENT","full_name":"Two Pres","email":"two@x"}]'::jsonb, '${U(1)}')`)));
});
await as(4, async () => {
  const e = await throws(`select public.create_chapter('New Chapter', 'New Town', '${U(901)}', '${exco}'::jsonb)`);
  check("Region A coordinator creates a chapter in Region A with its founding EXCO", !e, e);
  check("…but not a chapter outside any region", !!(await throws(`select public.create_chapter('Coord Direct', 'Town', null, '${exco.replace("founder@x", "f2@x").replace("ffs@x", "f3@x")}'::jsonb)`)));
});
const newChapter = (await db.query(`select id from public.chapters where name = 'New Chapter'`)).rows[0]?.id;
const founder = (await db.query(`select auth_user_id from public.members where email = 'founder@x'`)).rows[0];
await db.exec(`insert into auth.users values ('${U(8)}'); update public.members set auth_user_id = '${U(8)}' where email = 'founder@x';`);
await db.exec(`insert into auth.users values ('${U(13)}'); update public.members set auth_user_id = '${U(13)}' where email = 'ffs@x';`);
console.log("\nChapter registration");
check("founding officers are inactive until they pay", (await db.query(`select public.registration_due('${U(13)}') a, public.registration_due('${U(8)}') b`)).rows[0].a === true);
await as(13, async () => {
  check("a chapter without a registration amount cannot register anyone", !!(await throws(`select public.create_member('First Member', 'first@x', null, '${newChapter}')`)));
  let e = await throws(`select public.set_chapter_registration_fee('${newChapter}', 4000)`);
  check("the founding Financial Secretary sets the chapter's registration amount while unpaid", !e, e);
  e = await throws(`select public.create_member('First Member', 'first@x', null, '${newChapter}')`);
  check("the founding Financial Secretary registers members in the new chapter", !e, e);
  const reg = (email, amount) => `insert into public.contributions (member_id, chapter_id, type, description, amount, received_on, recorded_by, registration_fee_year)
    select m.id, '${newChapter}', 'contribution', 'x', ${amount}, current_date, public.current_member_id(), public.registration_year() from public.members m where m.email = '${email}'`;
  check("registration is the chapter's amount, in full", !!(await throws(reg("ffs@x", 1000))));
  e = await throws(reg("ffs@x", 4000));
  check("the Financial Secretary records their own registration and is active", !e && (await rows(`select public.registration_due(public.current_member_id()) d`))[0].d === false, e);
  check("…only once", !!(await throws(reg("ffs@x", 4000))));
  e = await throws(reg("founder@x", 4000));
  check("…and the founding President's", !e, e);
});
const firstPaid = (await db.query(`select c.amount, m.id from public.contributions c join public.members m on m.id = c.member_id where m.email = 'first@x' and c.registration_fee_year is not null`)).rows[0];
check("…the new member's registration is the chapter's amount", firstPaid && Number(firstPaid.amount) === 4000, JSON.stringify(firstPaid));
await as(8, async () => {
  check("the founding President cannot set the registration amount", !!(await throws(`select public.set_chapter_registration_fee('${newChapter}', 1)`)));
});
await as(2, async () => {
  check("another chapter's Financial Secretary cannot record its registration", !!(await throws(`insert into public.contributions (member_id, chapter_id, type, description, amount, received_on, recorded_by, registration_fee_year)
    values ('${firstPaid.id}', '${newChapter}', 'contribution', 'x', 4000, current_date, '${U(2)}', public.registration_year())`)));
});
await as(8, async () => {
  check("the founding President cannot register members", !!(await throws(`select public.create_member('Second Member', 'second@x', null, '${newChapter}')`)) && !!founder);
  check("founding President receives the group message", (await rows(`select id from public.notifications where title = 'To presidents'`)).length === 1);
});
await as(1, async () => {
  check("ordinary member does not receive the group message", (await rows(`select id from public.notifications where title = 'To presidents'`)).length === 0);
});
await as(3, async () => {
  const n = (await rows(`select id from public.notifications where title = 'To presidents'`))[0];
  const e = await throws(`insert into public.notification_reads (notification_id, member_id) values ('${n.id}', '${U(3)}')`);
  check("president marks the message read", !e, e);
});
const groupMsgId = (await db.query(`select id from public.notifications where title = 'To presidents'`)).rows[0].id;
await as(1, async () => {
  check("member cannot mark a message read that was not sent to them", !!(await throws(`insert into public.notification_reads (notification_id, member_id) values ('${groupMsgId}', '${U(1)}')`)));
});

console.log("\nForwarding as received");
const fwd = (by, id, { title = "To presidents", body = "Hello", scope = `'chapter', null, '${U(801)}'`, roleKeys = "null" } = {}) =>
  `insert into public.notifications (type, title, body, scope_level, region_id, chapter_id, audience_role_keys, created_by, forwarded_from, original_id, forward_note)
   values ('message', '${title}', '${body}', ${scope}, ${roleKeys}, '${by}', '${id}', '${id}', 'Please read')`;
await as(3, async () => {
  let e = await throws(fwd(U(3), groupMsgId));
  check("president forwards the message unchanged to own chapter", !e, e);
  check("altered text is rejected", !!(await throws(fwd(U(3), groupMsgId, { body: "Edited text" }))));
  check("altered subject is rejected", !!(await throws(fwd(U(3), groupMsgId, { title: "Different subject" }))));
  check("cannot forward outside own authority", !!(await throws(fwd(U(3), groupMsgId, { scope: `'chapter', null, '${U(802)}'` }))));
});
await as(1, async () => {
  check("chapter member receives the forward", (await rows(`select id from public.notifications where forwarded_from is not null`)).length === 1);
  check("ordinary member cannot forward", !!(await throws(fwd(U(1), groupMsgId))));
});
await as(4, async () => {
  check("coordinator cannot forward a message never received", !!(await throws(fwd(U(4), groupMsgId, { scope: `'region', '${U(901)}', null` }))));
});
console.log("\nDocuments & attachments");
const insertDoc = (by, { title, roleKeys = "null", attachment = false, scope = `'chapter', null, '${U(801)}'` }) =>
  `insert into public.documents (title, filename, category, storage_path, size_bytes, mime_type, scope_level, region_id, chapter_id, uploaded_by, audience_role_keys, is_attachment)
   values ('${title}', '${title}.pdf', 'reports', 'docs/${title}', 1000, 'application/pdf', ${scope}, '${by}', ${roleKeys}, ${attachment}) returning id`;
await as(3, async () => {
  const r = await db.query(insertDoc(U(3), { title: "treasury-notes", roleKeys: "array['FINANCIAL_SECRETARY']" })).catch((e) => ({ error: e.message }));
  check("president uploads a document for Financial Secretaries only", !r.error, r.error);
  check("president cannot upload outside own chapter", !!(await throws(insertDoc(U(3), { title: "elsewhere", scope: `'chapter', null, '${U(802)}'` }))));
});
await as(2, async () => {
  check("the Financial Secretary can see it", (await rows(`select id from public.documents where title = 'treasury-notes'`)).length === 1);
});
await as(1, async () => {
  check("an ordinary member cannot see it", (await rows(`select id from public.documents where title = 'treasury-notes'`)).length === 0);
  check("ordinary member cannot upload", !!(await throws(insertDoc(U(1), { title: "member-doc" }))));
});

// A document the President General shares with coordinators only (inserted directly).
const pgPrivateDocId = (await db.query(insertDoc(U(7), { title: "pg-private", roleKeys: "array['REGIONAL_COORDINATOR']", scope: `'organization', null, null` }))).rows[0].id;

// The President General sends a message to Chapter Presidents with an attachment.
let attachDocId, attachMsgId;
await as(7, async () => {
  attachDocId = (await db.query(insertDoc(U(7), { title: "budget-template", attachment: true, scope: `'organization', null, null` }))).rows[0].id;
  attachMsgId = (await db.query(`insert into public.notifications (type, title, body, scope_level, audience_role_keys, created_by) values ('message', 'Budget template', 'See attached', 'organization', array['CHAPTER_PRESIDENT'], '${U(7)}') returning id`)).rows[0].id;
  const e = await throws(`insert into public.notification_attachments values ('${attachMsgId}', '${attachDocId}')`);
  check("President General attaches own upload to a message", !e, e);
});
await as(3, async () => {
  check("the recipient (Chapter President) can open the attachment", (await rows(`select id from public.documents where id = '${attachDocId}'`)).length === 1);
  const fwdId = (await db.query(`insert into public.notifications (type, title, body, scope_level, chapter_id, created_by, forwarded_from, original_id) values ('message', 'Budget template', 'See attached', 'chapter', '${U(801)}', '${U(3)}', '${attachMsgId}', '${attachMsgId}') returning id`)).rows[0].id;
  let e = await throws(`insert into public.notification_attachments values ('${fwdId}', '${attachDocId}')`);
  check("a forward carries the original attachment", !e, e);
  e = await throws(`insert into public.notification_attachments values ('${fwdId}', '${pgPrivateDocId}')`);
  check("a forward cannot add someone else's document", !!e);
});
await as(1, async () => {
  check("after the forward, chapter members can open the attachment", (await rows(`select id from public.documents where id = '${attachDocId}'`)).length === 1);
});
await as(6, async () => {
  check("members of other chapters still cannot", (await rows(`select id from public.documents where id = '${attachDocId}'`)).length === 0);
});

console.log("\nCentral ledger");
// A Central Financial Secretary (member of B1).
await db.exec(`
  insert into auth.users values ('${U(9)}');
  insert into public.members (id, auth_user_id, organization_id, full_name, email, member_number)
    select '${U(9)}', '${U(9)}', id, 'Central FinSec', 'cfs@x', 'N9' from public.organizations;
  insert into public.member_chapter_history (member_id, chapter_id) values ('${U(9)}', '${U(802)}');
  insert into public.member_roles (member_id, role_key, scope_level) values ('${U(9)}', 'CENTRAL_FINANCIAL_SECRETARY', 'organization');
`);
await registerAll();
const centralInsert = ({ member = `'${U(3)}'`, chapter = U(801), type = "fine", desc = "Central fine", by = U(9) } = {}) =>
  `insert into public.contributions (ledger, member_id, chapter_id, type, description, expected_amount, amount, received_on, recorded_by) values ('central', ${member}, '${chapter}', '${type}', '${desc}', ${type === "fine" ? 50000 : "null"}, 50000, '2026-10-01', '${by}')`;
await as(9, async () => {
  let e = await throws(centralInsert());
  check("Central FinSec records a member's payment to the centre", !e, e);
  e = await throws(centralInsert({ member: `'${U(6)}'`, chapter: U(802), desc: "B1 member central fine" }));
  check("Central FinSec records another member's payment to the centre", !e, e);
  check("every payment comes from a member (no chapter payments)", !!(await throws(centralInsert({ member: "null", chapter: U(802), desc: "chapter payment" }))));
  check("Remittance is no longer a payment type", !!(await throws(centralInsert({ type: "remittance", desc: "old type" }))));
  check("Central FinSec cannot write to a chapter's ledger", !!(await throws(insertContribution(U(1), U(801), U(9), "Not hers"))));
  check("Central FinSec sees central and chapter records", (await rows(`select id from public.contributions where ledger = 'central'`)).length === 2 && (await rows(`select id from public.contributions where ledger = 'chapter'`)).length > 0);
  const chapterRow = (await rows(`select id from public.contributions where ledger = 'chapter' and status = 'recorded' limit 1`))[0].id;
  check("Central FinSec cannot void a chapter record", !!(await throws(`select public.void_contribution('${chapterRow}', 'Not her ledger')`)));
  const centralRow = (await rows(`select id from public.contributions where description = 'Central fine'`))[0].id;
  e = await throws(`select public.void_contribution('${centralRow}', 'Entered twice')`);
  check("Central FinSec voids a central record", !e, e);
});
await as(2, async () => {
  check("a chapter Financial Secretary cannot see central records", (await rows(`select id from public.contributions where ledger = 'central'`)).length === 0);
  check("…or record into the central ledger", !!(await throws(centralInsert({ by: U(2), desc: "Chapter tries central" }))));
});
await as(3, async () => {
  check("the paying member sees their own central record", (await rows(`select id from public.contributions where ledger = 'central'`)).length === 1);
  check("chapter auditors do not see central-ledger audit entries", (await rows(`select id from public.audit_logs where entity_type = 'contributions' and (new_values ->> 'ledger') = 'central'`)).length === 0);
});

console.log("\nCollections");
await as(2, async () => {
  check("chapter Financial Secretary sets up a chapter collection", !(await throws(`insert into public.collections (name, description, scope_level, chapter_id, executive_amount, member_amount, starts_on, created_by) values ('A1 pump fund', 'Repair the A1 pump', 'chapter', '${U(801)}', 10000, 5000, '2026-09-01', '${U(2)}')`)));
  check("…but not an organisation-wide one", !!(await throws(`insert into public.collections (name, description, scope_level, executive_amount, member_amount, starts_on, created_by) values ('Org fund', 'Org purpose', 'organization', 1000, 1000, '2026-09-01', '${U(2)}')`)));
});
await db.exec(`insert into public.collections (name, description, scope_level, chapter_id, executive_amount, member_amount, starts_on, created_by) values ('B1 hall fund', 'Repair the B1 hall', 'chapter', '${U(802)}', 20000, 15000, '2026-09-01', '${U(5)}')`);
const a1Fund = (await db.query(`select id from public.collections where name = 'A1 pump fund'`)).rows[0].id;
const b1Fund = (await db.query(`select id from public.collections where name = 'B1 hall fund'`)).rows[0].id;
const tagged = (col, desc, member = U(1), amount = 5000) =>
  `insert into public.contributions (member_id, chapter_id, type, description, amount, received_on, recorded_by, collection_id, reference, expected_amount) values ('${member}','${U(801)}','contribution','${desc}',${amount},'2026-09-15','${U(2)}','${col}', 'MY-OWN-REF', 1)`;
await as(2, async () => {
  check("a payment can be tagged with its chapter's collection", !(await throws(tagged(a1Fund, "Pump levy"))));
  check("…but not with another chapter's collection", !!(await throws(tagged(b1Fund, "Wrong fund"))));
});
check("the collection tag cannot be changed afterwards", !!(await throws(`update public.contributions set collection_id = null where collection_id = '${a1Fund}'`)));
await as(6, async () => {
  check("members of another chapter cannot see a chapter's collection", (await rows(`select id from public.collections where id = '${a1Fund}'`)).length === 0);
});

console.log("\nProjects, fines and receipt numbers");
{
  const pump = (await db.query(`select description, executive_amount, member_amount from public.collections where id = '${a1Fund}'`)).rows[0];
  const row = (await db.query(`select description, expected_amount, reference from public.contributions where collection_id = '${a1Fund}' and member_id = '${U(1)}'`)).rows[0];
  check("a contribution's description is its project's purpose (not the client's text)", row.description === pump.description, JSON.stringify(row));
  check("…its expected amount is the member rate", Number(row.expected_amount) === Number(pump.member_amount), JSON.stringify(row));
  check("…and its receipt number is generated, not taken from the client", /^RC-\d{4}-\d{5}$/.test(row.reference), row.reference);
}
await as(2, async () => {
  let e = await throws(tagged(a1Fund, "Executive pays", U(3), 10000));
  check("an executive contributes", !e, e);
  const exec = (await rows(`select expected_amount from public.contributions where collection_id = '${a1Fund}' and member_id = '${U(3)}'`))[0];
  check("…at the executive rate", Number(exec.expected_amount) === 10000, JSON.stringify(exec));
  check("a contribution must name a project", !!(await throws(`insert into public.contributions (member_id, chapter_id, type, description, amount, received_on, recorded_by) values ('${U(1)}','${U(801)}','contribution','No project',1000,'2026-09-15','${U(2)}')`)));
  check("a fine can never be part of a project", !!(await throws(`insert into public.contributions (member_id, chapter_id, type, description, expected_amount, amount, received_on, recorded_by, collection_id) values ('${U(1)}','${U(801)}','fine','Fine in a project',500,500,'2026-09-15','${U(2)}','${a1Fund}')`)));
  check("old payment types are gone", !!(await throws(`insert into public.contributions (member_id, chapter_id, type, description, amount, received_on, recorded_by) values ('${U(1)}','${U(801)}','dues','x',1000,'2026-09-15','${U(2)}')`)));
  check("a contribution of 0 is refused", !!(await throws(tagged(a1Fund, "Zero", U(1), 0))));
  check("no second (partial or extra) payment towards a project already paid", !!(await throws(tagged(a1Fund, "Again"))));
  check("a contribution below the amount due is refused (no partial payments)", !!(await throws(tagged(a1Fund, "Part", U(5), 1))));

  e = await throws(`insert into public.contributions (member_id, chapter_id, type, description, expected_amount, amount, received_on, recorded_by) values ('${U(1)}','${U(801)}','fine','Unpaid fine',3000,0,'2026-09-20','${U(2)}')`);
  check("a fine may be imposed unpaid", !e, e);
  check("…but never paid above the fine", !!(await throws(`insert into public.contributions (member_id, chapter_id, type, description, expected_amount, amount, received_on, recorded_by) values ('${U(1)}','${U(801)}','fine','Overpaid',1000,2000,'2026-09-20','${U(2)}')`)));
  check("…nor partly paid when imposed", !!(await throws(`insert into public.contributions (member_id, chapter_id, type, description, expected_amount, amount, received_on, recorded_by) values ('${U(1)}','${U(801)}','fine','Part paid',1000,500,'2026-09-20','${U(2)}')`)));
  const fine = (await rows(`select id from public.contributions where description = 'Unpaid fine'`))[0].id;
  const settle = (amount) =>
    `insert into public.contributions (member_id, chapter_id, type, description, amount, received_on, recorded_by, settles_fine_id) values ('${U(1)}','${U(801)}','fine','client text',${amount},'2026-09-25','${U(2)}','${fine}')`;
  check("a payment towards a fine cannot exceed what is owed", !!(await throws(settle(4000))));
  check("…nor pay only part of it", !!(await throws(settle(1000))));
  e = await throws(settle(3000));
  check("an imposed fine is paid later, in full", !e, e);
  check("…and only once", !!(await throws(settle(3000))));
  const paid = (await rows(`select description from public.contributions where settles_fine_id = '${fine}'`))[0];
  check("…and carries the fine's reason", paid.description === "Unpaid fine", JSON.stringify(paid));
  check("the fine cannot be voided while a payment towards it stands", !!(await throws(`select public.void_contribution('${fine}', 'Imposed in error')`)));
  check("receipt numbers cannot be rewritten", !!(await throws(`update public.contributions set reference = 'X' where id = '${fine}'`)));
});
await as(4, async () => {
  let e = await throws(`insert into public.collections (name, description, scope_level, region_id, executive_amount, member_amount, starts_on, created_by) values ('Region A day', 'Regional cultural day', 'region', '${U(901)}', 5000, 1500, '2026-10-01', '${U(4)}')`);
  check("a Regional Coordinator sets up a regional project", !e, e);
  check("…but not a project for a chapter in the region", !!(await throws(`insert into public.collections (name, description, scope_level, chapter_id, executive_amount, member_amount, starts_on, created_by) values ('A1 by coordinator', 'x purpose', 'chapter', '${U(801)}', 1, 1, '2026-10-01', '${U(4)}')`)));
});
await as(9, async () => {
  check("the Central Financial Secretary cannot set up a chapter's project", !!(await throws(`insert into public.collections (name, description, scope_level, chapter_id, executive_amount, member_amount, starts_on, created_by) values ('A1 by centre', 'x purpose', 'chapter', '${U(801)}', 1, 1, '2026-10-01', '${U(9)}')`)));
  check("a project needs an amount for at least one group", !!(await throws(`insert into public.collections (name, description, scope_level, executive_amount, member_amount, starts_on, created_by) values ('Zero fund', 'x purpose', 'organization', 0, 0, '2026-10-01', '${U(9)}')`)));
});

console.log("\nExpenses");
const spend = (level, by, desc, extra = "") => {
  const cols = level === "chapter" ? ", chapter_id" : level === "region" ? ", region_id" : "";
  const vals = level === "chapter" ? `, '${extra || U(801)}'` : level === "region" ? `, '${U(901)}'` : "";
  return `insert into public.expenses (scope_level${cols}, description, amount, spent_on, recorded_by, reference) values ('${level}'${vals}, '${desc}', 15000, '2026-09-20', '${by}', 'MY-OWN')`;
};
await as(2, async () => {
  const e = await throws(spend("chapter", U(2), "A1 refreshments"));
  check("chapter Financial Secretary records the chapter's spending", !e, e);
  check("…with a generated voucher number", /^PV-\d{4}-\d{5}$/.test((await rows(`select reference from public.expenses where description = 'A1 refreshments'`))[0].reference));
  check("…but not another chapter's", !!(await throws(spend("chapter", U(2), "B1 by A1", U(802)))));
});
await as(4, async () => {
  const e = await throws(spend("region", U(4), "Region hall hire"));
  check("Regional Coordinator records the region's spending", !e, e);
  check("…but not a chapter's", !!(await throws(spend("chapter", U(4), "A1 by coordinator"))));
  check("the coordinator sees the region's and its chapters' spending", (await rows(`select id from public.expenses`)).length === 2);
  const a1 = (await rows(`select id from public.expenses where description = 'A1 refreshments'`))[0].id;
  check("…but cannot void a chapter's expense", !!(await throws(`select public.void_expense('${a1}', 'Not the region''s')`)));
});
await as(9, async () => {
  check("the centre cannot record a chapter's spending", !!(await throws(spend("chapter", U(9), "A1 by centre"))));
  const e = await throws(spend("organization", U(9), "Central transport"));
  check("the Central Financial Secretary records central spending", !e, e);
  check("…and sees spending at every level", (await rows(`select id from public.expenses`)).length === 3);
});
await as(3, async () => {
  check("a Chapter President sees the chapter's spending only (not the region's)", (await rows(`select description from public.expenses`)).map((r) => r.description).join() === "A1 refreshments");
  check("…and cannot record any", !!(await throws(spend("chapter", U(3), "By president"))));
});
await as(1, async () => {
  check("an ordinary member sees no spending", (await rows(`select id from public.expenses`)).length === 0);
});
await as(5, async () => {
  check("another chapter's Financial Secretary sees none of it", (await rows(`select id from public.expenses`)).length === 0);
});
check("expense delete blocked (trigger)", !!(await throws(`delete from public.expenses`)));
check("expense amounts cannot be edited in place", !!(await throws(`update public.expenses set amount = 1`)));
await as(2, async () => {
  const id = (await rows(`select id from public.expenses where description = 'A1 refreshments'`))[0].id;
  check("voiding an expense needs a reason", !!(await throws(`select public.void_expense('${id}', 'no')`)));
  const e = await throws(`select public.void_expense('${id}', 'Entered twice')`);
  check("the Financial Secretary voids the chapter's expense", !e, e);
});

console.log("\nOne person, one post");
await as(3, async () => {
  check("a member holding a post cannot be given a second one", !!(await throws(`select public.assign_role('${U(2)}', 'TREASURER')`)));
});
check("…not even by writing directly to the table", !!(await throws(`insert into public.member_roles (member_id, role_key, scope_level, chapter_id) values ('${U(2)}', 'TREASURER', 'chapter', '${U(801)}')`)));
await as(3, async () => {
  const post = (await rows(`select id from public.member_roles where member_id = '${U(2)}' and status = 'active'`))[0].id;
  let e = await throws(`select public.end_role('${post}', 'Moving to Treasurer')`);
  check("the current post is ended first…", !e, e);
  e = await throws(`select public.assign_role('${U(2)}', 'TREASURER')`);
  check("…then the new post can be given", !e, e);
});

console.log("\nEditing regions and chapters; moving members");
await as(7, async () => {
  let e = await throws(`select public.update_region('${U(901)}', 'Region A (renamed)')`);
  check("the President General renames a region", !e, e);
  e = await throws(`select public.update_chapter('${U(802)}', 'B1 (no region)', 'New town')`);
  check("…and can edit any chapter's details", !e, e);
});
await as(4, async () => {
  check("a coordinator cannot rename regions", !!(await throws(`select public.update_region('${U(901)}', 'Mine now')`)));
  const e = await throws(`select public.update_chapter('${U(801)}', 'Chapter A1', 'Bamenda town')`);
  check("a coordinator edits a chapter in their region", !e, e);
  check("…but not one outside it", !!(await throws(`select public.update_chapter('${U(802)}', 'B1 (no region)', 'Elsewhere')`)));
});
check("chapter details were saved", (await db.query(`select location from public.chapters where id = '${U(801)}'`)).rows[0].location === "Bamenda town");
await db.exec(`insert into public.members (id, organization_id, full_name, email, member_number) select '${U(12)}', id, 'Mover Member', 'mover@x', 'N12' from public.organizations;
  insert into public.member_chapter_history (member_id, chapter_id) values ('${U(12)}', '${U(801)}');`);
const newChapterId = (await db.query(`select id from public.chapters where name = 'New Chapter'`)).rows[0].id;
await as(4, async () => {
  let e = await throws(`select public.transfer_member('${U(12)}', '${newChapterId}', 'Moved within the region')`);
  check("a coordinator moves a member to another chapter in their region", !e, e);
  check("…but not out of their region", !!(await throws(`select public.transfer_member('${U(12)}', '${U(802)}', 'Out')`)));
  check("a member holding a chapter post must give it up first", !!(await throws(`select public.transfer_member('${U(2)}', '${newChapterId}', 'With a post')`)));
});
await as(7, async () => {
  const e = await throws(`select public.transfer_member('${U(12)}', '${U(802)}', 'Moved to another region')`);
  check("the President General moves a member across regions", !e, e);
  check("nobody moves themselves between chapters", !!(await throws(`select public.transfer_member('${U(7)}', '${U(801)}', 'Self')`)));
});
// An unpaid fine blocks the next move until it is paid.
await db.exec(`insert into public.contributions (member_id, chapter_id, type, description, expected_amount, amount, received_on, recorded_by)
  values ('${U(12)}', '${U(802)}', 'fine', 'Unpaid fine', 1000, 0, current_date, '${U(5)}')`);
await as(7, async () => {
  check("a member who owes a fine cannot be moved", !!(await throws(`select public.transfer_member('${U(12)}', '${U(801)}', 'With a fine')`)));
});
const unpaid = (await db.query(`select id from public.contributions where member_id = '${U(12)}' and description = 'Unpaid fine'`)).rows[0].id;
await db.exec(`insert into public.contributions (member_id, chapter_id, type, description, amount, received_on, recorded_by, settles_fine_id)
  values ('${U(12)}', '${U(802)}', 'fine', 'x', 1000, current_date, '${U(5)}', '${unpaid}')`);
await as(7, async () => {
  const e = await throws(`select public.transfer_member('${U(12)}', '${U(801)}', 'Fine paid')`);
  check("…and can be once it is paid", !e, e);
});
check("the member's chapter history is kept", (await db.query(`select count(*)::int n from public.member_chapter_history where member_id = '${U(12)}'`)).rows[0].n === 4);
await as(1, async () => {
  check("an ordinary member cannot move anyone", !!(await throws(`select public.transfer_member('${U(12)}', '${U(801)}', 'No')`)));
});

console.log("\nCommittees");
// Projects come first (set up under Finances → Collections); committees are created for them.
await db.exec(`insert into public.collections (id, name, description, scope_level, region_id, executive_amount, member_amount, starts_on, created_by) values
  ('${U(951)}', 'National project', 'Example national purpose', 'organization', null, 20000, 10000, current_date, '${U(7)}'),
  ('${U(952)}', 'Region A project', 'Example regional purpose', 'region', '${U(901)}', 20000, 10000, current_date, '${U(4)}'),
  ('${U(953)}', 'Ended project', 'Example ended purpose', 'region', '${U(901)}', 20000, 10000, current_date - 30, '${U(4)}')`);
await db.exec(`update public.collections set ends_on = current_date - 1 where id = '${U(953)}'`);
const projectFor = { organization: U(951), region: U(952) };
const mk = (name, scope, region = "null", project = projectFor[scope]) =>
  `select public.create_committee('${name}', '${scope}', ${region === "null" ? "null" : `'${region}'`}, '${project}')`;
await as(1, async () => {
  check("an ordinary member cannot create a committee", !!(await throws(mk("C by member", "organization"))));
});
await as(4, async () => {
  const e = await throws(mk("Region A committee", "region", U(901)));
  check("a Regional Coordinator creates a committee for their region", !e, e);
  check("…but not a national one", !!(await throws(mk("C national by coord", "organization"))));
  check("…only for a project of their region's scope", !!(await throws(mk("C wrong project", "region", U(901), U(951)))));
  check("…not for a project that has ended", !!(await throws(mk("C ended project", "region", U(901), U(953)))));
  const e2 = await throws(mk("Region A phase 2", "region", U(901)));
  check("several committees can share a project", !e2, e2);
});
await as(7, async () => {
  const e = await throws(mk("National committee", "organization"));
  check("the President General creates a national committee", !e, e);
});
const regional = (await db.query(`select id, collection_id from public.committees where name = 'Region A committee'`)).rows[0];
const national = (await db.query(`select id from public.committees where name = 'National committee'`)).rows[0].id;
check("the committee carries out the chosen project, with its purpose", regional.collection_id === U(952) && (await db.query(`select purpose from public.committees where id = '${regional.id}'`)).rows[0].purpose === 'Example regional purpose');
await as(4, async () => {
  let e = await throws(`select public.add_committee_member('${regional.id}', '${U(1)}', 'PRESIDENT')`);
  check("the creator adds a member with a position", !e, e);
  check("…only from their region", !!(await throws(`select public.add_committee_member('${regional.id}', '${U(6)}')`)));
  check("…one holder per position", !!(await throws(`select public.add_committee_member('${regional.id}', '${U(3)}', 'PRESIDENT')`)));
  e = await throws(`select public.add_committee_member('${regional.id}', '${U(3)}', 'FINANCIAL_SECRETARY')`);
  check("a chapter officer can also hold a committee position", !e, e);
});
await as(7, async () => {
  check("only the creator adds members", !!(await throws(`select public.add_committee_member('${regional.id}', '${U(11)}')`)));
  check("one active committee per person", !!(await throws(`select public.add_committee_member('${national}', '${U(1)}')`)));
  check("the President General sees every committee", (await rows(`select id from public.committees`)).length === 3);
});
await as(5, async () => {
  check("others cannot see a committee at all", (await rows(`select id from public.committees`)).length === 0);
});
await as(1, async () => {
  check("a member sees their committee", (await rows(`select id from public.committees`)).length === 1);
  const r = await rows(`select public.send_committee_message('${regional.id}', 'creator', 'Report', 'Our progress report') as n`);
  check("the committee President writes to the creator", r[0].n === 1);
});
await as(3, async () => {
  check("…nobody else on the committee does", !!(await throws(`select public.send_committee_message('${regional.id}', 'creator', 'Report', 'Not the president')`)));
  const pay = (member) => `insert into public.contributions (ledger, committee_id, member_id, chapter_id, type, description, amount, received_on, recorded_by, collection_id)
    values ('committee', '${regional.id}', '${member}', public.member_chapter('${member}'), 'contribution', 'x', 10000, current_date, '${U(3)}', '${regional.collection_id}')`;
  check("a committee takes no payments directly (members pay their chapter)", !!(await throws(pay(U(1)))));
});
await as(4, async () => {
  check("the creator received the President's message", (await rows(`select id from public.notifications where title = '[Region A committee] Report'`)).length === 1);
});
// Chapter committees: created by the Chapter President for a chapter project; the region's coordinator sees them.
const mkChapter = (name, project = a1Fund) => `select public.create_committee('${name}', 'chapter', null, '${project}', '${U(801)}')`;
await as(2, async () => {
  check("a chapter Financial Secretary does not create committees", !!(await throws(mkChapter("A1 by FS"))));
});
await as(3, async () => {
  check("a Chapter President creates a chapter committee only for a chapter project", !!(await throws(mkChapter("A1 wrong project", U(952)))));
  const e = await throws(mkChapter("A1 pump committee"));
  check("a Chapter President creates a committee for their chapter's project", !e, e);
  const id = (await rows(`select id from public.committees where name = 'A1 pump committee'`))[0].id;
  const e2 = await throws(`select public.add_committee_member('${id}', '${U(2)}', 'PRESIDENT')`);
  check("…and adds the chapter's members", !e2, e2);
  check("…only the chapter's", !!(await throws(`select public.add_committee_member('${id}', '${U(6)}')`)));
});
await as(4, async () => {
  check("the coordinator of the chapter's region sees the chapter committee", (await rows(`select id from public.committees where name = 'A1 pump committee'`)).length === 1);
  const id = (await rows(`select id from public.committees where name = 'A1 pump committee'`))[0].id;
  check("…read only", !!(await throws(`select public.add_committee_member('${id}', '${U(11)}')`)));
});
await as(5, async () => {
  check("others still see no committee", (await rows(`select id from public.committees`)).length === 0);
});
// Committee meetings, minutes and documents (U(1) President, U(3) Financial Secretary, U(4) the creator as Secretary).
await as(4, async () => {
  const e = await throws(`select public.add_committee_member('${regional.id}', '${U(4)}', 'SECRETARY')`);
  check("the creator can join their committee as its Secretary", !e, e);
});
const meet = (who) => `select public.schedule_committee_meeting('${regional.id}', 'Planning by ${who}', now() + interval '1 day', 'Hall', '["Budget"]'::jsonb) as id`;
await as(3, async () => {
  check("a committee Financial Secretary cannot schedule meetings", !!(await throws(meet("FS"))));
});
let cmeeting;
await as(1, async () => {
  cmeeting = (await rows(meet("President")))[0].id;
  check("the committee President schedules a meeting", !!cmeeting);
  check("…and cannot write the minutes", !!(await throws(`select public.save_committee_minutes('${cmeeting}', 'Example minutes text')`)));
  const e = await throws(`select public.record_committee_attendance('${cmeeting}', '${U(3)}', 'present')`);
  check("the committee President records attendance", !e, e);
  check("…for the committee's members only", !!(await throws(`select public.record_committee_attendance('${cmeeting}', '${U(2)}', 'present')`)));
});
await as(3, async () => {
  check("members are told about the meeting", (await rows(`select id from public.notifications where title = '[Region A committee] Meeting: Planning by President'`)).length === 1);
  check("a committee Financial Secretary does not record attendance", !!(await throws(`select public.record_committee_attendance('${cmeeting}', '${U(3)}', 'late')`)));
});
await as(4, async () => {
  let e = await throws(`select public.save_committee_minutes('${cmeeting}', 'Example draft minutes', '["Buy from seller B"]'::jsonb)`);
  check("the committee Secretary saves draft minutes", !e, e);
});
await as(3, async () => {
  check("ordinary committee members do not see draft minutes", (await rows(`select id from public.committee_minutes`)).length === 0);
});
await as(1, async () => {
  check("the committee President sees the draft", (await rows(`select id from public.committee_minutes`)).length === 1);
});
await as(4, async () => {
  const e = await throws(`select public.save_committee_minutes('${cmeeting}', 'Example final minutes', '["Buy from seller B"]'::jsonb, true)`);
  check("the Secretary publishes the minutes", !e, e);
  check("published minutes are final", !!(await throws(`select public.save_committee_minutes('${cmeeting}', 'Changed afterwards')`)));
});
await as(3, async () => {
  check("everyone on the committee reads the published minutes", (await rows(`select id from public.committee_minutes`)).length === 1);
  const e = await throws(`insert into public.documents (title, filename, category, storage_path, size_bytes, mime_type, scope_level, region_id, uploaded_by, committee_id, committee_meeting_id)
    values ('Quote', 'quote.pdf', 'other', 'cmte/quote.pdf', 5, 'application/pdf', 'region', '${U(901)}', '${U(3)}', '${regional.id}', '${cmeeting}')`);
  check("the committee Financial Secretary shares a committee document", !e, e);
});
await as(7, async () => {
  check("the President General sees committee meetings, minutes and documents",
    (await rows(`select id from public.committee_meetings`)).length === 1 && (await rows(`select id from public.committee_minutes`)).length === 1
    && (await rows(`select id from public.documents where committee_id is not null`)).length === 1);
});
await as(2, async () => {
  check("outsiders see none of the committee's meetings, minutes or documents",
    (await rows(`select id from public.committee_meetings`)).length + (await rows(`select id from public.committee_minutes`)).length
    + (await rows(`select id from public.documents where committee_id is not null`)).length === 0);
  check("…and cannot add documents to it", !!(await throws(`insert into public.documents (title, filename, category, storage_path, size_bytes, mime_type, scope_level, region_id, uploaded_by, committee_id)
    values ('Mine', 'mine.pdf', 'other', 'cmte/mine.pdf', 5, 'application/pdf', 'region', '${U(901)}', '${U(2)}', '${regional.id}')`)));
});
// Project money: the chapter sends it to the project manager (who created the project), who gives it to the committee.
const sendMoney = (to, amount = 10000) => `insert into public.expenses (scope_level, chapter_id, description, amount, spent_on, recorded_by, sent_for_collection_id, sent_to)
  values ('chapter', '${U(801)}', 'Sent for Region A project', ${amount}, current_date, '${U(14)}', '${U(952)}', '${to}')`;
const give = (by, amount) => `insert into public.expenses (committee_id, scope_level, region_id, description, amount, spent_on, recorded_by)
  values ('${regional.id}', 'region', '${U(901)}', 'Disbursed', ${amount}, current_date, '${by}')`;
// A Financial Secretary for chapter A1 (the original one has since become its Treasurer).
await db.exec(`insert into auth.users values ('${U(14)}');
  insert into public.members (id, auth_user_id, organization_id, full_name, email, member_number) select '${U(14)}', '${U(14)}', id, 'Fin Sec A1 (new)', 'fs2@x', 'N14' from public.organizations;
  insert into public.member_chapter_history (member_id, chapter_id) values ('${U(14)}', '${U(801)}');
  insert into public.member_roles (member_id, role_key, scope_level, chapter_id) values ('${U(14)}', 'FINANCIAL_SECRETARY', 'chapter', '${U(801)}');`);
await registerAll();
await as(14, async () => {
  check("the chapter's money goes only to the project manager (who created the project)", !!(await throws(sendMoney(U(7)))));
  check("a chapter cannot send money it has not collected for the project", !!(await throws(sendMoney(U(4)))));
  await db.query(`insert into public.contributions (member_id, chapter_id, type, description, amount, received_on, recorded_by, collection_id)
    values ('${U(1)}', '${U(801)}', 'contribution', 'Region A project', 10000, current_date, '${U(14)}', '${U(952)}')`);
  const e = await throws(sendMoney(U(4)));
  check("the chapter Financial Secretary records project money sent to the project manager", !e, e);
  check("…as a chapter expense", (await rows(`select id from public.expenses where sent_to is not null`)).length === 1);
  check("…and no more than it collected and has not yet sent", !!(await throws(sendMoney(U(4), 1))));
});
await as(4, async () => {
  const r = await rows(`select title, body from public.notifications where type = 'receipt' and audience_member_id = '${U(4)}' and title like '%Project money'`);
  check("the project manager gets the receipt for money a chapter sends", r.length === 1 && r[0].body.includes("FCFA 10,000") && r[0].body.includes("A1"), JSON.stringify(r));
});
await as(3, async () => {
  check("the committee's Financial Secretary cannot record money given to it", !!(await throws(give(U(3), 1000))));
});
await as(4, async () => {
  const e = await throws(give(U(4), 6000));
  check("the project manager gives the committee money received for the project", !e, e);
  check("…but not more than they hold for the project", !!(await throws(give(U(4), 6000))));
});
await as(3, async () => {
  const r = await rows(`select title, body from public.notifications where type = 'receipt' and audience_member_id = '${U(3)}' and title like '%Region A committee'`);
  check("the committee's Financial Secretary gets the receipt for money given to it", r.length === 1 && r[0].body.includes("FCFA 6,000"), JSON.stringify(r));
});
// A project needs no committee for its money to be sent; a chapter project's money stays in the chapter.
await as(14, async () => {
  await db.query(`insert into public.contributions (member_id, chapter_id, type, description, amount, received_on, recorded_by, collection_id)
    values ('${U(1)}', '${U(801)}', 'contribution', 'National project', 10000, current_date, '${U(14)}', '${U(951)}')`);
  const national = (to) => `insert into public.expenses (scope_level, chapter_id, description, amount, spent_on, recorded_by, sent_for_collection_id, sent_to)
    values ('chapter', '${U(801)}', 'Sent for National project', 10000, current_date, '${U(14)}', '${U(951)}', '${to}')`;
  check("national project money does not go to whoever created the project…", !!(await throws(national(U(7)))));
  const e = await throws(national(U(9)));
  check("…but to the National Financial Secretary in office, with or without a committee", !e, e);
  check("…a chapter project's money is not sent anywhere", !!(await throws(`insert into public.expenses (scope_level, chapter_id, description, amount, spent_on, recorded_by, sent_for_collection_id, sent_to)
    values ('chapter', '${U(801)}', 'Sent for A1 pump', 1000, current_date, '${U(14)}', '${a1Fund}', '${U(2)}')`)));
  await db.query(`insert into public.contributions (member_id, chapter_id, type, description, amount, received_on, recorded_by, collection_id)
    values ('${U(2)}', '${U(801)}', 'contribution', 'A1 pump fund', 10000, current_date, '${U(14)}', '${a1Fund}')`);
});
const pumpCommittee = (await rows(`select id from public.committees where name = 'A1 pump committee'`))[0].id;
const givePump = (by, amount) => `insert into public.expenses (committee_id, scope_level, chapter_id, description, amount, spent_on, recorded_by)
  values ('${pumpCommittee}', 'chapter', '${U(801)}', 'Given to the pump committee', ${amount}, current_date, '${by}')`;
await as(3, async () => {
  check("the chapter committee's creator does not give it money", !!(await throws(givePump(U(3), 1000))));
});
await as(14, async () => {
  const e = await throws(givePump(U(14), 3000));
  check("the chapter's Financial Secretary gives a chapter committee money from the chapter's funds", !e, e);
  check("…no more than the chapter collected for the project and has not given out", !!(await throws(givePump(U(14), 10000000))));
  check("…and it shows in the chapter's expenses", (await rows(`select id from public.expenses where committee_id = '${pumpCommittee}'`)).length === 1);
  check("…and the chapter's Financial Secretary sees the committee", (await rows(`select id from public.committees where id = '${pumpCommittee}'`)).length === 1);
});
await as(4, async () => {
  check("the project manager sees the committee's books", (await rows(`select id from public.expenses where committee_id = '${regional.id}'`)).length === 1);
});
await as(2, async () => {
  check("a chapter officer outside the committee does not see its books", (await rows(`select id from public.expenses where committee_id = '${regional.id}'`)).length === 0);
});
await as(7, async () => {
  check("only the creator dissolves a committee", !!(await throws(`select public.dissolve_committee('${regional.id}', 'Not my committee')`)));
});
await as(4, async () => {
  check("dissolving needs a reason", !!(await throws(`select public.dissolve_committee('${regional.id}', '')`)));
  const e = await throws(`select public.dissolve_committee('${regional.id}', 'Purpose served')`);
  check("the creator dissolves the committee", !e, e);
});
await as(7, async () => {
  const e = await throws(`select public.add_committee_member('${national}', '${U(1)}')`);
  check("dissolving frees its members for other committees", !e, e);
});

console.log("\nSuspension");
await as(3, async () => {
  check("president cannot suspend themselves", !!(await throws(`select public.set_member_status('${U(3)}', 'suspended', 'Testing self')`)));
  check("president cannot suspend another chapter's member", !!(await throws(`select public.set_member_status('${U(5)}', 'suspended', 'Not my chapter')`)));
  check("a reason is required", !!(await throws(`select public.set_member_status('${U(2)}', 'suspended', '')`)));
  const e = await throws(`select public.set_member_status('${U(2)}', 'suspended', 'Pending chapter review')`);
  check("president suspends the chapter's Financial Secretary", !e, e);
  check("status cannot be changed by editing the record directly", !!(await throws(`update public.members set status = 'active' where id = '${U(2)}'`)));
});
await as(2, async () => {
  check("a suspended member sees nothing", (await rows(`select id from public.contributions`)).length === 0);
  check("a suspended member cannot act", !!(await throws(`insert into public.contributions (member_id, chapter_id, type, description, expected_amount, amount, received_on, recorded_by) values ('${U(1)}','${U(801)}','fine','x',5000,5000,'2026-09-01','${U(2)}')`)));
});
check("the suspended member's office is kept", (await db.query(`select 1 from public.member_roles where member_id = '${U(2)}' and status = 'active'`)).rows.length === 1);
await as(3, async () => {
  const e = await throws(`select public.set_member_status('${U(2)}', 'active', 'Review completed')`);
  check("president reinstates the member", !e, e);
});
await as(2, async () => {
  check("reinstated member regains access exactly as before", (await rows(`select id from public.contributions`)).length >= 2);
});
await as(1, async () => {
  check("ordinary member cannot suspend", !!(await throws(`select public.set_member_status('${U(6)}', 'suspended', 'Not allowed')`)));
});
await as(7, async () => {
  const e = await throws(`select public.set_member_status('${U(3)}', 'suspended', 'Example: referred to central EXCO')`);
  check("President General can suspend a Chapter President", !e, e);
});

console.log("\nOwn profile");
await as(6, async () => {
  const e = await throws(`select public.update_my_profile('Member B1 Renamed', 'mb.new@x', '+237 600 000 000')`);
  check("a member updates their own name, email and phone", !e, e);
  const me = (await rows(`select full_name, email, phone from public.members where id = '${U(6)}'`))[0];
  check("…and the change is saved", me.full_name === "Member B1 Renamed" && me.email === "mb.new@x", JSON.stringify(me));
  check("…but cannot take another member's email", !!(await throws(`select public.update_my_profile('Member B1', 'fs@x', null)`)));
  check("…nor change their membership number", !!(await throws(`update public.members set member_number = 'X1' where id = '${U(6)}'`)) || (await rows(`select member_number from public.members where id = '${U(6)}'`))[0].member_number === "N6");
});
check("a membership number cannot be changed, even directly", !!(await throws(`update public.members set member_number = 'X1' where id = '${U(6)}'`)));
check("…nor a member's ID", !!(await throws(`update public.members set id = gen_random_uuid() where id = '${U(5)}'`)));
check("profile changes are audited", (await db.query(`select 1 from public.audit_logs where entity_type = 'members' and new_values ->> 'full_name' = 'Member B1 Renamed'`)).rows.length === 1);

console.log("\nScheduling meetings");
const schedule = (scope, audience, title, by) => {
  const where = scope === "chapter" ? `'chapter', null, '${U(801)}'` : scope === "region" ? `'region', '${U(901)}', null` : `'organization', null, null`;
  return `insert into public.meetings (title, starts_at, location, scope_level, region_id, chapter_id, audience, created_by)
    values ('${title}', now() + interval '7 days', 'Hall', ${where}, '${audience}', '${U(by)}') returning id`;
};
await as(1, async () => {
  check("an ordinary member cannot schedule a meeting", !!(await throws(schedule("chapter", "all", "By member", 1))));
});
let chapterMeeting, execMeeting, excoMeeting, regionalMeeting;
// A1's President was suspended above; reinstate them for these checks.
await as(7, async () => {
  const e = await throws(`select public.set_member_status('${U(3)}', 'active', 'Reinstated for the meeting checks')`);
  check("the President General reinstates a Chapter President", !e, e);
});
// An ordinary member of A1 (no post), A1's Secretary and the National Secretary General, all registered.
await db.exec(`insert into auth.users values ('${U(15)}'), ('${U(16)}'), ('${U(17)}');
  insert into public.members (id, auth_user_id, organization_id, full_name, email, member_number)
    select x.id::uuid, x.id::uuid, o.id, x.n, x.e, x.num from public.organizations o,
    (values ('${U(15)}', 'Plain Member A1', 'plain@x', 'N15'), ('${U(16)}', 'Secretary A1', 'sec@x', 'N16'), ('${U(17)}', 'National Secretary General', 'nsg@x', 'N17')) x(id, n, e, num);
  insert into public.member_chapter_history (member_id, chapter_id) values ('${U(15)}', '${U(801)}'), ('${U(16)}', '${U(801)}'), ('${U(17)}', '${U(802)}');
  insert into public.member_roles (member_id, role_key, scope_level, chapter_id) values ('${U(16)}', 'CHAPTER_SECRETARY', 'chapter', '${U(801)}');
  insert into public.member_roles (member_id, role_key, scope_level) values ('${U(17)}', 'SECRETARY_GENERAL', 'organization');`);
await registerAll();
await as(3, async () => {
  check("a Chapter President no longer schedules meetings", !!(await throws(schedule("chapter", "all", "By president", 3))));
});
await as(16, async () => {
  chapterMeeting = (await rows(schedule("chapter", "all", "A1 general", 16)))[0]?.id;
  check("the Chapter Secretary schedules a chapter meeting", !!chapterMeeting);
  execMeeting = (await rows(schedule("chapter", "executives", "A1 EXCO", 16)))[0]?.id;
  check("…and an executives-only one", !!execMeeting);
  check("…but not one for chosen people", !!(await throws(schedule("chapter", "selected", "Chosen", 16))));
  check("…nor a regional meeting", !!(await throws(schedule("region", "all", "Not mine", 16))));
});
await as(7, async () => {
  check("the President General no longer schedules meetings", !!(await throws(schedule("organization", "all", "By PG", 7))));
});
const meetingDoc = (by, path) => `insert into public.documents (title, filename, category, storage_path, size_bytes, mime_type, scope_level, chapter_id, uploaded_by, meeting_id)
  values ('EXCO report', 'r.pdf', 'minutes', '${path}', 5, 'application/pdf', 'chapter', '${U(801)}', '${U(by)}', '${execMeeting}')`;
await as(3, async () => {
  check("a Chapter President does not add meeting documents", !!(await throws(meetingDoc(3, "mtg/by-president.pdf"))));
});
await as(16, async () => {
  const e = await throws(meetingDoc(16, "mtg/exco-report.pdf"));
  check("the Chapter Secretary adds a document to a meeting", !e, e);
});
await as(15, async () => {
  check("an ordinary member does not see an executives-only meeting's documents", (await rows(`select id from public.documents where storage_path = 'mtg/exco-report.pdf'`)).length === 0);
});
await as(3, async () => {
  check("…its executives do", (await rows(`select id from public.documents where storage_path = 'mtg/exco-report.pdf'`)).length === 1);
});
await as(17, async () => {
  excoMeeting = (await rows(schedule("organization", "selected", "National EXCO", 17)))[0]?.id;
  check("the National Secretary General schedules a national meeting for chosen people", !!excoMeeting);
  let e = await throws(`insert into public.meeting_invitees (meeting_id, member_id) values ('${excoMeeting}', '${U(4)}')`);
  check("…invites an executive", !e, e);
  check("…but not an ordinary member individually", !!(await throws(`insert into public.meeting_invitees (meeting_id, member_id) values ('${excoMeeting}', '${U(15)}')`)));
  e = await throws(`insert into public.meeting_invite_groups (meeting_id, chapter_id) values ('${excoMeeting}', '${U(802)}')`);
  check("…and calls a whole chapter", !e, e);
});
await as(5, async () => {
  check("every member of a chapter called to a national meeting sees it", (await rows(`select id from public.meetings where title = 'National EXCO'`)).length === 1);
});
// Meeting reminders: the day before and on the morning (07:00 WAT), each once, to the people it is for.
{
  await db.exec(`update public.meetings set starts_at = '2031-03-14 17:00+00' where id = '${execMeeting}'`);
  const sentFor = async () => (await rows(`select audience_member_id as who, title from public.notifications where link = '/dashboard/meetings/${execMeeting}' and type = 'meeting_reminder'`));
  check("moving a meeting starts its reminders over", (await rows(`select reminders_sent from public.meetings where id = '${execMeeting}'`))[0].reminders_sent.length === 0);
  await db.query(`select public.send_meeting_reminders('2031-03-12 12:00+00')`);
  check("no reminder two days before", (await sentFor()).length === 0);
  await db.query(`select public.send_meeting_reminders('2031-03-13 17:00+00')`);
  let sent = await sentFor();
  check("a reminder 24 hours before, to each executive", sent.length > 0 && sent.every((n) => n.title === "Tomorrow: A1 EXCO") && sent.some((n) => n.who === U(16)), JSON.stringify(sent));
  check("…not to ordinary members", !sent.some((n) => n.who === U(15)));
  const first = sent.length;
  await db.query(`select public.send_meeting_reminders('2031-03-13 20:00+00')`);
  check("…only once", (await sentFor()).length === first);
  await db.query(`select public.send_meeting_reminders('2031-03-14 05:30+00')`);
  check("no morning reminder before 07:00 WAT", (await sentFor()).length === first);
  await db.query(`select public.send_meeting_reminders('2031-03-14 06:00+00')`);
  sent = await sentFor();
  check("a morning reminder at 07:00 WAT on the day", sent.filter((n) => n.title === "Today: A1 EXCO").length === first, JSON.stringify(sent));
  await as(16, async () => {
    await throws(`update public.meetings set reminders_sent = '{}' where id = '${execMeeting}'`);
    check("only the reminder job sends reminders", !!(await throws(`select public.send_meeting_reminders()`)));
  });
  check("…and only it marks them sent", (await rows(`select reminders_sent from public.meetings where id = '${execMeeting}'`))[0].reminders_sent.join() === "day,morning");
}
// Decisions and their actions: recorded and marked complete by the Secretary only.
{
  let item;
  await as(3, async () => {
    check("a Chapter President does not record decisions", !!(await throws(`insert into public.decisions (meeting_id, text, recorded_by) values ('${execMeeting}', 'By the president', '${U(3)}')`)));
  });
  await as(16, async () => {
    const dec = (await rows(`insert into public.decisions (meeting_id, text, recorded_by) values ('${execMeeting}', 'Adopt the format', '${U(16)}') returning id`))[0].id;
    item = (await rows(`insert into public.action_items (decision_id, meeting_id, title, assignee_id, due_date) values ('${dec}', '${execMeeting}', 'Explain the absence', '${U(3)}', '2031-04-01') returning id`))[0]?.id;
    check("the Secretary records a decision with an action", !!item);
  });
  await as(3, async () => {
    check("the person responsible does not mark it complete", !!(await throws(`select public.complete_action_item('${item}')`)));
    await throws(`update public.action_items set status = 'completed' where id = '${item}'`);
  });
  check("…not even by editing it directly", (await rows(`select status from public.action_items where id = '${item}'`))[0].status === "pending");
  await as(16, async () => {
    const e = await throws(`select public.complete_action_item('${item}')`);
    check("the Secretary marks it complete", !e, e);
  });
}
await as(15, async () => {
  const seen = (await rows(`select title from public.meetings`)).map((x) => x.title);
  check("members see all-member meetings of their chapter", seen.includes("A1 general"), JSON.stringify(seen));
  check("…but not executives-only or selected meetings", !seen.includes("A1 EXCO") && !seen.includes("National EXCO"), JSON.stringify(seen));
});
await as(4, async () => {
  const seen = (await rows(`select title from public.meetings`)).map((x) => x.title);
  check("an invited executive sees the selected meeting", seen.includes("National EXCO"), JSON.stringify(seen));
  regionalMeeting = (await rows(schedule("region", "all", "Region A assembly", 4)))[0]?.id;
  check("the Regional Coordinator schedules a regional meeting", !!regionalMeeting);
  const e = await throws(`insert into public.meeting_minutes (meeting_id, status, discussion, recorded_by, published_at) values ('${regionalMeeting}', 'published', 'Example regional minutes', '${U(4)}', now())`);
  check("…and writes and publishes its minutes", !e, e);
});
await as(3, async () => {
  check("a Chapter President does not write minutes", !!(await throws(`insert into public.meeting_minutes (meeting_id, status, discussion, recorded_by) values ('${chapterMeeting}', 'draft', 'x', '${U(3)}')`)));
});
await as(15, async () => {
  check("members read the published minutes of meetings they were for", (await rows(`select id from public.meeting_minutes where meeting_id = '${regionalMeeting}'`)).length === 1);
});

console.log("\nYearly registration");
await as(1, async () => {
  check("only the President General starts a renewal", !!(await throws(`select public.start_registration_renewal(2027)`)));
});
await as(7, async () => {
  const e = await throws(`select public.start_registration_renewal(2027)`);
  check("the President General starts Registration 2027", !e, e);
  check("…once per year", !!(await throws(`select public.start_registration_renewal(2027)`)));
});
const due = async (n) => (await db.query(`select public.registration_due('${U(n)}') as d`)).rows[0].d;
check("everyone must pay again for 2027 — executives and the President General included", (await due(6)) && (await due(5)) && (await due(7)));
// B1's fee is 5,000 for everyone.
const pay = (member, amount, by = 5, type = "contribution") =>
  type === "fine"
    ? `insert into public.contributions (member_id, chapter_id, type, description, expected_amount, amount, received_on, recorded_by)
       values ('${U(member)}', '${U(802)}', 'fine', 'x', ${amount}, ${amount}, current_date, '${U(by)}')`
    : `insert into public.contributions (member_id, chapter_id, type, description, amount, received_on, recorded_by, registration_fee_year)
       values ('${U(member)}', '${U(802)}', 'contribution', 'x', ${amount}, current_date, '${U(by)}', 2027)`;
await as(5, async () => {
  check("an unpaid Financial Secretary sees no chapter records", (await rows(`select id from public.contributions where member_id <> '${U(5)}'`)).length === 0);
  check("…cannot record anything but registration", !!(await throws(pay(6, 500, 5, "fine"))));
  check("…and never part of the chapter's fee (no partial payments)", !!(await throws(pay(6, 2000))));
  check("a part-payment is refused, so the member stays inactive", await due(6));
  const e = await throws(pay(6, 5000));
  check("…but records a registration payment at the chapter's fee, the same for executives", !e, e);
});
check("paid in full: the member is active again, automatically", !(await due(6)));
await as(5, async () => {
  const e = await throws(pay(5, 5000));
  check("the Financial Secretary records their own fee", !e, e);
  check("…and is active again, seeing the chapter's records", (await rows(`select id from public.contributions where member_id <> '${U(5)}'`)).length > 0);
  check("…but cannot record a payment for another year", !!(await throws(pay(7, 5000).replace(", 2027)", ", 2026)"))));
});
await as(7, async () => {
  const e = await throws(`select public.cancel_registration_renewal('Started by mistake')`);
  check("the President General can still cancel the renewal while inactive", !e, e);
});
check("cancelling: the previous payments count again", !(await due(1)) && !(await due(7)));

check("audit log is append-only", !!(await throws(`delete from public.audit_logs`)));

console.log("\nA meeting is run at its own level");
{
  const changes = async (n) => (await as(n, () => rows(`update public.meetings set location = 'Moved' where id = '${chapterMeeting}' returning id`))).length;
  check("a Chapter President does not change a chapter meeting", (await changes(3)) === 0);
  check("…nor does the Regional Coordinator", (await changes(4)) === 0);
  check("…nor the President General", (await changes(7)) === 0);
  check("the Chapter Secretary does", (await changes(16)) === 1);
  check("the Regional Coordinator does not take a chapter meeting's attendance", !!(await as(4, () => throws(`insert into public.attendance (meeting_id, member_id, chapter_id, status, recorded_by) values ('${chapterMeeting}', '${U(15)}', '${U(801)}', 'present', '${U(4)}')`))));
  check("…but still sees the meeting", (await as(4, () => rows(`select id from public.meetings where id = '${chapterMeeting}'`))).length === 1);
}

console.log("\nA meeting that has started");
{
  await db.exec(`update public.meetings set starts_at = now() - interval '2 hours' where id = '${chapterMeeting}'`);
  check("its details can no longer be changed", !!(await as(16, () => throws(`update public.meetings set location = 'Elsewhere' where id = '${chapterMeeting}'`))));
  const e = await as(16, () => throws(`update public.meetings set status = 'cancelled', cancel_reason = 'Nobody could attend' where id = '${chapterMeeting}'`));
  check("cancelling it then records that it was not held", !e && (await rows(`select not_held from public.meetings where id = '${chapterMeeting}'`))[0].not_held === true, e);
}

console.log("\nAudit log follows the hierarchy");
{
  await db.exec(`insert into public.audit_logs (actor_member_id, actor_roles, action, entity_type, chapter_id, region_id, summary) values
    (null, array['MEMBER'], 'UPDATE', 'test', '${U(801)}', '${U(901)}', 'tst-member'),
    (null, array['CHAPTER_VICE_PRESIDENT'], 'UPDATE', 'test', '${U(801)}', '${U(901)}', 'tst-chapter-post'),
    (null, array['REGIONAL_COORDINATOR'], 'UPDATE', 'test', '${U(801)}', '${U(901)}', 'tst-regional'),
    (null, array['PRESIDENT_GENERAL'], 'UPDATE', 'test', '${U(801)}', '${U(901)}', 'tst-national'),
    (null, array['REGIONAL_COORDINATOR'], 'UPDATE', 'test', null, '${U(901)}', 'tst-region-level')`);
  const seen = async (n) => (await as(n, () => rows(`select summary from public.audit_logs where summary like 'tst-%' order by summary`))).map((r) => r.summary).join(",");
  check("a Chapter President sees only chapter-level actions in his chapter", (await seen(3)) === "tst-chapter-post,tst-member", await seen(3));
  check("a Regional Coordinator sees her region's chapter and regional actions, not national ones", (await seen(4)) === "tst-chapter-post,tst-member,tst-region-level,tst-regional", await seen(4));
  check("the President General sees everything", (await seen(7)) === "tst-chapter-post,tst-member,tst-national,tst-region-level,tst-regional", await seen(7));
}

console.log("\nDuties follow the post");
{
  // A delegation from A1's President to an ordinary member lasts only while the President holds the post.
  await db.exec(`insert into public.authority_delegations (granted_by, granted_to, scope_level, chapter_id, permissions)
    values ('${U(3)}', '${U(15)}', 'chapter', '${U(801)}', array['VIEW_MEMBER'])`);
  const viewsMembers = async () => (await as(15, () => rows(`select public.has_permission('VIEW_MEMBER', 'chapter', null, '${U(801)}') as v`)))[0].v;
  check("a delegation gives its powers while the grantor holds the post", (await viewsMembers()) === true);
  // A1's Secretary scheduled the executives' meeting; A1's coordinator runs the Region A committee.
  check("the Secretary sees the meeting they scheduled while in post", (await as(16, () => rows(`select id from public.meetings where id = '${execMeeting}'`))).length === 1);
  // Hand over: the President's, the Secretary's and the coordinator's posts end; the coordinator's goes to U(15).
  await db.exec(`update public.member_roles set status = 'ended', ended_at = now() where member_id in ('${U(3)}', '${U(16)}', '${U(4)}') and status = 'active';`);
  check("…and stops when the grantor leaves the post", (await viewsMembers()) === false);
  await db.exec(`insert into public.member_roles (member_id, role_key, scope_level, region_id) values ('${U(15)}', 'REGIONAL_COORDINATOR', 'region', '${U(901)}');`);
  check("a Secretary who leaves the post no longer sees the meeting they scheduled", (await as(16, () => rows(`select id from public.meetings where id = '${execMeeting}'`))).length === 0);
  await as(4, async () => {
    check("a former coordinator no longer runs the region's committee", !!(await throws(`select public.add_committee_member('${regional.id}', '${U(11)}')`)));
  });
  await as(15, async () => {
    check("the new coordinator sees the region's committee", (await rows(`select id from public.committees where id = '${regional.id}'`)).length === 1);
    check("…and the region's project money now goes to them", (await rows(`select public.project_manager('${U(952)}') as v`))[0].v === U(15));
  });
}

console.log("\nOne post, one holder");
{
  await db.exec(`insert into public.members (id, organization_id, full_name, email, member_number) select '${U(41)}', id, 'Spare Member Two', 'spare2@x', 'N41' from public.organizations;
    insert into public.member_chapter_history (member_id, chapter_id) values ('${U(41)}', '${U(801)}');
    insert into public.regions (id, organization_id, name) select '${U(960)}', id, 'Example new region' from public.organizations;`);
  await as(7, async () => {
    check("a regional role needs its region", !!(await throws(`select public.assign_role('${U(41)}', 'REGIONAL_COORDINATOR')`)));
    check("a region whose coordinator post is held cannot get another", !!(await throws(`select public.assign_role('${U(41)}', 'REGIONAL_COORDINATOR', '${U(901)}')`)));
    check("…nor a region outside the member's own", !!(await throws(`select public.assign_role('${U(41)}', 'REGIONAL_COORDINATOR', '${U(960)}')`)));
  });
  await db.exec(`insert into public.chapters (id, organization_id, region_id, name) select '${U(870)}', id, '${U(960)}', 'New region chapter' from public.organizations;
    update public.member_chapter_history set ended_at = now() where member_id = '${U(41)}' and ended_at is null;
    insert into public.member_chapter_history (member_id, chapter_id) values ('${U(41)}', '${U(870)}');`);
  await as(7, async () => {
    const e = await throws(`select public.assign_role('${U(41)}', 'REGIONAL_COORDINATOR', '${U(960)}')`);
    check("the President General appoints a member of the region's chapters as its coordinator", !e, e);
  });
  check("the same post can never be held twice", !!(await throws(`insert into public.member_roles (member_id, role_key, scope_level, region_id) values ('${U(1)}', 'REGIONAL_COORDINATOR', 'region', '${U(960)}')`)));
}

const actions = (await db.query(`select action, count(*)::int n from public.audit_logs group by 1 order by 1`)).rows;
console.log("\nAudit entries by action:", actions.map((a) => `${a.action}=${a.n}`).join(", "));
const sample = (await db.query(`select action, actor_roles, entity_type, chapter_id is not null as scoped, reason from public.audit_logs where action in ('VOID','REMOVE_ROLE')`)).rows;
console.log("Sample:", JSON.stringify(sample));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
