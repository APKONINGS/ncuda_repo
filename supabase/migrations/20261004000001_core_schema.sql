-- ════════════════════════════════════════════════════════════════════════
-- NCUDA — core schema
--
-- Organisation → (optional) Region → Chapter → Member
-- Authorization = role + permission + scope, enforced HERE by Row Level
-- Security. The application never relies on the browser for security.
--
-- Conventions
--   * History is never destroyed: roles are ended, chapter moves close the
--     previous row, financial records are voided — not deleted.
--   * Privileged writes go through SECURITY DEFINER functions that re-check
--     permission and scope (see 20261004000002_functions_policies.sql).
-- ════════════════════════════════════════════════════════════════════════


-- ── Enumerations ─────────────────────────────────────────────────────────
create type public.scope_level        as enum ('organization', 'region', 'chapter');
create type public.membership_status  as enum ('active', 'suspended', 'inactive');
create type public.assignment_status  as enum ('active', 'ended');
create type public.delegation_status  as enum ('active', 'revoked');
create type public.meeting_status     as enum ('scheduled', 'held', 'cancelled');
create type public.attendance_status  as enum ('present', 'absent', 'excused', 'late');
create type public.minutes_status     as enum ('draft', 'published');
create type public.action_status      as enum ('pending', 'in_progress', 'completed');
create type public.contribution_type  as enum ('contribution', 'fine');   -- the only two kinds of payment
create type public.record_status      as enum ('recorded', 'voided');
create type public.document_category  as enum ('minutes', 'association', 'reports', 'financial', 'forms', 'other');
create type public.notification_type  as enum ('meeting_reminder', 'announcement', 'document_uploaded', 'action_assigned', 'action_due', 'minutes_published', 'message', 'receipt');
create type public.audit_action       as enum ('CREATE', 'VIEW', 'UPDATE', 'DELETE', 'VOID', 'APPROVE', 'REJECT', 'ASSIGN_ROLE', 'REMOVE_ROLE', 'UPLOAD', 'DOWNLOAD', 'EXPORT', 'LOGIN', 'LOGOUT');

-- Reusable check: a (level, region_id, chapter_id) triple is well-formed.
create function public.valid_scope(l public.scope_level, r uuid, c uuid)
returns boolean language sql immutable as $$
  select case l
    when 'organization' then r is null and c is null
    when 'region'       then r is not null and c is null
    when 'chapter'      then c is not null and r is null
  end
$$;

-- ── Structure ────────────────────────────────────────────────────────────
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table public.regions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id),
  name             text not null,
  created_at       timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.chapters (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id),
  region_id        uuid references public.regions(id),   -- null: reports directly to the organisation
  name             text not null,
  location         text,
  registration_fee bigint check (registration_fee > 0),  -- set by the chapter's Financial Secretary; the same for everyone
  created_at       timestamptz not null default now(),
  unique (organization_id, name)
);

