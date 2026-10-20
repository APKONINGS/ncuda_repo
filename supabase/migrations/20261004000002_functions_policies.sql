-- ════════════════════════════════════════════════════════════════════════
-- NCUDA — authorization functions, RLS policies, guarded RPCs, audit
--
-- Mirrors lib/permissions/engine.ts. If you change a rule here, change it
-- there too (and the tests in tests/permissions.test.ts).
-- ════════════════════════════════════════════════════════════════════════

-- ── Identity helpers ─────────────────────────────────────────────────────

-- The signed-in, ACTIVE member (null for anyone else).
create function public.current_member_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.id from public.members m
  where m.auth_user_id = auth.uid() and m.status = 'active'
$$;

create function public.member_chapter(p_member uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select h.chapter_id from public.member_chapter_history h
  where h.member_id = p_member and h.ended_at is null
$$;

create function public.chapter_region(p_chapter uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select c.region_id from public.chapters c where c.id = p_chapter
$$;

-- Does a grant at (g_level, g_region, g_chapter) reach target (t_level, t_region, t_chapter)?
-- Organisation ⊃ region ⊃ chapter.
-- ── Registration ─────────────────────────────────────────────────────────
-- Everyone (officers included) must belong to a chapter and pay its
-- registration fee there to be active. Before the first yearly renewal any
-- registration payment counts; once the President General starts the renewal
-- for a year, a payment for that year is needed.

-- The year a registration payment recorded now counts for.
create function public.registration_year()
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select year from public.registration_renewals order by opened_at desc limit 1), extract(year from current_date)::int)
$$;

-- Is this member inactive because they have not paid their registration (for the year in force)?
create function public.registration_due(p_member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.contributions f
    where f.member_id = p_member and f.registration_fee_year is not null and f.status = 'recorded'
      and (not exists (select 1 from public.registration_renewals) or f.registration_fee_year = public.registration_year())
  )
$$;