-- ── Members ──────────────────────────────────────────────────────────────
create table public.members (
  id               uuid primary key default gen_random_uuid(),
  auth_user_id     uuid unique references auth.users(id) on delete set null,
  organization_id  uuid not null references public.organizations(id),
  full_name        text not null check (length(trim(full_name)) >= 3),
  email            text not null,
  phone            text check (phone is null or (phone ~ '^\+?[0-9 -]+$' and length(regexp_replace(phone, '\D', '', 'g')) >= 6)),  -- digits, spaces, hyphens, leading +
  member_number    text not null unique,
  status           public.membership_status not null default 'active',
  status_reason    text,                                   -- latest change; full history in audit_logs
  status_changed_by uuid references public.members(id),
  status_changed_at timestamptz,
  joined_at        timestamptz not null default now(),
  created_by       uuid references public.members(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index members_email_unique on public.members (lower(email));

-- Chapter history: exactly one open row per member.
create table public.member_chapter_history (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members(id),
  chapter_id   uuid not null references public.chapters(id),
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  recorded_by  uuid references public.members(id),
  note         text,
  check (ended_at is null or ended_at > started_at)
);
create unique index member_one_current_chapter on public.member_chapter_history (member_id) where ended_at is null;
create index on public.member_chapter_history (chapter_id) where ended_at is null;

-- ── Roles & permissions (configurable data, not code) ────────────────────
create table public.permissions (
  key    text primary key,
  label  text not null,
  grp    text not null
);

create table public.roles (
  key          text primary key,
  name         text not null,
  description  text,
  scope_level  public.scope_level not null,
  rank         int not null default 100
);

create table public.role_permissions (
  role_key        text not null references public.roles(key) on delete cascade,
  permission_key  text not null references public.permissions(key),
  primary key (role_key, permission_key)
);

-- Which roles a holder of `role_key` may assign/remove (within their scope).
create table public.role_assignable_roles (
  role_key             text not null references public.roles(key) on delete cascade,
  assignable_role_key  text not null references public.roles(key) on delete cascade,
  primary key (role_key, assignable_role_key)
);

-- Role history: rows are ended, never deleted or overwritten.
create table public.member_roles (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members(id),
  role_key     text not null references public.roles(key),
  scope_level  public.scope_level not null,
  region_id    uuid references public.regions(id),
  chapter_id   uuid references public.chapters(id),
  status       public.assignment_status not null default 'active',
  assigned_by  uuid references public.members(id),    -- null only for seeded/elected central office
  assigned_at  timestamptz not null default now(),
  ended_at     timestamptz,
  ended_by     uuid references public.members(id),
  end_reason   text,
  check (public.valid_scope(scope_level, region_id, chapter_id)),
  check (assigned_by is null or assigned_by <> member_id),               -- no self-assignment
  check ((status = 'active') = (ended_at is null))
);
-- One person, one post: at most ONE active role per member. To move someone to
-- another post, their current one is ended first (history is kept).
create unique index member_roles_one_active_post on public.member_roles (member_id) where status = 'active';
-- …and one holder per post: the same role at the same place can be held by only one person at a time.
create unique index member_roles_one_holder_per_post on public.member_roles
  (role_key, scope_level, coalesce(region_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(chapter_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'active';

create table public.authority_delegations (
  id           uuid primary key default gen_random_uuid(),
  granted_by   uuid not null references public.members(id),
  granted_to   uuid not null references public.members(id),
  scope_level  public.scope_level not null,
  region_id    uuid references public.regions(id),
  chapter_id   uuid references public.chapters(id),
  permissions  text[] not null check (cardinality(permissions) > 0),
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz,
  status       public.delegation_status not null default 'active',
  note         text,
  created_at   timestamptz not null default now(),
  check (granted_by <> granted_to),
  check (public.valid_scope(scope_level, region_id, chapter_id)),
  check (ends_at is null or ends_at > starts_at)
);

-- ── Meetings ─────────────────────────────────────────────────────────────
create table public.meetings (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  location     text,
  scope_level  public.scope_level not null,
  region_id    uuid references public.regions(id),
  chapter_id   uuid references public.chapters(id),
  status       public.meeting_status not null default 'scheduled',
  agenda       jsonb not null default '[]'::jsonb,
  created_by   uuid not null references public.members(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Who it is for: every member of its scope, its executives (post holders) only, or selected people.
  audience     text not null default 'all' check (audience in ('all', 'executives', 'selected')),
  cancel_reason text,
  not_held     boolean not null default false,          -- cancelled after its start time: it did not take place
  -- Automatic reminders already sent: 'day' (24 hours before) and 'morning' (07:00 WAT on the day).
  reminders_sent text[] not null default '{}' check (reminders_sent <@ array['day', 'morning']),
  -- Chapter meetings: all members or executives. Regional and national: all members or chosen people.
  check ((scope_level = 'chapter' and audience in ('all', 'executives')) or (scope_level <> 'chapter' and audience in ('all', 'selected'))),
  check (public.valid_scope(scope_level, region_id, chapter_id)),
  check (ends_at is null or ends_at > starts_at)
);
-- For a "selected" meeting (e.g. a national EXCO meeting): the people invited.
create table public.meeting_invitees (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  member_id  uuid not null references public.members(id),
  primary key (meeting_id, member_id)
);
-- A national meeting may also call whole regions or chapters (all of their members).
create table public.meeting_invite_groups (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  region_id  uuid references public.regions(id),
  chapter_id uuid references public.chapters(id),
  check ((region_id is null) <> (chapter_id is null)),
  unique (meeting_id, region_id, chapter_id)
);

create table public.attendance (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references public.meetings(id),
  member_id    uuid not null references public.members(id),
  chapter_id   uuid not null references public.chapters(id),
  status       public.attendance_status not null,
  recorded_by  uuid not null references public.members(id),
  recorded_at  timestamptz not null default now(),
  unique (meeting_id, member_id)
);

create table public.meeting_minutes (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null unique references public.meetings(id),
  status        public.minutes_status not null default 'draft',
  discussion    text not null default '',
  key_issues    jsonb not null default '[]'::jsonb,
  resolutions   jsonb not null default '[]'::jsonb,
  recorded_by   uuid not null references public.members(id),
  updated_at    timestamptz not null default now(),
  published_at  timestamptz
);

create table public.decisions (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references public.meetings(id),
  text         text not null,
  recorded_by  uuid not null references public.members(id),
  created_at   timestamptz not null default now()
);

create table public.action_items (
  id            uuid primary key default gen_random_uuid(),
  decision_id   uuid not null references public.decisions(id),
  meeting_id    uuid not null references public.meetings(id),
  title         text not null,
  assignee_id   uuid not null references public.members(id),
  due_date      timestamptz not null,
  status        public.action_status not null default 'pending',
  completed_at  timestamptz,
  completed_by  uuid references public.members(id)
);
create index on public.action_items (assignee_id) where status <> 'completed';

-- ── Finance (records only — no payment processing) ──────────────────────
-- A project (collection), e.g. a tractor purchase. Organisation-wide projects
-- are raised chapter by chapter; regions and chapters may run their own.
-- Each sets what every executive and every ordinary member is expected to pay.
create table public.collections (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,                    -- shown as "Project"
  description      text not null check (length(trim(description)) >= 3),  -- the purpose
  scope_level      public.scope_level not null,
  region_id        uuid references public.regions(id),
  chapter_id       uuid references public.chapters(id),
  executive_amount bigint not null check (executive_amount >= 0),   -- whole XAF per executive
  member_amount    bigint not null check (member_amount >= 0),      -- whole XAF per ordinary member
  starts_on      date not null,
  ends_on        date,
  created_by     uuid not null references public.members(id),
  created_at     timestamptz not null default now(),
  check (public.valid_scope(scope_level, region_id, chapter_id)),
  check (ends_on is null or ends_on >= starts_on),
  check (executive_amount > 0 or member_amount > 0)
);

-- Committees carry out one project each: national (President General) or
-- regional (that region's coordinator). Visible only to their members, their
-- creator and the President General. Positions are separate from chapter and
-- regional posts; one active committee per person.
create type public.committee_position as enum ('PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY', 'FINANCIAL_SECRETARY', 'TREASURER');
create table public.committees (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  purpose         text not null check (length(trim(purpose)) >= 3),
  scope_level     public.scope_level not null,                        -- national, regional or chapter
  region_id       uuid references public.regions(id),
  chapter_id      uuid references public.chapters(id),
  collection_id   uuid not null references public.collections(id),   -- its project
  created_by      uuid not null references public.members(id),
  created_at      timestamptz not null default now(),
  status          text not null default 'active' check (status in ('active', 'dissolved')),
  dissolved_by    uuid references public.members(id),
  dissolved_at    timestamptz,
  dissolve_reason text,
  check (public.valid_scope(scope_level, region_id, chapter_id)),
  check (status = 'active' or (dissolved_by is not null and dissolved_at is not null and length(trim(dissolve_reason)) >= 5))
);
create table public.committee_members (
  id            uuid primary key default gen_random_uuid(),
  committee_id  uuid not null references public.committees(id),
  member_id     uuid not null references public.members(id),
  position      public.committee_position,          -- null: ordinary committee member
  added_by      uuid not null references public.members(id),
  added_at      timestamptz not null default now(),
  ended_at      timestamptz,
  ended_by      uuid references public.members(id),
  end_reason    text
);
-- One active committee per person; one holder per position in a committee.
create unique index committee_members_one_active on public.committee_members (member_id) where ended_at is null;
create unique index committee_members_one_per_position on public.committee_members (committee_id, position) where ended_at is null and position is not null;

-- A committee's own meetings, attendance and minutes (separate from chapter meetings).
create table public.committee_meetings (
  id            uuid primary key default gen_random_uuid(),
  committee_id  uuid not null references public.committees(id),
  title         text not null check (length(trim(title)) >= 3),
  starts_at     timestamptz not null,
  location      text not null,
  agenda        jsonb not null default '[]'::jsonb,
  status        public.meeting_status not null default 'scheduled',
  created_by    uuid not null references public.members(id),
  created_at    timestamptz not null default now()
);
create table public.committee_attendance (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references public.committee_meetings(id),
  member_id    uuid not null references public.members(id),
  status       public.attendance_status not null,
  recorded_by  uuid not null references public.members(id),
  recorded_at  timestamptz not null default now(),
  unique (meeting_id, member_id)
);
create table public.committee_minutes (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null unique references public.committee_meetings(id),
  status        public.minutes_status not null default 'draft',
  text          text not null,
  decisions     jsonb not null default '[]'::jsonb,
  recorded_by   uuid not null references public.members(id),
  updated_at    timestamptz not null default now(),
  published_at  timestamptz,
  check ((status = 'published') = (published_at is not null))
);

create table public.contributions (
  id           uuid primary key default gen_random_uuid(),
  -- 'chapter': kept by the chapter's Financial Secretary.
  -- 'central': money received directly by the central body (Central Financial Secretary).
  ledger       text not null default 'chapter' check (ledger in ('chapter', 'central', 'committee')),
  committee_id uuid references public.committees(id),     -- the committee ledger's committee
  member_id    uuid not null references public.members(id), -- every payment comes from a member
  chapter_id   uuid not null references public.chapters(id),
  type         public.contribution_type not null,
  collection_id uuid references public.collections(id),   -- the project (required for a contribution, never for a fine)
  registration_fee_year int,                              -- a new member's registration fee, paid on joining; counts as that year's registration
  description  text not null,                             -- a contribution's project purpose, or a fine's reason
  expected_amount bigint check (expected_amount >= 0),    -- what the payer was expected to pay (set by trigger)
  amount       bigint not null check (amount >= 0),       -- amount paid, whole XAF
  settles_fine_id uuid references public.contributions(id), -- a payment towards an earlier fine
  currency     char(3) not null default 'XAF',
  received_on  date not null,
  reference    text not null unique,                      -- receipt number, generated by trigger (RC-2026-00042)
  status       public.record_status not null default 'recorded',
  recorded_by  uuid not null references public.members(id),
  recorded_at  timestamptz not null default now(),
  voided_by    uuid references public.members(id),
  voided_at    timestamptz,
  void_reason  text,
  check (status = 'recorded' or (voided_by is not null and voided_at is not null and length(trim(void_reason)) >= 5)),
  check (type <> 'contribution' or collection_id is not null or registration_fee_year is not null),  -- towards a project, or a registration fee
  check (registration_fee_year is null or (type = 'contribution' and collection_id is null and ledger = 'chapter')),
  check (type <> 'fine' or collection_id is null),              -- fines are never part of a project
  check (settles_fine_id is null or type = 'fine'),
  check ((ledger = 'committee') = (committee_id is not null)),
  check (ledger <> 'committee' or type = 'contribution'),   -- committees receive contributions to their project
  check (amount > 0 or (type = 'fine' and settles_fine_id is null)) -- only a newly imposed fine may be unpaid
);
create index on public.contributions (chapter_id, received_on desc);
create index on public.contributions (member_id);
create index on public.contributions (collection_id);
create index on public.contributions (settles_fine_id) where settles_fine_id is not null;

-- Money spent from a chapter's, a region's or the central funds.
create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  committee_id uuid references public.committees(id),     -- money the committee's creator gave to the committee
  -- Project money a chapter sent to the creator of the project's committees (a chapter expense).
  sent_for_collection_id uuid references public.collections(id),
  sent_to      uuid references public.members(id),
  scope_level  public.scope_level not null,               -- whose funds: organisation (central), region or chapter
  region_id    uuid references public.regions(id),
  chapter_id   uuid references public.chapters(id),
  description  text not null check (length(trim(description)) >= 3),
  paid_to      text,
  amount       bigint not null check (amount > 0),        -- whole XAF
  currency     char(3) not null default 'XAF',
  spent_on     date not null,
  reference    text not null unique,                      -- voucher number, generated by trigger (PV-2026-00007)
  status       public.record_status not null default 'recorded',
  recorded_by  uuid not null references public.members(id),
  recorded_at  timestamptz not null default now(),
  voided_by    uuid references public.members(id),
  voided_at    timestamptz,
  void_reason  text,
  check (public.valid_scope(scope_level, region_id, chapter_id)),
  check (status = 'recorded' or (voided_by is not null and voided_at is not null and length(trim(void_reason)) >= 5)),
  check ((sent_for_collection_id is null) = (sent_to is null)),
  check (sent_for_collection_id is null or (scope_level = 'chapter' and committee_id is null))
);
create index on public.expenses (scope_level, region_id, chapter_id, spent_on desc);

-- Yearly counters behind receipt (RC) and voucher (PV) numbers. Only the
-- numbering function touches this table.
create table public.reference_counters (
  kind       text not null check (kind in ('RC', 'PV')),
  year       int  not null,
  last_value int  not null default 0,
  primary key (kind, year)
);

-- Yearly registration renewals. While the latest one is open, everyone who
-- joined before it is inactive until their fee (the project collection_id)
-- is paid in full — see public.registration_due().
create table public.registration_renewals (
  id            uuid primary key default gen_random_uuid(),
  year          int not null unique check (year between 2000 and 2100),
  collection_id uuid references public.collections(id),  -- older renewals only; each chapter's fee now applies
  opened_by     uuid not null references public.members(id),
  opened_at     timestamptz not null default now()
);

-- ── Documents (metadata; files live in Supabase Storage) ─────────────────
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  filename      text not null,
  category      public.document_category not null,
  storage_path  text not null unique,                     -- object name in the private `documents` bucket
  size_bytes    bigint not null check (size_bytes >= 0),
  mime_type     text not null,
  scope_level   public.scope_level not null,
  region_id     uuid references public.regions(id),
  chapter_id    uuid references public.chapters(id),
  meeting_id    uuid references public.meetings(id),
  uploaded_by   uuid not null references public.members(id),
  uploaded_at   timestamptz not null default now(),
  deleted_at    timestamptz,                               -- soft delete
  deleted_by    uuid references public.members(id),
  audience_role_keys text[],                               -- optional: only holders of these offices within the scope
  is_attachment boolean not null default false,            -- attached to a message: visibility follows the message
  committee_id  uuid references public.committees(id),     -- a committee's document: seen only by the committee, its creator and the President General
  committee_meeting_id uuid references public.committee_meetings(id),
  check (committee_meeting_id is null or committee_id is not null),
  check (committee_id is null or not is_attachment),       -- message attachments stay with their message
  check (public.valid_scope(scope_level, region_id, chapter_id)),
  check (audience_role_keys is null or cardinality(audience_role_keys) > 0)
);

-- ── Notifications ────────────────────────────────────────────────────────
create table public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  type                public.notification_type not null,
  title               text not null,
  body                text not null,
  audience_member_id  uuid references public.members(id),  -- individual …
  scope_level         public.scope_level,                  -- … or a scope
  region_id           uuid references public.regions(id),
  chapter_id          uuid references public.chapters(id),
  audience_role_keys  text[],                              -- optional: only holders of these roles within the scope
  forwarded_from      uuid references public.notifications(id), -- set on forwards: the copy the forwarder received
  original_id         uuid references public.notifications(id), -- … and the original message it descends from
  forward_note        text check (forward_note is null or length(forward_note) <= 500),
  link                text,
  created_by          uuid references public.members(id),
  created_at          timestamptz not null default now(),
  check (
    (audience_member_id is not null and scope_level is null and region_id is null and chapter_id is null)
    or (audience_member_id is null and scope_level is not null and public.valid_scope(scope_level, region_id, chapter_id))
  ),
  check (audience_role_keys is null or (scope_level is not null and cardinality(audience_role_keys) > 0)),
  committee_id        uuid references public.committees(id),  -- a committee message (listed on the committee's page)
  check ((forwarded_from is null) = (original_id is null)),
  check (forward_note is null or forwarded_from is not null)
);

-- Documents attached to a message. Forwards carry the original's attachments.
create table public.notification_attachments (
  notification_id  uuid not null references public.notifications(id) on delete cascade,
  document_id      uuid not null references public.documents(id),
  primary key (notification_id, document_id)
);

create table public.notification_reads (
  notification_id  uuid not null references public.notifications(id) on delete cascade,
  member_id        uuid not null references public.members(id),
  read_at          timestamptz not null default now(),
  primary key (notification_id, member_id)
);

-- ── Audit log (append-only) ──────────────────────────────────────────────
create table public.audit_logs (
  id               bigint generated always as identity primary key,
  at               timestamptz not null default now(),
  actor_member_id  uuid references public.members(id),
  actor_roles      text[] not null default '{}',
  action           public.audit_action not null,
  entity_type      text not null,
  entity_id        text,
  chapter_id       uuid references public.chapters(id),
  region_id        uuid references public.regions(id),
  summary          text,
  old_values       jsonb,
  new_values       jsonb,
  reason           text
);
create index on public.audit_logs (chapter_id, at desc);
create index on public.audit_logs (region_id, at desc);
create index on public.audit_logs (entity_type, entity_id);

-- ── Settings ─────────────────────────────────────────────────────────────
create table public.settings (
  organization_id  uuid not null references public.organizations(id),
  key              text not null,
  value            jsonb not null,
  updated_at       timestamptz not null default now(),
  primary key (organization_id, key)
);