-- Everyone must belong to a chapter. Someone without one (the President
-- General or a Regional Coordinator at the start) may set things up only until
-- a chapter they could join exists — anywhere for the President General, in
-- their region for a coordinator. From then on they can only join one.
create function public.must_join_chapter(p_member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.member_chapter(p_member) is null and exists (
    select 1 from public.chapters c
    join public.member_roles mr on mr.member_id = p_member and mr.status = 'active'
    join public.role_permissions rp on rp.role_key = mr.role_key and rp.permission_key = 'TRANSFER_MEMBER'
    where mr.scope_level = 'organization'
       or (mr.scope_level = 'region' and mr.region_id = c.region_id)
       or (mr.scope_level = 'chapter' and mr.chapter_id = c.id)
  )
$$;

-- While unpaid, offices keep only their setup powers: the President General
-- creates regions and coordinators and manages registration; coordinators
-- create chapters; Financial Secretaries set the chapter's fee, register
-- members and record registration payments; anyone can join a chapter.
-- Someone who must join a chapter can only do that.
create function public.registration_allows(p_member uuid, p_perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.must_join_chapter(p_member) then p_perm = 'TRANSFER_MEMBER'
         else not public.registration_due(p_member)
           or p_perm in ('CREATE_REGION', 'CREATE_CHAPTER', 'CREATE_MEMBER', 'VIEW_MEMBER', 'RECORD_CONTRIBUTION', 'MANAGE_REGISTRATION', 'TRANSFER_MEMBER')
         end
$$;

create function public.scope_covers(
  g_level public.scope_level, g_region uuid, g_chapter uuid,
  t_level public.scope_level, t_region uuid, t_chapter uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select case g_level
    when 'organization' then true
    when 'region' then
      case t_level
        when 'organization' then false
        when 'region'       then t_region = g_region
        when 'chapter'      then public.chapter_region(t_chapter) = g_region
      end
    when 'chapter' then t_level = 'chapter' and t_chapter = g_chapter
  end
$$;

-- A delegation is lent from a post: it counts only while whoever granted it
-- still holds that power over the delegated scope (through an active role).
create function public.delegator_holds(p_grantor uuid, p_perm text, d_level public.scope_level, d_region uuid, d_chapter uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_roles mr
    join public.role_permissions rp on rp.role_key = mr.role_key
    where mr.member_id = p_grantor and mr.status = 'active' and rp.permission_key = p_perm
      and public.scope_covers(mr.scope_level, mr.region_id, mr.chapter_id, d_level, d_region, d_chapter)
  )
$$;

-- Core check: does the current member hold `p_perm` over the target scope?
create function public.has_permission(
  p_perm text, t_level public.scope_level, t_region uuid default null, t_chapter uuid default null
) returns boolean language sql stable security definer set search_path = '' as $$
  with me as (select public.current_member_id() as id)
  select (select id from me) is not null and public.registration_allows((select id from me), p_perm) and (
    -- via active roles
    exists (
      select 1
      from public.member_roles mr
      join public.role_permissions rp on rp.role_key = mr.role_key
      where mr.member_id = (select id from me)
        and mr.status = 'active'
        and rp.permission_key = p_perm
        and public.scope_covers(mr.scope_level, mr.region_id, mr.chapter_id, t_level, t_region, t_chapter)
    )
    -- via active, in-date delegations
    or exists (
      select 1 from public.authority_delegations d
      where d.granted_to = (select id from me)
        and d.status = 'active'
        and now() >= d.starts_at and (d.ends_at is null or now() < d.ends_at)
        and p_perm = any (d.permissions)
        and public.scope_covers(d.scope_level, d.region_id, d.chapter_id, t_level, t_region, t_chapter)
        and public.delegator_holds(d.granted_by, p_perm, d.scope_level, d.region_id, d.chapter_id)
    )
    -- member baseline
    or (p_perm = 'DOWNLOAD_DOCUMENT' and t_level = 'chapter' and t_chapter = public.member_chapter((select id from me)))
  )
$$;

-- Like has_permission() for a chapter, but only counting grants held BELOW
-- organisation level (chapter or region). Used for chapter-ledger writes:
-- each chapter's financial records are written by its own officers, and an
-- organisation-wide grant deliberately does not reach down into them.
create function public.has_local_permission(p_perm text, p_chapter uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with me as (select public.current_member_id() as id)
  select (select id from me) is not null and public.registration_allows((select id from me), p_perm) and (
    exists (
      select 1 from public.member_roles mr
      join public.role_permissions rp on rp.role_key = mr.role_key
      where mr.member_id = (select id from me) and mr.status = 'active' and rp.permission_key = p_perm
        and mr.scope_level <> 'organization'
        and public.scope_covers(mr.scope_level, mr.region_id, mr.chapter_id, 'chapter', null, p_chapter)
    )
    or exists (
      select 1 from public.authority_delegations dg
      where dg.granted_to = (select id from me) and dg.status = 'active'
        and now() >= dg.starts_at and (dg.ends_at is null or now() < dg.ends_at)
        and p_perm = any (dg.permissions) and dg.scope_level <> 'organization'
        and public.delegator_holds(dg.granted_by, p_perm, dg.scope_level, dg.region_id, dg.chapter_id)
        and public.scope_covers(dg.scope_level, dg.region_id, dg.chapter_id, 'chapter', null, p_chapter)
    )
  )
$$;

-- Holds `p_perm` at EXACTLY this scope — authority neither reaches down into
-- lower bodies nor up. Used for a body's own projects and spending: a
-- chapter's by the chapter, a region's by its coordinator, the
-- organisation's by central officers.
create function public.has_exact_permission(p_perm text, p_level public.scope_level, p_region uuid, p_chapter uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with me as (select public.current_member_id() as id)
  select (select id from me) is not null and public.registration_allows((select id from me), p_perm) and (
    exists (
      select 1 from public.member_roles mr
      join public.role_permissions rp on rp.role_key = mr.role_key
      where mr.member_id = (select id from me) and mr.status = 'active' and rp.permission_key = p_perm
        and mr.scope_level = p_level
        and mr.region_id is not distinct from p_region and mr.chapter_id is not distinct from p_chapter
    )
    or exists (
      select 1 from public.authority_delegations dg
      where dg.granted_to = (select id from me) and dg.status = 'active'
        and now() >= dg.starts_at and (dg.ends_at is null or now() < dg.ends_at)
        and p_perm = any (dg.permissions)
        and public.delegator_holds(dg.granted_by, p_perm, dg.scope_level, dg.region_id, dg.chapter_id)
        and dg.scope_level = p_level
        and dg.region_id is not distinct from p_region and dg.chapter_id is not distinct from p_chapter
    )
  )
$$;

-- Does the member hold any office? Projects expect a different amount from executives.
create function public.is_executive(p_member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.member_roles mr where mr.member_id = p_member and mr.status = 'active')
$$;

-- Next receipt (RC) or voucher (PV) number for the current year, e.g. RC-2026-00042.
create function public.next_reference(p_kind text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_year int := extract(year from now())::int; v_n int;
begin
  insert into public.reference_counters as rc (kind, year, last_value) values (p_kind, v_year, 1)
  on conflict (kind, year) do update set last_value = rc.last_value + 1
  returning last_value into v_n;
  return format('%s-%s-%s', p_kind, v_year, lpad(v_n::text, 5, '0'));
end $$;

-- Is a scope on the current member's own line (organisation → their region → their chapter)?
create function public.in_membership_line(t_level public.scope_level, t_region uuid, t_chapter uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with me as (select public.member_chapter(public.current_member_id()) as chapter)
  select (select chapter from me) is not null and not public.registration_due(public.current_member_id()) and case t_level
    when 'organization' then true
    when 'region'  then t_region = public.chapter_region((select chapter from me))
    when 'chapter' then t_chapter = (select chapter from me)
  end
$$;

create function public.current_role_keys()
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(mr.role_key order by r.rank), array['MEMBER'])
  from public.member_roles mr join public.roles r on r.key = mr.role_key
  where mr.member_id = public.current_member_id() and mr.status = 'active'
$$;

-- ── Audit ────────────────────────────────────────────────────────────────

create function public.write_audit(
  p_action public.audit_action, p_entity_type text, p_entity_id text,
  p_chapter uuid, p_region uuid, p_summary text,
  p_old jsonb default null, p_new jsonb default null, p_reason text default null
) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_member_id, actor_roles, action, entity_type, entity_id, chapter_id, region_id, summary, old_values, new_values, reason)
  values (public.current_member_id(), public.current_role_keys(), p_action, p_entity_type, p_entity_id,
          p_chapter, coalesce(p_region, public.chapter_region(p_chapter)), p_summary, p_old, p_new, p_reason)
$$;

-- Generic row-change auditing for the core tables.
create function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_action public.audit_action;
  v_chapter uuid := nullif(v_row ->> 'chapter_id', '')::uuid;
  v_region uuid := nullif(v_row ->> 'region_id', '')::uuid;
begin
  v_action := case tg_op when 'INSERT' then 'CREATE' when 'DELETE' then 'DELETE' else 'UPDATE' end;
  if tg_table_name = 'member_roles' then
    v_action := case when tg_op = 'INSERT' then 'ASSIGN_ROLE' else 'REMOVE_ROLE' end;
  elsif tg_table_name in ('contributions', 'expenses') and tg_op = 'UPDATE'
        and v_new ->> 'status' = 'voided' and v_old ->> 'status' = 'recorded' then
    v_action := 'VOID';
  elsif tg_table_name = 'documents' and tg_op = 'INSERT' then
    v_action := 'UPLOAD';
  end if;

  -- Central-ledger records are audited at organisation level only, so chapter
  -- auditors never see the centre's finances.
  if tg_table_name = 'contributions' and v_row ->> 'ledger' = 'central' then
    v_chapter := null;
    v_region := null;
  end if;

  -- Scope the entry so the right auditors can see it.
  if v_chapter is null and v_region is null and not (tg_table_name = 'contributions' and v_row ->> 'ledger' = 'central') then
    if v_row ? 'meeting_id' then
      select m.chapter_id, m.region_id into v_chapter, v_region from public.meetings m where m.id = (v_row ->> 'meeting_id')::uuid;
    elsif tg_table_name = 'members' then
      v_chapter := public.member_chapter((v_row ->> 'id')::uuid);
    end if;
  end if;

  perform public.write_audit(
    v_action, tg_table_name, v_row ->> 'id', v_chapter, v_region,
    null, v_old, v_new,
    coalesce(v_row ->> 'void_reason', v_row ->> 'end_reason')
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'members', 'member_chapter_history', 'member_roles', 'authority_delegations',
    'meetings', 'meeting_invitees', 'attendance', 'meeting_minutes', 'decisions', 'action_items',
    'contributions', 'collections', 'expenses', 'committees', 'committee_members', 'committee_meetings', 'committee_attendance', 'committee_minutes', 'documents', 'role_permissions'
  ] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- Explicit, client-initiated events (VIEW of sensitive data, DOWNLOAD, EXPORT, LOGIN, LOGOUT).
create function public.log_event(p_action public.audit_action, p_entity_type text, p_entity_id text, p_chapter uuid, p_summary text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_member_id() is null then raise exception 'not signed in'; end if;
  if p_action not in ('VIEW', 'DOWNLOAD', 'EXPORT', 'LOGIN', 'LOGOUT') then raise exception 'use the dedicated function for %', p_action; end if;
  perform public.write_audit(p_action, p_entity_type, p_entity_id, p_chapter, null, p_summary);
end $$;

-- ── Immutability guards ──────────────────────────────────────────────────

create function public.forbid_change()
returns trigger language plpgsql as $$
begin
  raise exception '% on %.% is not permitted — history is preserved', tg_op, tg_table_schema, tg_table_name;
end $$;

create trigger audit_logs_append_only before update or delete on public.audit_logs for each row execute function public.forbid_change();
create trigger member_roles_no_delete before delete on public.member_roles for each row execute function public.forbid_change();
create trigger chapter_history_no_delete before delete on public.member_chapter_history for each row execute function public.forbid_change();
create trigger contributions_no_delete before delete on public.contributions for each row execute function public.forbid_change();

-- Contributions: only recorded → voided, with reason. Corrections = void + re-record.
create function public.guard_contribution_update()
returns trigger language plpgsql as $$
begin
  if old.status = 'voided' then raise exception 'voided records cannot be changed'; end if;
  if (new.ledger, new.member_id, new.chapter_id, new.amount, new.expected_amount, new.received_on, new.type, new.collection_id,
      new.settles_fine_id, new.description, new.reference, new.recorded_by, new.recorded_at)
     is distinct from (old.ledger, old.member_id, old.chapter_id, old.amount, old.expected_amount, old.received_on, old.type, old.collection_id,
      old.settles_fine_id, old.description, old.reference, old.recorded_by, old.recorded_at) then
    raise exception 'financial values cannot be edited in place — void the record and record a correction';
  end if;
  return new;
end $$;
create trigger contributions_guard before update on public.contributions for each row execute function public.guard_contribution_update();

-- New payment records: the receipt number, and the description and expected
-- amount, are set here from the project or fine — never taken from the client.
-- There are no partial payments: a contribution is the full amount due for its
-- project (once per member and project); a fine is paid in full when imposed,
-- or imposed unpaid (0) and later paid in one full payment.
create function public.prepare_contribution()
returns trigger language plpgsql security definer set search_path = '' as $$
declare col public.collections; f public.contributions; v_balance bigint; v_fee bigint;
begin
  new.reference := public.next_reference('RC');
  if new.registration_fee_year is not null then
    -- Registration: at the member's own chapter, at the chapter's fee, once for the year in force.
    if new.ledger <> 'chapter' or new.collection_id is not null or new.type <> 'contribution' then
      raise exception 'registration is paid at the member''s chapter';
    end if;
    if new.chapter_id is distinct from public.member_chapter(new.member_id) then
      raise exception 'registration is paid at the member''s own chapter';
    end if;
    select registration_fee into v_fee from public.chapters where id = new.chapter_id;
    if v_fee is null then raise exception 'this chapter''s registration amount has not been set yet'; end if;
    if new.amount <> v_fee then raise exception 'registration is the chapter''s amount (%)', v_fee; end if;
    if new.registration_fee_year <> public.registration_year() then
      raise exception 'registration is recorded for %', public.registration_year();
    end if;
    if not public.registration_due(new.member_id) then raise exception 'this member has already paid their registration'; end if;
    new.description := 'Registration fee ' || new.registration_fee_year;
    new.expected_amount := v_fee;
  elsif new.type = 'contribution' then
    select * into col from public.collections where id = new.collection_id;
    if not found then raise exception 'choose the project this contribution is for'; end if;
    new.description := col.description;
    new.expected_amount := case when public.is_executive(new.member_id) then col.executive_amount else col.member_amount end;
    if new.expected_amount <= 0 then raise exception 'nothing is due from this member for this project'; end if;
    if new.amount <> new.expected_amount then raise exception 'a contribution is always the full amount due (%)', new.expected_amount; end if;
    if exists (select 1 from public.contributions c where c.member_id = new.member_id and c.collection_id = new.collection_id
               and c.type = 'contribution' and c.status = 'recorded') then
      raise exception 'this member has already paid this project';
    end if;
  elsif new.type = 'fine' and new.settles_fine_id is not null then
    select * into f from public.contributions where id = new.settles_fine_id for update;
    if not found or f.type <> 'fine' or f.settles_fine_id is not null or f.status <> 'recorded'
       or f.member_id is distinct from new.member_id or f.ledger <> new.ledger then
      raise exception 'that fine cannot be paid here';
    end if;
    v_balance := coalesce(f.expected_amount, f.amount) - f.amount
      - coalesce((select sum(c.amount) from public.contributions c where c.settles_fine_id = f.id and c.status = 'recorded'), 0);
    if v_balance <= 0 then raise exception 'this fine is already paid'; end if;
    if new.amount <> v_balance then raise exception 'a fine is paid in full (%)', v_balance; end if;
    new.description := f.description;
    new.expected_amount := null;
  elsif new.type = 'fine' then
    if new.expected_amount is null or new.expected_amount <= 0 then raise exception 'enter the fine imposed'; end if;
    if new.amount not in (0, new.expected_amount) then raise exception 'a fine is either paid in full now or recorded unpaid'; end if;
  end if;
  return new;
end $$;
create trigger contributions_prepare before insert on public.contributions for each row execute function public.prepare_contribution();

-- Expenses: voucher numbers are generated; only recorded → voided, values locked.
-- Project money: a chapter sends it to the creator of the project's (earliest
-- active) committee, and no more than it has collected for the project and
-- not yet sent; the creator gives committees no more than they hold for the
-- project (received from chapters − already given).
-- Receipts in the payer's notifications: every payment recorded for a member
-- (registration, contribution, fine) sends its receipt; a fine imposed to be
-- paid later sends a notice of what is owed; a voided record tells the payer
-- it was cancelled, and why. Committee ledger entries are not payments by members.
create function public.contribution_receipt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_money text := 'FCFA ' || to_char(case when new.amount = 0 then coalesce(new.expected_amount, 0) else new.amount end, 'FM999G999G999G999');
  v_kind text := case when new.registration_fee_year is not null then 'Registration ' || new.registration_fee_year
                      when new.type = 'fine' then 'Fine' else 'Contribution' end;
  v_for text := coalesce((select c.name from public.collections c where c.id = new.collection_id and new.registration_fee_year is null), new.description);
  v_where text := case when new.ledger = 'central' then 'NCUDA central' else coalesce((select name from public.chapters where id = new.chapter_id), 'your chapter') end;
  v_title text;
  v_body text;
begin
  if new.ledger = 'committee' then return new; end if;
  if tg_op = 'INSERT' and new.status = 'recorded' then
    if new.type = 'fine' and new.amount = 0 then
      v_title := 'Fine imposed · ' || v_money;
      v_body := v_where || ' recorded a fine of ' || v_money || ' for: ' || new.description || '. It is to be paid in full to the Financial Secretary. Reference ' || new.reference || '.';
    else
      v_title := 'Receipt ' || new.reference || ' · ' || v_kind;
      v_body := 'Received ' || v_money || ' from you on ' || to_char(new.received_on, 'DD Mon YYYY') || ' for: ' || v_for || '. Paid in full to ' || v_where
                || '. Keep the receipt number ' || new.reference || ' for your records.';
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'recorded' and new.status = 'voided' then
    v_title := 'Cancelled: ' || case when new.amount = 0 then 'fine ' else 'receipt ' end || new.reference;
    v_body := 'The ' || lower(v_kind) || ' record ' || new.reference || ' (' || v_money || ', ' || v_for || ') was cancelled. Reason: ' || coalesce(new.void_reason, '—')
              || '. If you think this is wrong, please contact your Financial Secretary.';
  else
    return new;
  end if;
  insert into public.notifications (type, title, body, audience_member_id, link, created_by)
  values ('receipt', v_title, v_body, new.member_id, '/dashboard/finances?tab=mine', coalesce(new.voided_by, new.recorded_by));
  return new;
end $$;
revoke all on function public.contribution_receipt() from public, anon, authenticated;
create trigger contributions_receipt after insert or update of status on public.contributions
  for each row execute function public.contribution_receipt();

-- Project money a chapter sends to the project manager (whoever created the
-- project): they get the receipt in their notifications, and are
-- told, with the reason, if the chapter voids it.
create function public.project_money_receipt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_money text := 'FCFA ' || to_char(new.amount, 'FM999G999G999G999');
  v_project text := coalesce((select name from public.collections where id = new.sent_for_collection_id), 'the project');
  v_from text := coalesce((select name from public.chapters where id = new.chapter_id), 'the chapter');
  v_title text;
  v_body text;
begin
  -- Money the project manager gives a committee: its Financial Secretary (otherwise President, Vice President or Treasurer) gets the receipt.
  if new.committee_id is not null then
    if not (tg_op = 'INSERT' and new.status = 'recorded') and not (tg_op = 'UPDATE' and old.status = 'recorded' and new.status = 'voided') then return new; end if;
    insert into public.notifications (type, title, body, audience_member_id, link, created_by)
    select 'receipt',
           case when new.status = 'voided' then 'Cancelled: receipt ' || new.reference else 'Receipt ' || new.reference || ' · ' || c.name end,
           case when new.status = 'voided'
                then 'The record of ' || v_money || ' given to “' || c.name || '” (' || new.reference || ') was cancelled by the project manager. Reason: ' || coalesce(new.void_reason, '—') || '.'
                else 'Received ' || v_money || ' for “' || c.name || '” on ' || to_char(new.spent_on, 'DD Mon YYYY') || ' from the project manager. Keep the voucher number ' || new.reference || ' for your records.' end,
           k.member_id, '/dashboard/committees/' || c.id, coalesce(new.voided_by, new.recorded_by)
    from public.committees c
    cross join lateral (
      select m.member_id from public.committee_members m
      where m.committee_id = c.id and m.ended_at is null and m.position in ('FINANCIAL_SECRETARY', 'PRESIDENT', 'VICE_PRESIDENT', 'TREASURER')
      order by array_position(array['FINANCIAL_SECRETARY', 'PRESIDENT', 'VICE_PRESIDENT', 'TREASURER']::public.committee_position[], m.position)
      limit 1
    ) k
    where c.id = new.committee_id;
    return new;
  end if;
  if new.sent_to is null then return new; end if;
  if tg_op = 'INSERT' and new.status = 'recorded' then
    v_title := 'Receipt ' || new.reference || ' · Project money';
    v_body := 'Received ' || v_money || ' from ' || v_from || ' on ' || to_char(new.spent_on, 'DD Mon YYYY') || ' for the project “' || v_project
              || '”. Keep the voucher number ' || new.reference || ' for your records.';
  elsif tg_op = 'UPDATE' and old.status = 'recorded' and new.status = 'voided' then
    v_title := 'Cancelled: receipt ' || new.reference;
    v_body := v_from || '''s record of ' || v_money || ' sent to you for “' || v_project || '” (' || new.reference || ') was cancelled. Reason: '
              || coalesce(new.void_reason, '—') || '. It no longer counts towards what you hold for the project.';
  else
    return new;
  end if;
  insert into public.notifications (type, title, body, audience_member_id, link, created_by)
  values ('receipt', v_title, v_body, new.sent_to, '/dashboard/committees', coalesce(new.voided_by, new.recorded_by));
  return new;
end $$;
revoke all on function public.project_money_receipt() from public, anon, authenticated;

-- A project's manager, who receives and holds its money — the post, not whoever
-- created it: the National Financial Secretary in office for a national project,
-- the region's Regional Coordinator in office for a regional one; none for a
-- chapter project (its money stays in the chapter, with its Financial Secretary).
create function public.project_manager(p_collection uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select case col.scope_level
    when 'organization' then (select mr.member_id from public.member_roles mr
                              where mr.role_key = 'CENTRAL_FINANCIAL_SECRETARY' and mr.status = 'active' and mr.scope_level = 'organization'
                              order by mr.assigned_at desc limit 1)
    when 'region' then (select mr.member_id from public.member_roles mr
                        where mr.role_key = 'REGIONAL_COORDINATOR' and mr.status = 'active' and mr.scope_level = 'region' and mr.region_id = col.region_id
                        order by mr.assigned_at desc limit 1)
  end
  from public.collections col where col.id = p_collection
$$;

create function public.prepare_expense()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_col uuid; v_held bigint;
begin
  if new.sent_for_collection_id is not null then
    -- Project money goes to the project manager: the National Financial Secretary in office for a
    -- national project, whoever created a regional one. A chapter project's money stays in the chapter.
    if not exists (select 1 from public.collections col where col.id = new.sent_for_collection_id
                   and col.scope_level <> 'chapter'
                   and public.scope_covers(col.scope_level, col.region_id, col.chapter_id, 'chapter', null, new.chapter_id)
                   and (col.ends_on is null or col.ends_on >= current_date)
                   and new.sent_to = public.project_manager(col.id)) then
      raise exception 'project money goes to the project manager (the National Financial Secretary for a national project)';
    end if;
    select coalesce((select sum(amount) from public.contributions where ledger = 'chapter' and chapter_id = new.chapter_id
                     and collection_id = new.sent_for_collection_id and type = 'contribution' and status = 'recorded'), 0)
         - coalesce((select sum(amount) from public.expenses where chapter_id = new.chapter_id
                     and sent_for_collection_id = new.sent_for_collection_id and status = 'recorded'), 0)
      into v_held;
    if new.amount > v_held then raise exception 'that is more than the chapter has collected for this project and not yet sent (%)', v_held; end if;
  end if;
  if new.committee_id is not null then
    select collection_id into v_col from public.committees where id = new.committee_id;
    select case when col.scope_level = 'chapter'
             then coalesce((select sum(amount) from public.contributions where ledger = 'chapter' and chapter_id = col.chapter_id
                            and collection_id = col.id and type = 'contribution' and status = 'recorded'), 0)
             else coalesce((select sum(amount) from public.expenses where sent_for_collection_id = col.id and status = 'recorded'), 0)
           end
         - coalesce((select sum(e.amount) from public.expenses e join public.committees c on c.id = e.committee_id
                     where c.collection_id = col.id and e.status = 'recorded'), 0)
      into v_held
    from public.collections col where col.id = v_col;
    if new.amount > v_held then raise exception 'that is more than the project has not yet given to its committees (%)', v_held; end if;
  end if;
  new.reference := public.next_reference('PV');
  return new;
end $$;
create trigger expenses_prepare before insert on public.expenses for each row execute function public.prepare_expense();
create trigger expenses_no_delete before delete on public.expenses for each row execute function public.forbid_change();
create function public.guard_expense_update()
returns trigger language plpgsql as $$
begin
  if old.status = 'voided' then raise exception 'voided records cannot be changed'; end if;
  if (new.scope_level, new.region_id, new.chapter_id, new.description, new.paid_to, new.amount, new.spent_on, new.reference, new.recorded_by, new.recorded_at,
      new.committee_id, new.sent_for_collection_id, new.sent_to)
     is distinct from (old.scope_level, old.region_id, old.chapter_id, old.description, old.paid_to, old.amount, old.spent_on, old.reference, old.recorded_by, old.recorded_at,
      old.committee_id, old.sent_for_collection_id, old.sent_to) then
    raise exception 'expenses cannot be edited in place — void the record and record a correction';
  end if;
  return new;
end $$;
create trigger expenses_guard before update on public.expenses for each row execute function public.guard_expense_update();
create trigger expenses_project_money_receipt after insert or update of status on public.expenses
  for each row execute function public.project_money_receipt();

-- Role assignments: only active → ended.
create function public.guard_member_role_update()
returns trigger language plpgsql as $$
begin
  if old.status = 'ended' then raise exception 'ended role assignments cannot be changed'; end if;
  if (new.member_id, new.role_key, new.scope_level, new.region_id, new.chapter_id, new.assigned_by, new.assigned_at)
     is distinct from (old.member_id, old.role_key, old.scope_level, old.region_id, old.chapter_id, old.assigned_by, old.assigned_at) then
    raise exception 'role assignments can only be ended, not rewritten';
  end if;
  return new;
end $$;
create trigger member_roles_guard before update on public.member_roles for each row execute function public.guard_member_role_update();

-- ── Guarded RPCs (privileged writes) ─────────────────────────────────────

-- Controlled enrolment. The account invitation is sent server-side AFTER this
-- succeeds, using the service-role client (lib/supabase/admin.ts).
-- Registers a member and records their registration fee, paid in full (a
-- receipted contribution in the chapter's books, counting as this year's registration).
create function public.create_member(p_full_name text, p_email text, p_phone text, p_chapter uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.current_member_id();
  v_id uuid;
  v_org uuid;
begin
  if not public.has_permission('CREATE_MEMBER', 'chapter', null, p_chapter) then
    raise exception 'not authorized to create members in this chapter' using errcode = '42501';
  end if;
  select organization_id into v_org from public.chapters where id = p_chapter;
  insert into public.members (organization_id, full_name, email, phone, member_number, created_by)
  values (v_org, trim(p_full_name), lower(trim(p_email)), nullif(trim(p_phone), ''),
          'NCUDA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), v_me)
  returning id into v_id;
  insert into public.member_chapter_history (member_id, chapter_id, recorded_by) values (v_id, p_chapter, v_me);
  -- The chapter's registration fee, paid in full on registering: the member is active at once.
  insert into public.contributions (ledger, member_id, chapter_id, type, description, amount, received_on, recorded_by, registration_fee_year)
  select 'chapter', v_id, p_chapter, 'contribution', 'Registration fee', c.registration_fee, current_date, v_me, public.registration_year()
  from public.chapters c where c.id = p_chapter and c.registration_fee is not null;
  if not found then raise exception 'set the chapter''s registration amount first'; end if;
  return v_id;
end $$;

-- Transfer between chapters: closes the old row, opens a new one.
-- Moves a member to another chapter (same region or not), or places someone
-- not yet in a chapter. TRANSFER_MEMBER is needed over both chapters: the
-- President General anywhere, a Regional Coordinator within their region.
-- Nobody moves themselves between chapters (placing yourself, when you have
-- no chapter, is allowed). A chapter post must be ended first.
-- Does the member still owe money on any fine? (Fines are paid before a move.)
create function public.owes_fines(p_member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contributions f
    where f.member_id = p_member and f.type = 'fine' and f.settles_fine_id is null and f.status = 'recorded'
      and coalesce(f.expected_amount, f.amount) - f.amount
          - coalesce((select sum(s.amount) from public.contributions s where s.settles_fine_id = f.id and s.status = 'recorded'), 0) > 0
  )
$$;

create function public.transfer_member(p_member uuid, p_to_chapter uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.current_member_id(); v_from uuid := public.member_chapter(p_member);
begin
  if v_me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_member = v_me and v_from is not null then raise exception 'you cannot move yourself to another chapter' using errcode = '42501'; end if;
  if not exists (select 1 from public.members where id = p_member and status = 'active') then raise exception 'member not found'; end if;
  if v_from = p_to_chapter then raise exception 'the member is already in this chapter'; end if;
  if not public.has_permission('TRANSFER_MEMBER', 'chapter', null, p_to_chapter)
     or (v_from is not null and not public.has_permission('TRANSFER_MEMBER', 'chapter', null, v_from)) then
    raise exception 'not authorized to move members between these chapters' using errcode = '42501';
  end if;
  if exists (select 1 from public.member_roles where member_id = p_member and status = 'active' and scope_level = 'chapter') then
    raise exception 'this member holds a chapter post — end it before moving them';
  end if;
  if public.owes_fines(p_member) then
    raise exception 'this member still owes fines — they must be paid before a move';
  end if;
  update public.member_chapter_history set ended_at = now() where member_id = p_member and ended_at is null;
  insert into public.member_chapter_history (member_id, chapter_id, recorded_by, note)
  values (p_member, p_to_chapter, v_me, coalesce(nullif(trim(p_note), ''), 'Transferred'));
end $$;

-- The President General renames a region.
create function public.update_region(p_region uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission('CREATE_REGION', 'organization') then
    raise exception 'regions are managed by the President General' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'enter the region''s name'; end if;
  update public.regions set name = trim(p_name) where id = p_region;
  if not found then raise exception 'region not found'; end if;
end $$;

-- A chapter's name and location: by its region's coordinator or the President General.
create function public.update_chapter(p_chapter uuid, p_name text, p_location text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_region uuid := public.chapter_region(p_chapter);
begin
  if not (
    public.has_permission('CREATE_REGION', 'organization')
    or (v_region is not null and public.registration_allows(public.current_member_id(), 'CREATE_CHAPTER') and exists (
      select 1 from public.member_roles mr
      join public.role_permissions rp on rp.role_key = mr.role_key and rp.permission_key = 'CREATE_CHAPTER'
      where mr.member_id = public.current_member_id() and mr.status = 'active'
        and mr.scope_level = 'region' and mr.region_id = v_region))
  ) then
    raise exception 'chapters are edited by their region''s coordinator' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'enter the chapter name'; end if;
  if length(trim(coalesce(p_location, ''))) < 2 then raise exception 'enter the location'; end if;
  update public.chapters set name = trim(p_name), location = trim(p_location) where id = p_chapter;
  if not found then raise exception 'chapter not found'; end if;
end $$;

-- p_region: for a regional role, the region (the member must belong to one of its chapters).
create function public.assign_role(p_member uuid, p_role text, p_region uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.current_member_id();
  v_role public.roles;
  v_chapter uuid := public.member_chapter(p_member);
  v_level public.scope_level;
  v_r uuid; v_c uuid;
  v_id uuid;
begin
  if v_me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_member = v_me then raise exception 'you cannot change your own roles' using errcode = '42501'; end if;
  select * into v_role from public.roles where key = p_role;
  if not found then raise exception 'unknown role'; end if;
  if v_chapter is null then raise exception 'member has no current chapter'; end if;

  v_level := v_role.scope_level;
  if v_level = 'chapter' then v_c := v_chapter;
  elsif v_level = 'region' then
    if p_region is null or not exists (select 1 from public.regions where id = p_region) then raise exception 'choose the region'; end if;
    if public.chapter_region(v_chapter) is distinct from p_region then raise exception 'a Regional Coordinator must belong to a chapter in that region'; end if;
    v_r := p_region;
  end if;

  if not public.has_permission('ASSIGN_ROLE', v_level, v_r, v_c) then
    raise exception 'not authorized to assign roles here' using errcode = '42501';
  end if;
  -- Appointment chain: one of my active roles must list this role as assignable, within scope.
  if not exists (
    select 1 from public.member_roles mr
    join public.role_assignable_roles ar on ar.role_key = mr.role_key and ar.assignable_role_key = p_role
    where mr.member_id = v_me and mr.status = 'active'
      and public.scope_covers(mr.scope_level, mr.region_id, mr.chapter_id, v_level, v_r, v_c)
  ) then
    raise exception 'your role does not allow appointing %', v_role.name using errcode = '42501';
  end if;
  -- One person, one post — and one holder per post (both also guaranteed by unique indexes).
  if exists (select 1 from public.member_roles where member_id = p_member and status = 'active') then
    raise exception 'this member already holds a post — uplift it before appointing them to another';
  end if;
  if exists (select 1 from public.member_roles where role_key = p_role and status = 'active' and scope_level = v_level
             and region_id is not distinct from v_r and chapter_id is not distinct from v_c) then
    raise exception 'this post is held — uplift its holder first';
  end if;

  insert into public.member_roles (member_id, role_key, scope_level, region_id, chapter_id, assigned_by)
  values (p_member, p_role, v_level, v_r, v_c, v_me) returning id into v_id;
  return v_id;
end $$;

create function public.end_role(p_assignment uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.current_member_id();
  a public.member_roles;
begin
  select * into a from public.member_roles where id = p_assignment for update;
  if not found or a.status <> 'active' then raise exception 'no active assignment'; end if;
  if a.member_id = v_me then raise exception 'you cannot change your own roles' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  if not public.has_permission('REMOVE_ROLE', a.scope_level, a.region_id, a.chapter_id) or not exists (
    select 1 from public.member_roles mr
    join public.role_assignable_roles ar on ar.role_key = mr.role_key and ar.assignable_role_key = a.role_key
    where mr.member_id = v_me and mr.status = 'active'
      and public.scope_covers(mr.scope_level, mr.region_id, mr.chapter_id, a.scope_level, a.region_id, a.chapter_id)
  ) then
    raise exception 'not authorized to end this role' using errcode = '42501';
  end if;
  update public.member_roles set status = 'ended', ended_at = now(), ended_by = v_me, end_reason = trim(p_reason) where id = p_assignment;
end $$;

-- Delegation: you can only delegate permissions you hold over that scope, and never to yourself.
create function public.delegate_authority(p_to uuid, p_perms text[], p_level public.scope_level, p_region uuid, p_chapter uuid, p_ends_at timestamptz, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.current_member_id(); p text; v_id uuid;
begin
  if p_to = v_me then raise exception 'you cannot delegate to yourself' using errcode = '42501'; end if;
  foreach p in array p_perms loop
    if not public.has_permission(p, p_level, p_region, p_chapter) then
      raise exception 'you do not hold % over this scope', p using errcode = '42501';
    end if;
  end loop;
  insert into public.authority_delegations (granted_by, granted_to, scope_level, region_id, chapter_id, permissions, ends_at, note)
  values (v_me, p_to, p_level, p_region, p_chapter, p_perms, p_ends_at, p_note) returning id into v_id;
  return v_id;
end $$;

-- Regions and chapters. p_exco / p_new are {"role_key", "full_name", "email",
-- "phone"}; invitations to new people are sent server-side after success.
-- Creates a member account (no chapter yet). Internal helper for the RPCs below.
create function public.new_member_account(p_person jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if length(trim(coalesce(p_person ->> 'full_name', ''))) < 3 then raise exception 'enter the full name'; end if;
  if coalesce(p_person ->> 'email', '') !~ '^[^@\s]+@[^@\s]+$' then raise exception 'enter a valid email'; end if;
  insert into public.members (organization_id, full_name, email, phone, member_number, created_by)
  select o.id, trim(p_person ->> 'full_name'), lower(trim(p_person ->> 'email')), nullif(trim(p_person ->> 'phone'), ''),
         'NCUDA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), public.current_member_id()
  from public.organizations o limit 1
  returning id into v_id;
  return v_id;
end $$;

-- Appoints a Regional Coordinator for a region that has none: an existing
-- member (from any chapter, not yourself) or a new person (p_new). President
-- General only (CREATE_REGION). A coordinator need not belong to a chapter
-- in the region — a new region has none yet.
create function public.appoint_region_coordinator(p_region uuid, p_member uuid, p_new jsonb default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.current_member_id(); v_member uuid;
begin
  if not public.has_permission('CREATE_REGION', 'organization') then
    raise exception 'regions and their coordinators are set up by the President General' using errcode = '42501';
  end if;
  if not exists (select 1 from public.regions where id = p_region) then raise exception 'region not found'; end if;
  if exists (select 1 from public.member_roles where role_key = 'REGIONAL_COORDINATOR' and status = 'active' and scope_level = 'region' and region_id = p_region) then
    raise exception 'this region already has a Regional Coordinator';
  end if;
  if (p_member is null) = (p_new is null) then raise exception 'choose an existing member or enter a new person'; end if;
  if p_member is not null then
    if p_member = v_me then raise exception 'you cannot appoint yourself'; end if;
    if not exists (select 1 from public.members where id = p_member and status = 'active') then raise exception 'member not found'; end if;
    if exists (select 1 from public.member_roles where member_id = p_member and status = 'active') then
      raise exception 'this member already holds a post — uplift it before appointing them to another';
    end if;
    if public.chapter_region(public.member_chapter(p_member)) is distinct from p_region then
      raise exception 'a Regional Coordinator must belong to a chapter in that region';
    end if;
    v_member := p_member;
  else
    v_member := public.new_member_account(p_new);
  end if;
  insert into public.member_roles (member_id, role_key, scope_level, region_id, assigned_by)
  values (v_member, 'REGIONAL_COORDINATOR', 'region', p_region, v_me);
  return v_member;
end $$;

-- Creates a region together with its Regional Coordinator. President General only.
create function public.create_region(p_name text, p_member uuid, p_new jsonb default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_region uuid;
begin
  if not public.has_permission('CREATE_REGION', 'organization') then
    raise exception 'regions are created by the President General' using errcode = '42501';
  end if;
  insert into public.regions (organization_id, name)
  select o.id, trim(p_name) from public.organizations o limit 1
  returning id into v_region;
  perform public.appoint_region_coordinator(v_region, p_member, p_new);
  perform public.write_audit('CREATE', 'regions', v_region::text, null, v_region, 'Created region ' || trim(p_name));
  return v_region;
end $$;

-- Creates a chapter with its Chapter President — an existing member
-- (p_president, who moves into the new chapter) or a new person (a
-- CHAPTER_PRESIDENT entry in p_exco) — plus optional other founding officers
-- (new people). Chapters are created only by the coordinator of the region
-- they belong to (an organisation-wide grant does not reach down here).
-- An existing member joining a new chapter as a founding officer: active, not
-- yourself, holding no post, owing no fines, and someone you may see (or not
-- yet in any chapter). Raises otherwise.
create function public.check_founding_member(p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_from uuid := public.member_chapter(p_member);
begin
  if p_member = public.current_member_id() then raise exception 'you cannot appoint yourself'; end if;
  if not exists (select 1 from public.members where id = p_member and status = 'active') then raise exception 'member not found'; end if;
  if exists (select 1 from public.member_roles where member_id = p_member and status = 'active') then
    raise exception 'this member already holds a post — end it before appointing them to another';
  end if;
  if public.owes_fines(p_member) then
    raise exception 'this member still owes fines — they must be paid before a move';
  end if;
  if v_from is not null and not public.has_permission('VIEW_MEMBER', 'chapter', null, v_from) then
    raise exception 'this member is outside your part of the organisation' using errcode = '42501';
  end if;
end $$;

-- Creates a chapter with its Chapter President AND its Financial Secretary
-- (both required — the Financial Secretary registers the chapter's members).
-- Each is an existing member (p_president / p_financial_secretary, who moves
-- into the new chapter) or a new person (an entry in p_exco). Other founding
-- officers (new people) are optional. Chapters are created only by the
-- coordinator of the region they belong to.
create function public.create_chapter(p_name text, p_location text, p_region uuid, p_exco jsonb,
                                      p_president uuid default null, p_financial_secretary uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.current_member_id();
  v_org uuid;
  v_chapter uuid;
  v_member uuid;
  v_existing record;
  e jsonb;
begin
  -- Every new chapter belongs to a region and is created by THAT region's
  -- coordinator; organisation-wide authority (the President General's) does not reach here.
  if p_region is null then raise exception 'a chapter must belong to a region'; end if;
  if not public.registration_allows(v_me, 'CREATE_CHAPTER') or not exists (
    select 1 from public.member_roles mr
    join public.role_permissions rp on rp.role_key = mr.role_key and rp.permission_key = 'CREATE_CHAPTER'
    where mr.member_id = v_me and mr.status = 'active'
      and mr.scope_level = 'region' and mr.region_id = p_region
  ) then
    raise exception 'chapters are created by the Regional Coordinator of their region' using errcode = '42501';
  end if;
  if jsonb_typeof(p_exco) <> 'array' then raise exception 'founding officers must be a list'; end if;
  if (p_president is not null) = exists (select 1 from jsonb_array_elements(p_exco) x where x ->> 'role_key' = 'CHAPTER_PRESIDENT') then
    raise exception 'a chapter must start with exactly one Chapter President';
  end if;
  if (p_financial_secretary is not null) = exists (select 1 from jsonb_array_elements(p_exco) x where x ->> 'role_key' = 'FINANCIAL_SECRETARY') then
    raise exception 'a chapter must start with exactly one Financial Secretary';
  end if;
  if p_president is not null and p_president = p_financial_secretary then
    raise exception 'the Chapter President and the Financial Secretary must be two different people';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_exco) x
    where x ->> 'role_key' not in ('CHAPTER_PRESIDENT', 'CHAPTER_VICE_PRESIDENT', 'CHAPTER_SECRETARY', 'FINANCIAL_SECRETARY', 'TREASURER')
  ) then
    raise exception 'unsupported founding office';
  end if;
  if p_president is not null then perform public.check_founding_member(p_president); end if;
  if p_financial_secretary is not null then perform public.check_founding_member(p_financial_secretary); end if;

  select id into v_org from public.organizations limit 1;
  insert into public.chapters (organization_id, region_id, name, location)
  values (v_org, p_region, trim(p_name), trim(p_location))
  returning id into v_chapter;

  -- Existing members move into the new chapter (their history is kept).
  for v_existing in
    select * from (values (p_president, 'CHAPTER_PRESIDENT', 'Founding Chapter President'),
                          (p_financial_secretary, 'FINANCIAL_SECRETARY', 'Founding Financial Secretary')) as t(member_id, role_key, note)
    where t.member_id is not null
  loop
    update public.member_chapter_history set ended_at = now() where member_id = v_existing.member_id and ended_at is null;
    insert into public.member_chapter_history (member_id, chapter_id, recorded_by, note)
    values (v_existing.member_id, v_chapter, v_me, v_existing.note);
    insert into public.member_roles (member_id, role_key, scope_level, chapter_id, assigned_by)
    values (v_existing.member_id, v_existing.role_key, 'chapter', v_chapter, v_me);
  end loop;

  for e in select * from jsonb_array_elements(p_exco) loop
    v_member := public.new_member_account(e);
    insert into public.member_chapter_history (member_id, chapter_id, recorded_by, note)
    values (v_member, v_chapter, v_me, 'Founding EXCO');
    insert into public.member_roles (member_id, role_key, scope_level, chapter_id, assigned_by)
    values (v_member, e ->> 'role_key', 'chapter', v_chapter, v_me);
  end loop;

  perform public.write_audit('CREATE', 'chapters', v_chapter::text, v_chapter, null, 'Created chapter ' || trim(p_name));
  return v_chapter;
end $$;

-- Suspend or reinstate a member. Rules (mirrors canChangeMemberStatus):
--   never yourself; SUSPEND_MEMBER over the member's chapter; and an office
--   holder may only be suspended by someone whose role appoints every office
--   they hold. A suspended member has no current_member_id(), so every policy
--   and RPC denies them at once; their roles and history are untouched.
create function public.set_member_status(p_member uuid, p_status public.membership_status, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.current_member_id();
  v_chapter uuid := public.member_chapter(p_member);
begin
  if v_me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_member = v_me then raise exception 'you cannot change your own membership status' using errcode = '42501'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'unsupported status'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason is required'; end if;
  if not public.has_permission('SUSPEND_MEMBER', 'chapter', null, v_chapter) then
    raise exception 'not authorized for this chapter' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.member_roles target
    where target.member_id = p_member and target.status = 'active'
      and not exists (
        select 1 from public.member_roles mine
        join public.role_assignable_roles ar on ar.role_key = mine.role_key and ar.assignable_role_key = target.role_key
        where mine.member_id = v_me and mine.status = 'active'
      )
  ) then
    raise exception 'this member holds an office you do not appoint' using errcode = '42501';
  end if;

  perform set_config('ncuda.status_change', 'on', true);
  update public.members
  set status = p_status, status_reason = trim(p_reason), status_changed_by = v_me, status_changed_at = now(), updated_at = now()
  where id = p_member;
  perform set_config('ncuda.status_change', 'off', true);
end $$;

-- Status may only change through set_member_status(): the generic "edit
-- member" policy must not become a way around the rules above.
create function public.guard_member_status()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and coalesce(current_setting('ncuda.status_change', true), 'off') <> 'on' then
    raise exception 'membership status can only be changed with set_member_status()';
  end if;
  return new;
end $$;
create trigger members_status_guard before update on public.members for each row execute function public.guard_member_status();

-- A member's identity never changes: id, membership number, organisation and
-- creation details are fixed. (The Supabase Auth link may be set once, when
-- the invited person first signs in.)
create function public.guard_member_identity()
returns trigger language plpgsql as $$
begin
  if (new.id, new.member_number, new.organization_id, new.created_by, new.created_at, new.joined_at)
     is distinct from (old.id, old.member_number, old.organization_id, old.created_by, old.created_at, old.joined_at)
     or (old.auth_user_id is not null and new.auth_user_id is distinct from old.auth_user_id) then
    raise exception 'a member''s ID, membership number and creation details cannot be changed';
  end if;
  return new;
end $$;
create trigger members_identity_guard before update on public.members for each row execute function public.guard_member_identity();

-- Every member edits their own name, email and phone. (Changing the sign-in
-- email is confirmed through Supabase Auth — auth.updateUser — before this is called.)
create function public.update_my_profile(p_full_name text, p_email text, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.current_member_id();
begin
  if v_me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then raise exception 'enter your full name'; end if;
  if coalesce(p_email, '') !~ '^[^@\s]+@[^@\s]+$' then raise exception 'enter a valid email'; end if;
  update public.members
  set full_name = trim(p_full_name), email = lower(trim(p_email)), phone = nullif(trim(coalesce(p_phone, '')), ''), updated_at = now()
  where id = v_me;
end $$;

create function public.void_contribution(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.contributions;
begin
  select * into c from public.contributions where id = p_id for update;
  if not found then raise exception 'record not found'; end if;
  if (c.ledger = 'central' and not public.has_permission('VOID_CONTRIBUTION', 'organization'))
     or (c.ledger = 'chapter' and not public.has_local_permission('VOID_CONTRIBUTION', c.chapter_id))
     or (c.ledger = 'committee' and public.my_committee_position(c.committee_id) is distinct from 'FINANCIAL_SECRETARY') then
    raise exception 'not authorized for this ledger' using errcode = '42501';
  end if;
  if exists (select 1 from public.contributions s where s.settles_fine_id = c.id and s.status = 'recorded') then
    raise exception 'payments have been recorded towards this fine — void those first';
  end if;
  update public.contributions
  set status = 'voided', voided_by = public.current_member_id(), voided_at = now(), void_reason = trim(p_reason)
  where id = p_id;
end $$;

create function public.void_expense(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_id for update;
  if not found then raise exception 'record not found'; end if;
  if (e.committee_id is null and not public.has_exact_permission('RECORD_EXPENSE', e.scope_level, e.region_id, e.chapter_id))
     or (e.committee_id is not null and not public.funds_committee(e.committee_id)) then
    raise exception 'not authorized for these funds' using errcode = '42501';
  end if;
  update public.expenses
  set status = 'voided', voided_by = public.current_member_id(), voided_at = now(), void_reason = trim(p_reason)
  where id = p_id;
end $$;

create function public.complete_action_item(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.action_items; m public.meetings;
begin
  select * into a from public.action_items where id = p_id for update;
  select * into m from public.meetings where id = a.meeting_id;
  -- Marked done by the Secretary who recorded it, not by the person responsible.
  if not public.has_exact_permission('COMPLETE_ACTION_ITEM', m.scope_level, m.region_id, m.chapter_id) then
    raise exception 'action items are marked complete by the Secretary' using errcode = '42501';
  end if;
  update public.action_items set status = 'completed', completed_at = now(), completed_by = public.current_member_id() where id = p_id;
end $$;

-- ── Row Level Security ───────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'organizations', 'regions', 'chapters', 'members', 'member_chapter_history', 'permissions', 'roles',
    'role_permissions', 'role_assignable_roles', 'member_roles', 'authority_delegations', 'meetings', 'meeting_invitees', 'meeting_invite_groups',
    'attendance', 'meeting_minutes', 'decisions', 'action_items', 'contributions', 'collections', 'expenses',
    'reference_counters', 'registration_renewals', 'committees', 'committee_members', 'committee_meetings', 'committee_attendance', 'committee_minutes', 'documents', 'notifications', 'notification_reads', 'notification_attachments', 'audit_logs', 'settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Reference data: readable by signed-in members; written only by migrations / service role.
create policy "members read organisations" on public.organizations for select to authenticated using (public.current_member_id() is not null);
create policy "members read regions"       on public.regions       for select to authenticated using (public.current_member_id() is not null);
create policy "members read chapters"      on public.chapters      for select to authenticated using (public.current_member_id() is not null);
create policy "members read permissions"   on public.permissions   for select to authenticated using (public.current_member_id() is not null);
create policy "members read roles"         on public.roles         for select to authenticated using (public.current_member_id() is not null);
create policy "members read role perms"    on public.role_permissions      for select to authenticated using (public.current_member_id() is not null);
create policy "members read assignable"    on public.role_assignable_roles for select to authenticated using (public.current_member_id() is not null);
create policy "members read settings"      on public.settings      for select to authenticated using (public.current_member_id() is not null);

-- Members: yourself, or members of chapters where you hold VIEW_MEMBER. Writes via RPC only.
create policy "read self or in scope" on public.members for select to authenticated using (
  id = public.current_member_id()
  or public.has_permission('VIEW_MEMBER', 'chapter', null, public.member_chapter(id))
);
create policy "edit member in scope" on public.members for update to authenticated
  using (public.has_permission('EDIT_MEMBER', 'chapter', null, public.member_chapter(id)))
  with check (public.has_permission('EDIT_MEMBER', 'chapter', null, public.member_chapter(id)) and id <> public.current_member_id());

create policy "read own or in scope" on public.member_chapter_history for select to authenticated using (
  member_id = public.current_member_id() or public.has_permission('VIEW_MEMBER', 'chapter', null, chapter_id)
);

-- Roles: own history, central office holders, or within VIEW_MEMBER / ASSIGN_ROLE scope. Writes via RPC only.
create policy "read roles in scope" on public.member_roles for select to authenticated using (
  member_id = public.current_member_id()
  or scope_level = 'organization'
  or public.has_permission('VIEW_MEMBER', scope_level, region_id, chapter_id)
  or public.has_permission('ASSIGN_ROLE', scope_level, region_id, chapter_id)
);

create policy "read delegations" on public.authority_delegations for select to authenticated using (
  granted_to = public.current_member_id() or granted_by = public.current_member_id()
  or public.has_permission('VIEW_AUDIT_LOG', scope_level, region_id, chapter_id)
);
create policy "revoke own delegations" on public.authority_delegations for update to authenticated
  using (granted_by = public.current_member_id()) with check (granted_by = public.current_member_id() and status = 'revoked');

-- Meetings
-- Does the member hold a post within the scope (an executive there)?
create function public.holds_post_within(p_member uuid, p_level public.scope_level, p_region uuid, p_chapter uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_roles mr
    where mr.member_id = p_member and mr.status = 'active'
      and (p_level = 'organization'
           or (p_level = 'region' and (mr.region_id = p_region
                                       or (mr.chapter_id is not null and (select c.region_id from public.chapters c where c.id = mr.chapter_id) = p_region)))
           or (p_level = 'chapter' and mr.chapter_id = p_chapter))
  )
$$;

-- Who sees a meeting: the people it is for and the officers who run meetings
-- there — the post, not whoever scheduled it.
create function public.meeting_visible(p_meeting uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.meetings m
    where m.id = p_meeting and (
      (m.audience = 'all' and public.in_membership_line(m.scope_level, m.region_id, m.chapter_id))
      or (m.audience = 'executives' and public.holds_post_within(public.current_member_id(), m.scope_level, m.region_id, m.chapter_id))
      or (m.audience = 'selected' and exists (select 1 from public.meeting_invitees i where i.meeting_id = m.id and i.member_id = public.current_member_id()))
      or (m.audience = 'selected' and exists (
            select 1 from public.meeting_invite_groups g
            where g.meeting_id = m.id
              and (g.chapter_id = public.member_chapter(public.current_member_id())
                   or g.region_id = (select c.region_id from public.chapters c where c.id = public.member_chapter(public.current_member_id())))))
      or public.has_permission('CREATE_MEETING', m.scope_level, m.region_id, m.chapter_id)
      or public.has_permission('EDIT_MEETING', m.scope_level, m.region_id, m.chapter_id)
      or public.has_permission('RECORD_ATTENDANCE', m.scope_level, m.region_id, m.chapter_id)
      or public.has_permission('CREATE_MINUTES', m.scope_level, m.region_id, m.chapter_id)
    )
  )
$$;

-- The inline CREATE_MEETING check lets INSERT … RETURNING work (the helper cannot yet see the new row).
create policy "read meetings" on public.meetings for select to authenticated using (
  public.has_permission('CREATE_MEETING', scope_level, region_id, chapter_id) or public.meeting_visible(id)
);
-- Invitees of a "selected" meeting: executives of its scope, chosen by whoever may change it.
create policy "read meeting invitees" on public.meeting_invitees for select to authenticated using (public.meeting_visible(meeting_id));
-- Whole regions or chapters: national meetings only.
create policy "read meeting invite groups" on public.meeting_invite_groups for select to authenticated using (public.meeting_visible(meeting_id));
create policy "invite groups to meetings" on public.meeting_invite_groups for insert to authenticated with check (
  exists (select 1 from public.meetings m where m.id = meeting_id and m.audience = 'selected' and m.scope_level = 'organization'
          and (public.has_permission('CREATE_MEETING', m.scope_level, m.region_id, m.chapter_id) or public.has_permission('EDIT_MEETING', m.scope_level, m.region_id, m.chapter_id)))
);
create policy "invite to meetings" on public.meeting_invitees for insert to authenticated with check (
  exists (select 1 from public.meetings m where m.id = meeting_id and m.audience = 'selected'
          and (public.has_permission('CREATE_MEETING', m.scope_level, m.region_id, m.chapter_id) or public.has_permission('EDIT_MEETING', m.scope_level, m.region_id, m.chapter_id))
          and public.holds_post_within(member_id, m.scope_level, m.region_id, m.chapter_id))
);
create policy "create meetings" on public.meetings for insert to authenticated with check (
  public.has_permission('CREATE_MEETING', scope_level, region_id, chapter_id) and created_by = public.current_member_id()
);
-- Once a meeting has started its details are locked; cancelling it then records that it was not held.
create function public.guard_meeting_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.starts_at <= now()
     and (new.title, new.starts_at, new.ends_at, new.location, new.agenda, new.scope_level, new.region_id, new.chapter_id, new.audience)
         is distinct from (old.title, old.starts_at, old.ends_at, old.location, old.agenda, old.scope_level, old.region_id, old.chapter_id, old.audience) then
    raise exception 'this meeting has started and can no longer be changed';
  end if;
  if old.status = 'scheduled' and new.status = 'cancelled' then
    new.not_held := old.starts_at <= now();
  elsif new.not_held is distinct from old.not_held then
    new.not_held := old.not_held;
  end if;
  return new;
end $$;
create trigger meetings_guard before update on public.meetings for each row execute function public.guard_meeting_update();

-- A meeting is run by the post that schedules meetings at its own level; officers above only see it.
create policy "edit meetings" on public.meetings for update to authenticated
  using (public.has_exact_permission('CREATE_MEETING', scope_level, region_id, chapter_id))
  with check (public.has_exact_permission('CREATE_MEETING', scope_level, region_id, chapter_id));
create policy "delete meetings" on public.meetings for delete to authenticated
  using (public.has_exact_permission('CREATE_MEETING', scope_level, region_id, chapter_id) and status = 'scheduled');

-- Attendance: own record, or officers of that chapter. Only officers write, only for the chapter roll.
-- ── Meeting reminders ──
-- West Africa Time is UTC+1 all year (no daylight saving).
create function public.wat(p_at timestamptz)
returns timestamp language sql immutable set search_path = '' as $$
  select (p_at at time zone 'UTC') + interval '1 hour'
$$;

-- The reminders whose time has come: 'day' from 24 hours before the start,
-- 'morning' from 07:00 WAT on the day. None once the meeting has started.
create function public.meeting_reminders_due(p_starts_at timestamptz, p_now timestamptz)
returns text[] language sql immutable set search_path = '' as $$
  select case when p_now >= p_starts_at then '{}'::text[]
    else array_remove(array[
      case when p_starts_at - p_now <= interval '24 hours' then 'day' end,
      case when public.wat(p_now)::date = public.wat(p_starts_at)::date and extract(hour from public.wat(p_now)) >= 7 then 'morning' end
    ], null) end
$$;

-- Reminders already due when a meeting is scheduled or moved are not sent:
-- the people it is for were just told. A new time starts the reminders over.
create function public.meeting_reminders_reset()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at then
    new.reminders_sent := public.meeting_reminders_due(new.starts_at, now());
  elsif new.reminders_sent is distinct from old.reminders_sent and current_user = 'authenticated' then
    new.reminders_sent := old.reminders_sent; -- only the reminder job changes it
  end if;
  return new;
end $$;
create trigger meetings_reminders_reset before insert or update on public.meetings
  for each row execute function public.meeting_reminders_reset();

-- Who a meeting is for, member by member (for "executives" and "selected" meetings).
create function public.meeting_invitee_ids(p_meeting uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.id from public.members m join public.meetings mt on mt.id = p_meeting
  where m.status = 'active' and (
    (mt.audience = 'all' and public.member_chapter(m.id) is not null and public.scope_covers(mt.scope_level, mt.region_id, mt.chapter_id, 'chapter', null, public.member_chapter(m.id)))
    or (mt.audience = 'executives' and public.holds_post_within(m.id, mt.scope_level, mt.region_id, mt.chapter_id))
    or (mt.audience = 'selected' and (
      exists (select 1 from public.meeting_invitees i where i.meeting_id = mt.id and i.member_id = m.id)
      or exists (select 1 from public.meeting_invite_groups g where g.meeting_id = mt.id
                 and (g.chapter_id = public.member_chapter(m.id) or g.region_id = public.chapter_region(public.member_chapter(m.id))))))
  )
$$;

-- Sends the reminders that are due — the day before and on the morning of each
-- scheduled meeting — to everyone it is for, each once. When both are due
-- together, only the morning one is sent. Run every 15 minutes by pg_cron
-- (scheduled below when the extension is enabled); nobody else may call it.
create function public.send_meeting_reminders(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare
  m record;
  v_due text[];
  v_title text;
  v_body text;
  v_sent int := 0;
begin
  for m in select * from public.meetings where status = 'scheduled' and starts_at > p_now for update loop
    v_due := array(select unnest(public.meeting_reminders_due(m.starts_at, p_now)) except select unnest(m.reminders_sent));
    continue when cardinality(v_due) = 0;
    if 'morning' = any (v_due) then
      v_title := 'Today: ' || m.title;
      v_body := 'Starts at ' || to_char(public.wat(m.starts_at), 'HH24:MI') || ' WAT · ' || coalesce(m.location, '');
    else
      v_title := case when public.wat(p_now)::date = public.wat(m.starts_at)::date then 'Today: ' else 'Tomorrow: ' end || m.title;
      v_body := to_char(public.wat(m.starts_at), 'Dy DD Mon YYYY, HH24:MI') || ' WAT · ' || coalesce(m.location, '');
    end if;
    if m.audience = 'all' then
      insert into public.notifications (type, title, body, scope_level, region_id, chapter_id, link, created_by)
      values ('meeting_reminder', v_title, v_body, m.scope_level, m.region_id, m.chapter_id, '/dashboard/meetings/' || m.id, m.created_by);
    else
      insert into public.notifications (type, title, body, audience_member_id, link, created_by)
      select 'meeting_reminder', v_title, v_body, i, '/dashboard/meetings/' || m.id, m.created_by from public.meeting_invitee_ids(m.id) i;
    end if;
    update public.meetings set reminders_sent = array(select distinct unnest(m.reminders_sent || v_due) order by 1) where id = m.id;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;
revoke all on function public.send_meeting_reminders(timestamptz), public.meeting_invitee_ids(uuid) from public, anon, authenticated;

-- On Supabase: enable the pg_cron extension (Database → Extensions) before
-- running the migrations, and the reminders are scheduled here. Otherwise run
-- once: select cron.schedule('meeting-reminders', '*/15 * * * *', 'select public.send_meeting_reminders()');
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('meeting-reminders', '*/15 * * * *', 'select public.send_meeting_reminders()');
  end if;
end $$;

create policy "read attendance" on public.attendance for select to authenticated using (
  member_id = public.current_member_id()
  or public.has_permission('RECORD_ATTENDANCE', 'chapter', null, chapter_id)
  or public.has_permission('VIEW_MEMBER', 'chapter', null, chapter_id)
);
create policy "record attendance" on public.attendance for insert to authenticated with check (
  exists (select 1 from public.meetings m where m.id = meeting_id
          and public.has_exact_permission('RECORD_ATTENDANCE', m.scope_level, m.region_id, m.chapter_id))
  and public.member_chapter(member_id) = chapter_id
  and recorded_by = public.current_member_id()
);
create policy "correct attendance" on public.attendance for update to authenticated
  using (exists (select 1 from public.meetings m where m.id = meeting_id
                 and public.has_exact_permission('RECORD_ATTENDANCE', m.scope_level, m.region_id, m.chapter_id)))
  with check (exists (select 1 from public.meetings m where m.id = meeting_id
                      and public.has_exact_permission('RECORD_ATTENDANCE', m.scope_level, m.region_id, m.chapter_id))
              and recorded_by = public.current_member_id());

-- Minutes: published minutes for anyone who can see the meeting; drafts for minute-takers.
create policy "read minutes" on public.meeting_minutes for select to authenticated using (
  exists (select 1 from public.meetings m where m.id = meeting_id and (
    (meeting_minutes.status = 'published' and public.meeting_visible(m.id))
    or public.has_exact_permission('CREATE_MINUTES', m.scope_level, m.region_id, m.chapter_id)
    or public.has_exact_permission('EDIT_MINUTES', m.scope_level, m.region_id, m.chapter_id)
  ))
);
-- The Vice Secretary may draft; publishing needs EDIT_MINUTES (the Secretary).
create policy "write minutes" on public.meeting_minutes for insert to authenticated with check (
  exists (select 1 from public.meetings m where m.id = meeting_id and m.status <> 'cancelled'
          and public.has_exact_permission('CREATE_MINUTES', m.scope_level, m.region_id, m.chapter_id)
          and (meeting_minutes.status = 'draft' or public.has_exact_permission('EDIT_MINUTES', m.scope_level, m.region_id, m.chapter_id)))
  and recorded_by = public.current_member_id()
);
create policy "edit minutes" on public.meeting_minutes for update to authenticated using (
  exists (select 1 from public.meetings m where m.id = meeting_id and public.has_exact_permission('EDIT_MINUTES', m.scope_level, m.region_id, m.chapter_id))
);

-- Decisions & action items follow their meeting.
create policy "read decisions" on public.decisions for select to authenticated using (
  public.meeting_visible(meeting_id)
);
create policy "create decisions" on public.decisions for insert to authenticated with check (
  exists (select 1 from public.meetings m where m.id = meeting_id and public.has_exact_permission('CREATE_DECISION', m.scope_level, m.region_id, m.chapter_id))
);
create policy "edit decisions" on public.decisions for update to authenticated using (
  exists (select 1 from public.meetings m where m.id = meeting_id and public.has_exact_permission('EDIT_DECISION', m.scope_level, m.region_id, m.chapter_id))
);

create policy "read action items" on public.action_items for select to authenticated using (
  assignee_id = public.current_member_id()
  or public.meeting_visible(meeting_id)
  or exists (select 1 from public.meetings m where m.id = meeting_id and public.has_permission('EDIT_ACTION_ITEM', m.scope_level, m.region_id, m.chapter_id))
);
create policy "create action items" on public.action_items for insert to authenticated with check (
  exists (select 1 from public.meetings m where m.id = meeting_id and public.has_exact_permission('CREATE_ACTION_ITEM', m.scope_level, m.region_id, m.chapter_id))
);
create policy "edit action items" on public.action_items for update to authenticated using (
  exists (select 1 from public.meetings m where m.id = meeting_id and public.has_exact_permission('EDIT_ACTION_ITEM', m.scope_level, m.region_id, m.chapter_id))
);

-- ── Committees ───────────────────────────────────────────────────────────
-- The President General oversees every committee.
create function public.oversees_committees()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission('CREATE_COMMITTEE', 'organization')
$$;

-- A Regional Coordinator oversees the chapter committees of their region (read only).
create function public.oversees_committee(p_committee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.oversees_committees() or exists (
    select 1 from public.committees c
    where c.id = p_committee and c.scope_level = 'chapter'
      and public.has_exact_permission('CREATE_COMMITTEE', 'region', public.chapter_region(c.chapter_id), null))
$$;

-- The project manager — whoever created the committee's project (for a chapter
-- project, the chapter's Financial Secretary, who keeps its money) — sees the
-- committee and its books, and gives it its money.
create function public.manages_project(p_committee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.committees c join public.collections col on col.id = c.collection_id
    where c.id = p_committee and case when col.scope_level = 'chapter'
      then public.has_exact_permission('RECORD_EXPENSE', 'chapter', null, col.chapter_id)
      else public.project_manager(col.id) = public.current_member_id() end)
$$;

-- May the current member give this committee money now? (Its project manager, while it is active and they are registered.)
create function public.funds_committee(p_committee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.manages_project(p_committee)
     and not public.registration_due(public.current_member_id())
     and exists (select 1 from public.committees c where c.id = p_committee and c.status = 'active')
$$;

-- A committee is run by a post, not by whoever created it: the President General
-- (national), the region's Regional Coordinator (regional), the Chapter President
-- (chapter) — and their Vice Presidents. When the post changes hands, so does the committee.
create function public.runs_committee(p_committee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.committees c where c.id = p_committee
                 and public.has_exact_permission('CREATE_COMMITTEE', c.scope_level, c.region_id, c.chapter_id))
$$;

-- The people currently holding the post that runs a committee.
create function public.committee_holders(p_committee uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct mr.member_id
  from public.committees c
  join public.member_roles mr on mr.status = 'active' and mr.scope_level = c.scope_level
       and mr.region_id is not distinct from c.region_id and mr.chapter_id is not distinct from c.chapter_id
  join public.role_permissions rp on rp.role_key = mr.role_key and rp.permission_key = 'CREATE_COMMITTEE'
  where c.id = p_committee
$$;
revoke all on function public.committee_holders(uuid) from public, anon, authenticated;

-- Visible to the post that runs it, its members (past or present), its project
-- manager, the President General and, for a chapter committee, the coordinator of the chapter's region.
create function public.committee_visible(p_committee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.oversees_committee(p_committee) or public.manages_project(p_committee)
      or public.runs_committee(p_committee)
      or exists (select 1 from public.committee_members m where m.committee_id = p_committee and m.member_id = public.current_member_id())
$$;

-- My position on an ACTIVE committee (null if none / ordinary member / not active).
create function public.my_committee_position(p_committee uuid)
returns public.committee_position language sql stable security definer set search_path = '' as $$
  select m.position from public.committee_members m join public.committees c on c.id = m.committee_id
  where m.committee_id = p_committee and m.member_id = public.current_member_id() and m.ended_at is null and c.status = 'active'
    and not public.registration_due(public.current_member_id())
$$;

-- Who sees a committee's books: the post that runs it, its project manager, the President General
-- (and the coordinator, for a chapter committee), its President, Vice President, Financial Secretary, Treasurer.
create function public.committee_books_visible(p_committee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.oversees_committee(p_committee) or public.manages_project(p_committee)
      or public.runs_committee(p_committee)
      or exists (select 1 from public.committee_members m where m.committee_id = p_committee and m.member_id = public.current_member_id()
                 and m.ended_at is null and m.position in ('PRESIDENT', 'VICE_PRESIDENT', 'FINANCIAL_SECRETARY', 'TREASURER'))
$$;

-- Is this member someone the committee draws from (anyone for national; the region's chapters for regional; the chapter's members for chapter)?
create function public.in_committee_scope(p_committee uuid, p_member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  -- coalesce: a member whose chapter has no region (null) is simply not in a regional committee's scope.
  select coalesce(c.scope_level = 'organization'
                  or (c.scope_level = 'region' and public.chapter_region(public.member_chapter(p_member)) = c.region_id)
                  or (c.scope_level = 'chapter' and public.member_chapter(p_member) = c.chapter_id), false)
  from public.committees c where c.id = p_committee
$$;

create policy "read committees" on public.committees for select to authenticated using (public.committee_visible(id));
create policy "read committee members" on public.committee_members for select to authenticated using (public.committee_visible(committee_id));

-- Creates a committee with its project (President General: national; a coordinator: their region; a Chapter President: their chapter).
-- Projects are set up first (Finances → Collections) by whoever may do so for
-- that scope; a committee is then created for one of them. Several committees
-- may share a project (e.g. its phases). The project must be for exactly the
-- committee's scope, not ended, and not a registration renewal.
create function public.create_committee(p_name text, p_scope public.scope_level, p_region uuid, p_collection uuid, p_chapter uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.current_member_id(); p public.collections; v_id uuid;
  v_region uuid := case when p_scope = 'region' then p_region end;
  v_chapter uuid := case when p_scope = 'chapter' then p_chapter end;
begin
  if not public.valid_scope(p_scope, v_region, v_chapter) then raise exception 'a committee is national, regional or for a chapter'; end if;
  if not public.has_exact_permission('CREATE_COMMITTEE', p_scope, v_region, v_chapter) then
    raise exception 'committees are created by the President General (national), a Regional Coordinator (their region) or a Chapter President (their chapter)' using errcode = '42501';
  end if;
  select * into p from public.collections where id = p_collection;
  if not found or p.scope_level <> p_scope or p.region_id is distinct from v_region or p.chapter_id is distinct from v_chapter then
    raise exception 'choose a project set up for the committee''s scope';
  end if;
  if p.ends_on is not null and p.ends_on < current_date then raise exception 'that project has ended'; end if;
  if exists (select 1 from public.registration_renewals r where r.collection_id = p.id) then
    raise exception 'a registration renewal is not a committee project';
  end if;
  insert into public.committees (name, purpose, scope_level, region_id, chapter_id, collection_id, created_by)
  values (trim(p_name), p.description, p_scope, v_region, v_chapter, p.id, v_me)
  returning id into v_id;
  return v_id;
end $$;

-- The creator manages the committee while it is active.
create function public.own_active_committee(p_committee uuid)
returns public.committees language plpgsql stable security definer set search_path = '' as $$
declare c public.committees;
begin
  select * into c from public.committees where id = p_committee;
  if not found then raise exception 'committee not found'; end if;
  if not public.runs_committee(p_committee) then
    raise exception 'this committee is run by the post at its level (President General, Regional Coordinator or Chapter President)' using errcode = '42501';
  end if;
  if c.status <> 'active' then raise exception 'this committee has been dissolved'; end if;
  return c;
end $$;

create function public.add_committee_member(p_committee uuid, p_member uuid, p_position public.committee_position default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.committees := public.own_active_committee(p_committee); v_id uuid;
begin
  if not exists (select 1 from public.members where id = p_member and status = 'active') then raise exception 'member not found'; end if;
  if p_member <> public.current_member_id() and not public.in_committee_scope(p_committee, p_member) then
    raise exception 'a committee takes its members from its own region or chapter';
  end if;
  -- One active committee per person and one holder per position: also unique indexes.
  if exists (select 1 from public.committee_members m join public.committees x on x.id = m.committee_id
             where m.member_id = p_member and m.ended_at is null and x.status = 'active') then
    raise exception 'this member is already on an active committee';
  end if;
  insert into public.committee_members (committee_id, member_id, position, added_by)
  values (c.id, p_member, p_position, public.current_member_id()) returning id into v_id;
  return v_id;
end $$;

create function public.set_committee_position(p_membership uuid, p_position public.committee_position)
returns void language plpgsql security definer set search_path = '' as $$
declare v_committee uuid;
begin
  select committee_id into v_committee from public.committee_members where id = p_membership and ended_at is null;
  if not found then raise exception 'committee member not found'; end if;
  perform public.own_active_committee(v_committee);
  update public.committee_members set position = p_position where id = p_membership;
end $$;

create function public.remove_committee_member(p_membership uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_committee uuid;
begin
  select committee_id into v_committee from public.committee_members where id = p_membership and ended_at is null;
  if not found then raise exception 'committee member not found'; end if;
  perform public.own_active_committee(v_committee);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'give a reason'; end if;
  update public.committee_members set ended_at = now(), ended_by = public.current_member_id(), end_reason = trim(p_reason) where id = p_membership;
end $$;

-- Dissolving (reason required) frees its members and closes its books; history is kept.
create function public.dissolve_committee(p_committee uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.committees := public.own_active_committee(p_committee);
begin
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'give the reason for dissolving the committee'; end if;
  update public.committees set status = 'dissolved', dissolved_by = public.current_member_id(), dissolved_at = now(), dissolve_reason = trim(p_reason) where id = c.id;
  update public.committee_members set ended_at = now(), ended_by = public.current_member_id(), end_reason = 'Committee dissolved'
  where committee_id = c.id and ended_at is null;
end $$;

-- Committee messages: the President writes to the creator; the creator to the committee.
create function public.send_committee_message(p_committee uuid, p_to text, p_title text, p_body text, p_attachments uuid[] default '{}')
returns int language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.current_member_id(); c public.committees; v_to uuid; v_n uuid; v_count int := 0; v_doc uuid;
begin
  select * into c from public.committees where id = p_committee and status = 'active';
  if not found then raise exception 'committee not found or dissolved'; end if;
  if p_to = 'creator' then
    if public.my_committee_position(p_committee) is null or public.my_committee_position(p_committee) not in ('PRESIDENT', 'VICE_PRESIDENT') then
      raise exception 'only the committee''s President writes to the post that runs it' using errcode = '42501';
    end if;
  elsif p_to = 'committee' then
    if not public.runs_committee(p_committee) then raise exception 'only the post that runs the committee writes to it' using errcode = '42501'; end if;
  else
    raise exception 'unknown recipient';
  end if;
  if exists (select 1 from public.documents d where d.id = any (coalesce(p_attachments, '{}'))
             and (d.uploaded_by <> v_me or not d.is_attachment)) then
    raise exception 'attach only files you uploaded for this message';
  end if;
  for v_to in
    select h from public.committee_holders(p_committee) h where p_to = 'creator'
    union select m.member_id from public.committee_members m where p_to = 'committee' and m.committee_id = p_committee and m.ended_at is null
  loop
    continue when v_to = v_me;
    insert into public.notifications (type, title, body, audience_member_id, created_by, committee_id)
    values ('message', '[' || c.name || '] ' || trim(p_title), trim(p_body), v_to, v_me, c.id) returning id into v_n;
    foreach v_doc in array coalesce(p_attachments, '{}') loop
      insert into public.notification_attachments (notification_id, document_id) values (v_n, v_doc);
    end loop;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ── Committee meetings, attendance, minutes ──
-- Mirrors a chapter EXCO: the President and Secretary schedule; the President,
-- Vice President and Secretary record attendance and mark meetings held or
-- cancelled; the Secretary writes and publishes the minutes. All writes go
-- through these functions; the tables have read policies only.
create policy "read committee meetings" on public.committee_meetings for select to authenticated
  using (public.committee_visible(committee_id));
create policy "read committee attendance" on public.committee_attendance for select to authenticated
  using (exists (select 1 from public.committee_meetings m where m.id = meeting_id and public.committee_visible(m.committee_id)));
-- Drafts: only the committee's Secretary and President.
create policy "read committee minutes" on public.committee_minutes for select to authenticated
  using (exists (select 1 from public.committee_meetings m where m.id = meeting_id and public.committee_visible(m.committee_id)
                 and (committee_minutes.status = 'published' or public.my_committee_position(m.committee_id) in ('SECRETARY', 'PRESIDENT', 'VICE_PRESIDENT'))));

-- Tells the committee's current members (except the sender).
create function public.notify_committee(p_committee uuid, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (type, title, body, audience_member_id, link, created_by, committee_id)
  select 'announcement', '[' || c.name || '] ' || p_title, p_body, m.member_id, p_link, public.current_member_id(), c.id
  from public.committee_members m join public.committees c on c.id = m.committee_id
  where m.committee_id = p_committee and m.ended_at is null and m.member_id <> public.current_member_id()
$$;
revoke execute on function public.notify_committee(uuid, text, text, text) from public, anon, authenticated;

create function public.schedule_committee_meeting(p_committee uuid, p_title text, p_starts_at timestamptz, p_location text, p_agenda jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if public.my_committee_position(p_committee) is null or public.my_committee_position(p_committee) not in ('PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY')
     or public.registration_due(public.current_member_id()) then
    raise exception 'meetings are scheduled by the committee''s President or Secretary' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_location, ''))) < 2 then raise exception 'enter where the meeting takes place'; end if;
  insert into public.committee_meetings (committee_id, title, starts_at, location, agenda, created_by)
  values (p_committee, trim(p_title), p_starts_at, trim(p_location), coalesce(p_agenda, '[]'::jsonb), public.current_member_id())
  returning id into v_id;
  perform public.notify_committee(p_committee, 'Meeting: ' || trim(p_title), trim(p_location) || '. Open the meeting for the agenda.',
                                  '/dashboard/committees/' || p_committee || '/meetings/' || v_id);
  return v_id;
end $$;

-- The meeting, if I am one of its committee's meeting officers (President, Vice President, Secretary).
create function public.my_committee_meeting(p_meeting uuid)
returns public.committee_meetings language plpgsql stable security definer set search_path = '' as $$
declare m public.committee_meetings;
begin
  select * into m from public.committee_meetings where id = p_meeting;
  if not found then raise exception 'meeting not found'; end if;
  if public.my_committee_position(m.committee_id) is null
     or public.my_committee_position(m.committee_id) not in ('PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY')
     or public.registration_due(public.current_member_id()) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  return m;
end $$;

create function public.set_committee_meeting_status(p_meeting uuid, p_status public.meeting_status)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.committee_meetings := public.my_committee_meeting(p_meeting);
begin
  if p_status not in ('held', 'cancelled') then raise exception 'mark the meeting held or cancelled'; end if;
  if m.status <> 'scheduled' then raise exception 'this meeting is already marked held or cancelled'; end if;
  update public.committee_meetings set status = p_status where id = m.id;
end $$;

create function public.record_committee_attendance(p_meeting uuid, p_member uuid, p_status public.attendance_status)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.committee_meetings := public.my_committee_meeting(p_meeting);
begin
  if m.status = 'cancelled' then raise exception 'this meeting was cancelled'; end if;
  if not exists (select 1 from public.committee_members x where x.committee_id = m.committee_id and x.member_id = p_member and x.ended_at is null) then
    raise exception 'attendance is recorded for the committee''s members only';
  end if;
  insert into public.committee_attendance (meeting_id, member_id, status, recorded_by)
  values (m.id, p_member, p_status, public.current_member_id())
  on conflict (meeting_id, member_id) do update set status = excluded.status, recorded_by = excluded.recorded_by, recorded_at = now();
end $$;

-- The committee's Secretary saves a draft or publishes; published minutes are final.
create function public.save_committee_minutes(p_meeting uuid, p_text text, p_decisions jsonb default '[]'::jsonb, p_publish boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.committee_meetings; v_status public.minutes_status;
begin
  select * into m from public.committee_meetings where id = p_meeting;
  if not found then raise exception 'meeting not found'; end if;
  if public.my_committee_position(m.committee_id) is distinct from 'SECRETARY' or public.registration_due(public.current_member_id()) then
    raise exception 'minutes are written by the committee''s Secretary' using errcode = '42501';
  end if;
  if m.status = 'cancelled' then raise exception 'this meeting was cancelled'; end if;
  if length(trim(coalesce(p_text, ''))) < 10 then raise exception 'write the minutes'; end if;
  select status into v_status from public.committee_minutes where meeting_id = m.id;
  if v_status = 'published' then raise exception 'these minutes are published and can no longer be changed'; end if;
  insert into public.committee_minutes (meeting_id, status, text, decisions, recorded_by, published_at)
  values (m.id, case when p_publish then 'published' else 'draft' end::public.minutes_status, trim(p_text), coalesce(p_decisions, '[]'::jsonb),
          public.current_member_id(), case when p_publish then now() end)
  on conflict (meeting_id) do update set status = excluded.status, text = excluded.text, decisions = excluded.decisions,
    recorded_by = excluded.recorded_by, updated_at = now(), published_at = excluded.published_at;
  if p_publish then
    perform public.notify_committee(m.committee_id, 'Minutes published: ' || m.title, 'The minutes are now available on the meeting page.',
                                    '/dashboard/committees/' || m.committee_id || '/meetings/' || m.id);
  end if;
end $$;

-- Contributions: VIEW ≠ RECORD ≠ VOID. No delete policy exists (and a trigger forbids it).
create policy "read own or in scope" on public.contributions for select to authenticated using (
  member_id = public.current_member_id()
  or (ledger = 'committee' and public.committee_books_visible(committee_id))
  or (ledger = 'chapter' and public.has_permission('VIEW_CONTRIBUTIONS', 'chapter', null, chapter_id))
  or (ledger = 'central' and public.has_permission('VIEW_CONTRIBUTIONS', 'organization'))
);
create policy "record contributions" on public.contributions for insert to authenticated with check (
  recorded_by = public.current_member_id()
  and status = 'recorded'
  and public.member_chapter(member_id) = chapter_id
  -- while the recorder's own registration is unpaid: registration payments only
  and (not public.registration_due(public.current_member_id()) or registration_fee_year is not null)
  and (
    -- a chapter's ledger: written by that chapter's own officers
    (ledger = 'chapter'
     and public.has_local_permission('RECORD_CONTRIBUTION', chapter_id)
     and (collection_id is null or exists (
           select 1 from public.collections col
           where col.id = collection_id
             and public.scope_covers(col.scope_level, col.region_id, col.chapter_id, 'chapter', null, contributions.chapter_id))))
    -- the central ledger: written at organisation level; only organisation-wide collections
    or (ledger = 'central'
        and public.has_permission('RECORD_CONTRIBUTION', 'organization')
        and (collection_id is null or exists (
              select 1 from public.collections col where col.id = collection_id and col.scope_level = 'organization')))
    -- (committees take no payments directly: members pay their chapter, which sends project money on)
  )
);

-- Collections: visible along the member's own line or within finance scope;
-- set up only with MANAGE_COLLECTIONS over the chosen scope.
create policy "read collections" on public.collections for select to authenticated using (
  -- Every member can see the yearly registration projects (they owe them).
  exists (select 1 from public.registration_renewals rr where rr.collection_id = collections.id)
  or public.in_membership_line(scope_level, region_id, chapter_id)
  or public.has_permission('VIEW_CONTRIBUTIONS', scope_level, region_id, chapter_id)
  or public.has_permission('VIEW_FINANCIAL_REPORTS', scope_level, region_id, chapter_id)
  or public.has_permission('MANAGE_COLLECTIONS', scope_level, region_id, chapter_id)
  or created_by = public.current_member_id()
);
-- A project belongs to the body that sets it up: MANAGE_COLLECTIONS at exactly that scope.
create policy "set up collections" on public.collections for insert to authenticated with check (
  public.has_exact_permission('MANAGE_COLLECTIONS', scope_level, region_id, chapter_id)
  and created_by = public.current_member_id()
);

-- Expenses: visible up the hierarchy to anyone with finance access over the
-- body that spent the money; recorded only by the keeper of those funds
-- (RECORD_EXPENSE at exactly that scope). Voided via void_expense(); never deleted.
create policy "read expenses in scope" on public.expenses for select to authenticated using (
  case when committee_id is not null and scope_level <> 'chapter' then public.committee_books_visible(committee_id) else
    (committee_id is not null and public.committee_books_visible(committee_id))
    or public.has_permission('VIEW_CONTRIBUTIONS', scope_level, region_id, chapter_id)
    or public.has_permission('VIEW_FINANCIAL_REPORTS', scope_level, region_id, chapter_id)
    or public.has_exact_permission('RECORD_EXPENSE', scope_level, region_id, chapter_id)
  end
);
create policy "record expenses" on public.expenses for insert to authenticated with check (
  recorded_by = public.current_member_id()
  and status = 'recorded'
  and spent_on <= current_date
  and case when committee_id is not null then
    -- money given to a committee: by the project manager, while it is active — a chapter
    -- project's from the chapter's funds (a chapter expense), otherwise in the committee's scope
    public.funds_committee(committee_id)
    and exists (select 1 from public.committees x join public.collections col on col.id = x.collection_id
                where x.id = committee_id
                  and case when col.scope_level = 'chapter'
                    then expenses.scope_level = 'chapter' and expenses.chapter_id = col.chapter_id
                    else x.scope_level = expenses.scope_level and x.region_id is not distinct from expenses.region_id
                         and x.chapter_id is not distinct from expenses.chapter_id end)
  else public.has_exact_permission('RECORD_EXPENSE', scope_level, region_id, chapter_id) end
);
create policy "annotate contributions" on public.contributions for update to authenticated
  using ((ledger = 'chapter' and public.has_local_permission('EDIT_CONTRIBUTION', chapter_id))
         or (ledger = 'central' and public.has_permission('EDIT_CONTRIBUTION', 'organization')))
  with check (status = 'recorded');

-- Documents
-- Notifications
-- Notification visibility lives in one SECURITY DEFINER function so that it
-- can be reused by policies that look at other notification rows (forwards,
-- read receipts) without recursing into the table's own RLS.
--   * individual notices reach that member;
--   * scope notices reach the member's own line (organisation → region → chapter);
--   * group messages reach only holders of the named roles whose chapter lies
--     inside the scope.
create function public.notification_visible_to_me(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.notifications n
    where n.id = p_id and (
      n.audience_member_id = public.current_member_id()
      or (n.scope_level is not null and n.audience_role_keys is null
          and public.in_membership_line(n.scope_level, n.region_id, n.chapter_id))
      or (n.audience_role_keys is not null
          and public.scope_covers(n.scope_level, n.region_id, n.chapter_id, 'chapter', null,
                                  public.member_chapter(public.current_member_id()))
          and exists (select 1 from public.member_roles mr
                      where mr.member_id = public.current_member_id() and mr.status = 'active'
                        and mr.role_key = any (n.audience_role_keys)))
    )
  )
$$;

-- A forward is valid only "as received": the sender received the copy being
-- forwarded, it is a message or announcement, and subject, text and type are
-- unchanged and point at the same original.
create function public.valid_forward(p_from uuid, p_original uuid, p_type public.notification_type, p_title text, p_body text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.notification_visible_to_me(p_from) and exists (
    select 1 from public.notifications r
    where r.id = p_from
      and r.type in ('message', 'announcement')
      and r.type = p_type
      and r.title = p_title
      and r.body = p_body
      and coalesce(r.original_id, r.id) = p_original
  )
$$;

-- Who can see a document:
--   * its uploader;
--   * anyone who can see a message it is attached to (or a forward of it);
--   * if the uploader chose offices, only holders of them within the scope;
--   * otherwise the scope's members and officers with document rights over it
--     (financial documents additionally need VIEW_FINANCIAL_REPORTS).
create function public.document_visible_to_me(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_id and d.deleted_at is null and (
      d.uploaded_by = public.current_member_id()
      or (d.committee_id is not null and public.committee_visible(d.committee_id))
      -- A meeting's documents: only those who can see the meeting.
      or (d.meeting_id is not null and public.meeting_visible(d.meeting_id))
    )
  ) or exists (
    select 1 from public.documents d
    where d.id = p_id and d.deleted_at is null and d.committee_id is null and d.meeting_id is null and (
      exists (select 1 from public.notification_attachments na
                 where na.document_id = d.id and public.notification_visible_to_me(na.notification_id))
      or (not d.is_attachment and d.audience_role_keys is not null
          and public.scope_covers(d.scope_level, d.region_id, d.chapter_id, 'chapter', null,
                                  public.member_chapter(public.current_member_id()))
          and exists (select 1 from public.member_roles mr
                      where mr.member_id = public.current_member_id() and mr.status = 'active'
                        and mr.role_key = any (d.audience_role_keys)))
      or (not d.is_attachment and d.audience_role_keys is null and (
            (d.category <> 'financial' and (public.in_membership_line(d.scope_level, d.region_id, d.chapter_id)
                                            or public.has_permission('UPLOAD_DOCUMENT', d.scope_level, d.region_id, d.chapter_id)
                                            or public.has_permission('DOWNLOAD_DOCUMENT', d.scope_level, d.region_id, d.chapter_id)))
            or (d.category = 'financial' and public.has_permission('VIEW_FINANCIAL_REPORTS', d.scope_level, d.region_id, d.chapter_id))))
    )
  )
$$;

-- True when `p_notification` is a forward and `p_document` was attached to
-- the copy it forwards (which the forwarder must have been able to see).
create function public.forward_carries_attachment(p_notification uuid, p_document uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.notifications n
    join public.notification_attachments na on na.notification_id = n.forwarded_from
    where n.id = p_notification and na.document_id = p_document
      and public.notification_visible_to_me(n.forwarded_from)
  )
$$;

-- Documents (rules defined after the visibility helpers they use)
-- The uploader check is inline (not only inside the helper) so that
-- INSERT … RETURNING works: the helper cannot yet see the row being inserted.
create policy "read documents" on public.documents for select to authenticated
  using (deleted_at is null and (uploaded_by = public.current_member_id() or public.document_visible_to_me(id)));
-- Upload: UPLOAD_DOCUMENT over the scope, or, for message attachments,
-- MANAGE_NOTIFICATIONS over it (the right to send the message).
-- Committee documents: the committee's President, Secretary or Financial Secretary.
-- Committee message attachments: the committee's President or its creator.
create policy "upload documents" on public.documents for insert to authenticated with check (
  uploaded_by = public.current_member_id() and (
    (committee_id is null and meeting_id is null and (
      public.has_permission('UPLOAD_DOCUMENT', scope_level, region_id, chapter_id)
      or (is_attachment and public.has_permission('MANAGE_NOTIFICATIONS', scope_level, region_id, chapter_id))
      or (is_attachment and exists (select 1 from public.committees c where c.status = 'active'
            and (public.runs_committee(c.id) or public.my_committee_position(c.id) in ('PRESIDENT', 'VICE_PRESIDENT'))))))
    -- A meeting's documents: whoever writes its minutes (Secretaries, the Regional Coordinator, the National Secretary General).
    or (meeting_id is not null and committee_id is null and not is_attachment
        and exists (select 1 from public.meetings m where m.id = meeting_id and m.status <> 'cancelled'
                    and m.scope_level = documents.scope_level and m.region_id is not distinct from documents.region_id
                    and m.chapter_id is not distinct from documents.chapter_id
                    and public.has_exact_permission('CREATE_MINUTES', m.scope_level, m.region_id, m.chapter_id)))
    or (committee_id is not null and not public.registration_due(public.current_member_id())
        and public.my_committee_position(committee_id) in ('PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY', 'FINANCIAL_SECRETARY')
        and (committee_meeting_id is null
             or exists (select 1 from public.committee_meetings m where m.id = committee_meeting_id and m.committee_id = documents.committee_id)))
  )
);
create policy "soft delete documents" on public.documents for update to authenticated
  using (public.has_permission('DELETE_DOCUMENT', scope_level, region_id, chapter_id))
  with check (deleted_by = public.current_member_id());


-- Senders can always read what they sent (their "Sent" list); the inline
-- check also lets INSERT … RETURNING succeed.
create policy "read notifications" on public.notifications for select to authenticated
  using (created_by = public.current_member_id() or public.notification_visible_to_me(id));

create policy "send notifications" on public.notifications for insert to authenticated with check (
  created_by = public.current_member_id() and (
    (scope_level is not null and public.has_permission('MANAGE_NOTIFICATIONS', scope_level, region_id, chapter_id))
    or (audience_member_id is not null and public.has_permission('MANAGE_NOTIFICATIONS', 'chapter', null, public.member_chapter(audience_member_id)))
  )
  and (forwarded_from is null or public.valid_forward(forwarded_from, original_id, type, title, body))
);

-- Attachments are visible with the message. A sender may attach only their
-- own uploads; a forwarder may only re-attach what was on the message they
-- received ("as received").
create policy "read attachments" on public.notification_attachments for select to authenticated
  using (public.notification_visible_to_me(notification_id));
create policy "attach documents" on public.notification_attachments for insert to authenticated with check (
  exists (select 1 from public.notifications n where n.id = notification_id and n.created_by = public.current_member_id())
  and (
    exists (select 1 from public.documents d where d.id = document_id and d.uploaded_by = public.current_member_id())
    or public.forward_carries_attachment(notification_id, document_id)
  )
);

-- Read receipts: your own, and only for notifications you can see.
create policy "own read receipts" on public.notification_reads for all to authenticated
  using (member_id = public.current_member_id())
  with check (member_id = public.current_member_id()
              and public.notification_visible_to_me(notification_id));

-- Audit log: read within VIEW_AUDIT_LOG scope. No client writes — triggers and RPCs only.
-- The level of the highest post someone held when they acted (national 0,
-- regional 1, chapter 2); members count as chapter level.
create function public.audit_actor_level(p_roles text[])
returns int language sql stable security definer set search_path = '' as $$
  select least(2, coalesce(min(case r.scope_level when 'organization' then 0 when 'region' then 1 else 2 end), 2))
  from public.roles r where r.key = any (coalesce(p_roles, '{}'))
$$;

-- The audit log follows the hierarchy, by post: an officer sees what happened in
-- their area — but nothing done by someone whose post at the time was at a higher
-- level. A Chapter President sees his chapter's chapter-level actions only; a
-- Regional Coordinator her region's chapter and regional actions; the President
-- General everything.
create policy "read audit in scope" on public.audit_logs for select to authenticated using (
  case
    when chapter_id is not null then public.has_permission('VIEW_AUDIT_LOG', 'chapter', null, chapter_id)
    when region_id is not null then public.has_permission('VIEW_AUDIT_LOG', 'region', region_id, null)
    else public.has_permission('VIEW_AUDIT_LOG', 'organization')
  end
  and case public.audit_actor_level(actor_roles)
    when 0 then public.has_permission('VIEW_AUDIT_LOG', 'organization')
    when 1 then public.has_permission('VIEW_AUDIT_LOG', 'region', coalesce(region_id, public.chapter_region(chapter_id)), null)
    else true
  end
);

-- Renewals are visible to every signed-in member (each sees their own standing).
create policy "members read renewals" on public.registration_renewals for select to authenticated using (public.current_member_id() is not null);

-- Starts the yearly renewal (President General): everyone is inactive until
-- their registration for the year is paid at their chapter, at its fee.
create function public.start_registration_renewal(p_year int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.current_member_id(); v_id uuid;
begin
  if not public.has_permission('MANAGE_REGISTRATION', 'organization') then
    raise exception 'the registration renewal is started by the President General' using errcode = '42501';
  end if;
  insert into public.registration_renewals (year, opened_by) values (p_year, v_me) returning id into v_id;
  perform public.write_audit('CREATE', 'registration_renewals', v_id::text, null, null, 'Started Registration ' || p_year);
  return v_id;
end $$;

-- The chapter's Financial Secretary sets (or changes) its registration fee;
-- payments already recorded keep the amount paid at the time.
create function public.set_chapter_registration_fee(p_chapter uuid, p_amount bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old bigint;
begin
  if not public.has_exact_permission('CREATE_MEMBER', 'chapter', null, p_chapter) then
    raise exception 'the chapter''s registration amount is set by its Financial Secretary' using errcode = '42501';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'enter the registration amount'; end if;
  select registration_fee into v_old from public.chapters where id = p_chapter;
  update public.chapters set registration_fee = p_amount where id = p_chapter;
  perform public.write_audit('UPDATE', 'chapters', p_chapter::text, p_chapter, null, 'Set the registration amount to ' || p_amount,
                             jsonb_build_object('registration_fee', v_old), jsonb_build_object('registration_fee', p_amount));
end $$;

-- Undoes the current renewal (the previous period applies again; payments are kept).
create function public.cancel_registration_renewal(p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_r public.registration_renewals;
begin
  if not public.has_permission('MANAGE_REGISTRATION', 'organization') then
    raise exception 'the registration renewal is managed by the President General' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'give a reason'; end if;
  select * into v_r from public.registration_renewals order by opened_at desc limit 1;
  if not found then raise exception 'no registration renewal is in progress'; end if;
  delete from public.registration_renewals where id = v_r.id;
  perform public.write_audit('UPDATE', 'registration_renewals', v_r.id::text, null, null, 'Cancelled Registration ' || v_r.year, null, null, p_reason);
end $$;

-- ── Function privileges ──────────────────────────────────────────────────
-- Internal helpers: nobody calls these directly.
revoke all on function public.write_audit(public.audit_action, text, text, uuid, uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.audit_row_change() from public, anon, authenticated;

-- RPCs: signed-in users only (each re-checks permission and scope internally).
revoke all on function
  public.create_member(text, text, text, uuid),
  public.set_member_status(uuid, public.membership_status, text),
  public.create_chapter(text, text, uuid, jsonb, uuid, uuid),
  public.create_region(text, uuid, jsonb),
  public.appoint_region_coordinator(uuid, uuid, jsonb),
  public.transfer_member(uuid, uuid, text),
  public.update_region(uuid, text),
  public.update_chapter(uuid, text, text),
  public.assign_role(uuid, text, uuid),
  public.end_role(uuid, text),
  public.delegate_authority(uuid, text[], public.scope_level, uuid, uuid, timestamptz, text),
  public.void_contribution(uuid, text),
  public.void_expense(uuid, text),
  public.complete_action_item(uuid),
  public.log_event(public.audit_action, text, text, uuid, text),
  public.update_my_profile(text, text, text),
  public.create_committee(text, public.scope_level, uuid, uuid, uuid),
  public.add_committee_member(uuid, uuid, public.committee_position),
  public.set_committee_position(uuid, public.committee_position),
  public.remove_committee_member(uuid, text),
  public.dissolve_committee(uuid, text),
  public.send_committee_message(uuid, text, text, text, uuid[]),
  public.start_registration_renewal(int),
  public.set_chapter_registration_fee(uuid, bigint),
  public.cancel_registration_renewal(text)
from public, anon;
grant execute on function
  public.create_member(text, text, text, uuid),
  public.set_member_status(uuid, public.membership_status, text),
  public.create_chapter(text, text, uuid, jsonb, uuid, uuid),
  public.create_region(text, uuid, jsonb),
  public.appoint_region_coordinator(uuid, uuid, jsonb),
  public.transfer_member(uuid, uuid, text),
  public.update_region(uuid, text),
  public.update_chapter(uuid, text, text),
  public.assign_role(uuid, text, uuid),
  public.end_role(uuid, text),
  public.delegate_authority(uuid, text[], public.scope_level, uuid, uuid, timestamptz, text),
  public.void_contribution(uuid, text),
  public.void_expense(uuid, text),
  public.complete_action_item(uuid),
  public.log_event(public.audit_action, text, text, uuid, text),
  public.update_my_profile(text, text, text),
  public.create_committee(text, public.scope_level, uuid, uuid, uuid),
  public.add_committee_member(uuid, uuid, public.committee_position),
  public.set_committee_position(uuid, public.committee_position),
  public.remove_committee_member(uuid, text),
  public.dissolve_committee(uuid, text),
  public.send_committee_message(uuid, text, text, text, uuid[]),
  public.start_registration_renewal(int),
  public.set_chapter_registration_fee(uuid, bigint),
  public.cancel_registration_renewal(text)
to authenticated;
revoke all on function public.next_reference(text), public.prepare_contribution(), public.prepare_expense(), public.new_member_account(jsonb), public.owes_fines(uuid), public.check_founding_member(uuid) from public, anon, authenticated;
