import { ExportLink, PrintButton } from "@/components/portal/PageTools";
import {
  ArrowUpRight,
  Eye,
  FileBarChart,
  Layers,
  PenLine,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { CreateCollectionForm } from "@/components/portal/CreateCollectionForm";
import { VoidContributionButton } from "@/components/portal/forms";
import { RecordExpenseForm } from "@/components/portal/RecordExpenseForm";
import { sendableProjects } from "@/lib/portal/committees";
import { RecordPaymentForm } from "@/components/portal/RecordPaymentForm";
import {
  EmptyState,
  PageHeader,
  Panel,
  Pill,
  Stat,
  tableClasses as t,
} from "@/components/portal/ui";
import { requireActor } from "@/lib/auth/actor";
import { hasAnywhere, type Actor } from "@/lib/permissions/engine";
import { recordAudit } from "@/lib/portal/audit";
import { contactFor, type ContactInfo } from "@/lib/portal/contacts";
import { Contact } from "@/components/portal/Contact";
import {
  chapterName,
  chapterRegionId,
  collectionScopeOptions,
  collectionSummaries,
  contributionMemberOptions,
  financialSummary,
  myContributions,
  outstandingFines,
  scopedContributions,
  scopedExpenses,
  visibleCollections,
  centralPayerOptions,
  CENTRAL_LEDGER,
  PAYMENT_KINDS,
  type PaymentKind,
  type ContributionRow,
  type ExpenseRow,
  type FinanceFilters,
} from "@/lib/portal/queries";
import { cn, formatDate, formatMoney, plural } from "@/lib/utils";

export const metadata = { title: "Finances" };

/** The region all these chapters share, or null (organisation-level) if they span regions. */
function sharedRegion(chapterIds: string[]) {
  const regions = new Set(chapterIds.map(chapterRegionId));
  const [only] = regions;
  return regions.size === 1 ? (only ?? null) : null;
}

/** "National Summary" (PG, central officers), "Regional Summary" (coordinators) or "Chapter Summary" (chapter officers). */
function summaryLabel(actor: Actor) {
  const levels = new Set(actor.grants.filter((g) => g.permission === "VIEW_FINANCIAL_REPORTS").map((g) => g.scope.level));
  return levels.has("organization") ? "National Summary" : levels.has("region") ? "Regional Summary" : "Chapter Summary";
}

const TYPE_LABEL = {
  contribution: "Contribution",
  fine: "Fine",
  registration: "Registration",
} as const;
const KIND_TONE = { contribution: "neutral", fine: "earth", registration: "green" } as const;

type TabKey = "mine" | "records" | "collections" | "expenses" | "summary" | "record";
const TABS: Array<{
  key: TabKey;
  label: string;
  hint: string;
  icon: LucideIcon;
  allowed: (a: Actor) => boolean;
}> = [
  {
    key: "mine",
    label: "My Summary",
    hint: "Your payments and balance",
    icon: Wallet,
    allowed: () => true,
  },
  {
    key: "records",
    label: "Chapter records",
    hint: "All payments in your scope",
    icon: Eye,
    allowed: (a) => hasAnywhere(a, "VIEW_CONTRIBUTIONS"),
  },
  {
    key: "collections",
    label: "Contributions",
    hint: "Expected, collected and owed",
    icon: Layers,
    allowed: (a) =>
      hasAnywhere(a, "VIEW_CONTRIBUTIONS") ||
      hasAnywhere(a, "VIEW_FINANCIAL_REPORTS") ||
      hasAnywhere(a, "MANAGE_COLLECTIONS"),
  },
  {
    key: "expenses",
    label: "Expenses",
    hint: "Money spent",
    icon: ArrowUpRight,
    allowed: (a) =>
      hasAnywhere(a, "VIEW_CONTRIBUTIONS") ||
      hasAnywhere(a, "VIEW_FINANCIAL_REPORTS") ||
      hasAnywhere(a, "RECORD_EXPENSE"),
  },
  {
    key: "summary",
    label: "Summary",
    hint: "This year's totals",
    icon: FileBarChart,
    allowed: (a) => hasAnywhere(a, "VIEW_FINANCIAL_REPORTS"),
  },
  {
    key: "record",
    label: "Record a payment",
    hint: "A contribution or fine",
    icon: PenLine,
    allowed: (a) => hasAnywhere(a, "RECORD_CONTRIBUTION") && !a.inactive,
  },
];

/**
 * Finances are sensitive, so nothing is shown until the member opens a tab.
 * Only the opened tab's data is loaded, and opening other members' records
 * is recorded in the audit log.
 */
export default async function FinancesPage({
  searchParams,
}: PageProps<"/dashboard/finances">) {
  const actor = await requireActor({ allowInactive: true });
  // The summary is named after the widest scope the actor sees: National, Regional or Chapter.
  const tabs = TABS.filter((tab) => tab.allowed(actor)).map((tab) => (tab.key === "summary" ? { ...tab, label: summaryLabel(actor) } : tab));
  const params = await searchParams;
  const active = tabs.find((tab) => tab.key === params.tab)?.key ?? null;

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Finances"
        title="Finances"
      />

      <nav
        aria-label="Finance sections"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 print:hidden"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={
              active === tab.key
                ? "/dashboard/finances"
                : `/dashboard/finances?tab=${tab.key}`
            }
            aria-current={active === tab.key ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm transition-colors",
              active === tab.key
                ? "bg-forest-900 text-paper"
                : "border border-line-strong text-ink-700 hover:bg-cream",
            )}
          >
            <tab.icon className="h-4 w-4" strokeWidth={1.6} aria-hidden />
            {tab.label}
          </Link>
        ))}
      </nav>

      {active === null && <Closed tabs={tabs} />}
      {active === "mine" && <MineTab actor={actor} params={params} />}
      {active === "records" && <RecordsTab actor={actor} params={params} />}
      {active === "collections" && <CollectionsTab actor={actor} />}
      {active === "expenses" && <ExpensesTab actor={actor} />}
      {active === "summary" && (
        <div className="grid gap-4">
          <div className="flex justify-end">
            <PrintButton label={`Print ${summaryLabel(actor)}`} />
          </div>
          <SummaryTab actor={actor} />
        </div>
      )}
      {active === "record" && <RecordTab actor={actor} />}
    </div>
  );
}

function Closed({ tabs }: { tabs: typeof TABS }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={`/dashboard/finances?tab=${tab.key}`}
          className="group flex items-start gap-4 rounded-[var(--radius-lg)] border border-line bg-white/60 p-5 transition-[border-color,box-shadow] hover:border-forest-700/40 hover:shadow-[var(--shadow-soft)]"
        >
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream text-forest-800 group-hover:bg-forest-900 group-hover:text-paper"
          >
            <tab.icon className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <span>
            <span className="block font-display text-lg text-forest-900">
              {tab.label}
            </span>
            <span className="mt-1 block text-sm text-ink-500">{tab.hint}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

/* ── Mine ───────────────────────────────────────────────────────────── */

function MineTab({ actor, params }: { actor: Actor; params: Params }) {
  const mine = myContributions(actor);
  const show = one(params.show);
  const kind = show && show in TYPE_LABEL ? (show as PaymentKind) : null;
  const recorded = mine.rows.filter((r) => r.status === "recorded");
  const totals = PAYMENT_KINDS.map((k) => ({ k, amount: recorded.filter((r) => r.kind === k).reduce((sum, r) => sum + r.amount, 0) }));
  const rows = kind ? mine.rows.filter((r) => r.kind === kind) : mine.rows;
  const chip = (k: PaymentKind | null, label: string) => (
    <Link
      key={label}
      href={k ? `/dashboard/finances?tab=mine&show=${k}` : "/dashboard/finances?tab=mine"}
      aria-current={kind === k ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        kind === k ? "border-forest-800 bg-forest-800 text-paper" : "border-line text-ink-700 hover:border-ink-300",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {totals.map((x) => (
          <Panel key={x.k}>
            <Stat label={`${TYPE_LABEL[x.k]} paid`} value={formatMoney(x.amount)} />
          </Panel>
        ))}
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Panel>
          <Stat
            label="You have paid"
            value={formatMoney(mine.total)}
            hint={plural(
              mine.rows.filter((r) => r.status === "recorded").length,
              "record",
            )}
          />
        </Panel>
        <Panel tone={mine.owed > 0 ? "cream" : "light"}>
          <Stat
            label="You still owe"
            value={formatMoney(mine.owed)}
            hint={
              mine.owed > 0
                ? "Across the projects and fines below"
                : "Nothing outstanding — thank you"
            }
          />
        </Panel>
      </div>

      {(mine.projects.length > 0 || mine.fines.length > 0) && (
        <Panel title="What you owe" bodyClassName="overflow-x-auto">
          <p className="mb-3 text-xs text-ink-500">
            Projects ask a set amount of each{" "}
            {mine.executive ? "executive (your rate)" : "member"}. Pay your
            Financial Secretary; the record updates once they enter it.
          </p>
          <table className={t.table}>
            <thead>
              <tr>
                <th scope="col" className={t.th}>
                  Project or fine
                </th>
                <th scope="col" className={`${t.th} text-right`}>
                  Expected
                </th>
                <th scope="col" className={`${t.th} text-right`}>
                  Paid
                </th>
                <th scope="col" className={`${t.th} text-right`}>
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {mine.projects.map((p) => (
                <tr key={p.collectionId}>
                  <td className={t.td}>
                    <span className="font-medium text-ink-900">{p.name}</span>
                    {p.endsOn && (
                      <span className="block text-xs text-ink-500">
                        Until {formatDate(p.endsOn)}
                      </span>
                    )}
                  </td>
                  <td className={`${t.td} num text-right`}>
                    {formatMoney(p.expected)}
                  </td>
                  <td className={`${t.td} num text-right`}>
                    {formatMoney(p.paid)}
                  </td>
                  <td className={`${t.td} num text-right`}>
                    <Balance amount={p.balance} />
                  </td>
                </tr>
              ))}
              {mine.fines.map((f) => (
                <tr key={f.id}>
                  <td className={t.td}>
                    <span className="flex flex-wrap items-center gap-2">
                      <Pill tone="earth">Fine</Pill>
                      <span className="text-ink-900">{f.description}</span>
                    </span>
                    <span className="block text-xs text-ink-500">
                      {formatDate(f.on)}
                    </span>
                  </td>
                  <td className={`${t.td} num text-right`}>
                    {formatMoney(f.imposed)}
                  </td>
                  <td className={`${t.td} num text-right`}>
                    {formatMoney(f.paid)}
                  </td>
                  <td className={`${t.td} num text-right`}>
                    <Balance amount={f.balance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Panel title="Your records" bodyClassName="overflow-x-auto">
        <nav className="mb-4 flex flex-wrap gap-2" aria-label="Show">
          {chip(null, "All")}
          {chip("contribution", "Contributions")}
          {chip("fine", "Fines")}
          {chip("registration", "Registration")}
        </nav>
        {rows.length === 0 ? (
          <EmptyState title={kind ? `No ${TYPE_LABEL[kind].toLowerCase()} records` : "No payments recorded yet"}>
            
          </EmptyState>
        ) : (
          <ContributionTable rows={rows} showMember={false} contactOf={(id) => contactFor(actor, id)} />
        )}
      </Panel>
    </div>
  );
}

function Balance({ amount }: { amount: number }) {
  return amount > 0 ? (
    <span className="font-medium text-earth-800">{formatMoney(amount)}</span>
  ) : (
    <span className="text-forest-700">Paid ✓</span>
  );
}

/* ── Records ────────────────────────────────────────────────────────── */

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) =>
  typeof v === "string" && v ? v : undefined;
const isDate = (v?: string) =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

function RecordsTab({ actor, params }: { actor: Actor; params: Params }) {
  const all = scopedContributions(actor);
  if (!all) return null;
  const collections = visibleCollections(actor);
  const typeParam = one(params.type);
  const filters: FinanceFilters = {
    chapterId:
      all.chapterIds.includes(one(params.chapter) ?? "") ||
      (all.seesCentral && one(params.chapter) === CENTRAL_LEDGER)
        ? one(params.chapter)
        : undefined,
    collectionId:
      one(params.collection) === "none" ||
      collections.some((c) => c.id === one(params.collection))
        ? one(params.collection)
        : undefined,
    type:
      typeParam && typeParam in TYPE_LABEL
        ? (typeParam as FinanceFilters["type"])
        : undefined,
    from: isDate(one(params.from)),
    to: isDate(one(params.to)),
  };
  const scoped = scopedContributions(actor, filters)!;
  const filtered = Object.values(filters).some(Boolean);

  // Accessing other members' financial records is itself an auditable event.
  const viewingCentral = filters.chapterId === CENTRAL_LEDGER;
  const single =
    !scoped.seesCentral && scoped.chapterIds.length === 1
      ? scoped.chapterIds[0]
      : null;
  const viewedChapter = viewingCentral ? null : (filters.chapterId ?? single);
  recordAudit(actor, {
    action: "VIEW",
    entityType: "contribution",
    entityId: null,
    chapterId: viewedChapter,
    regionId: viewedChapter
      ? undefined
      : scoped.seesCentral
        ? null
        : sharedRegion(scoped.chapterIds),
    summary: `Viewed contribution records (${viewingCentral ? "central ledger" : filters.chapterId ? chapterName(filters.chapterId) : [...(scoped.seesCentral ? ["central ledger"] : []), ...scoped.chapterIds.map(chapterName)].join(", ")})`,
  });

  return (
    <section aria-labelledby="records-title" className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="records-title"
            className="font-display text-2xl text-forest-900"
          >
            Chapter records
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {plural(scoped.totals.count, "record")} ·{" "}
            <span className="num font-medium text-ink-900">
              {formatMoney(scoped.totals.amount)}
            </span>
            {scoped.totals.voided > 0 && ` · ${scoped.totals.voided} cancelled`}
            {filtered && " · filtered"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {scoped.recordableChapterIds.length === 0 &&
            !scoped.canRecordCentral && <Pill>View only</Pill>}
          <ExportLink kind="payments" query={{ chapter: filters.chapterId, collection: filters.collectionId, type: filters.type, from: filters.from, to: filters.to }} label={filtered ? "Download these records" : "Download spreadsheet"} />
          <PrintButton />
        </div>
        {scoped.canRecordCentral && (
          <Pill tone="gold">
            You keep the central ledger · chapters view only
          </Pill>
        )}
      </div>

      {/* Filters (a plain GET form: works without JavaScript, and the URL can be shared).
          Keyed on the applied filters so that Clear (or any change of filters) resets every box. */}
      <form
        key={[filters.chapterId, filters.collectionId, filters.type, filters.from, filters.to].join("|")}
        method="get"
        className="print:hidden grid gap-3 rounded-[var(--radius-lg)] border border-line bg-cream/50 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end"
      >
        <input type="hidden" name="tab" value="records" />
        {(scoped.chapterIds.length > 1 || scoped.seesCentral) && (
          <label className="grid gap-1.5 text-xs font-medium text-ink-700">
            Chapter
            <select
              name="chapter"
              defaultValue={filters.chapterId ?? ""}
              className={filterInput}
            >
              <option value="">All chapters</option>
              {scoped.seesCentral && (
                <option value={CENTRAL_LEDGER}>Central (NCUDA) ledger</option>
              )}
              {[...scoped.chapterIds].sort((a, b) => chapterName(a).localeCompare(chapterName(b), "en", { numeric: true, sensitivity: "base" })).map((id) => (
                <option key={id} value={id}>
                  {chapterName(id)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-1.5 text-xs font-medium text-ink-700">
          Project
          <select
            name="collection"
            defaultValue={filters.collectionId ?? ""}
            className={filterInput}
          >
            <option value="">All payments</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="none">Not part of a contribution</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-ink-700">
          Type
          <select
            name="type"
            defaultValue={filters.type ?? ""}
            className={filterInput}
          >
            <option value="">All types</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-ink-700">
          From
          <input
            type="date"
            name="from"
            defaultValue={filters.from ?? ""}
            className={filterInput}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-ink-700">
          To
          <input
            type="date"
            name="to"
            defaultValue={filters.to ?? ""}
            className={filterInput}
          />
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <button
            type="submit"
            className="h-10 flex-1 rounded-[var(--radius-sm)] bg-forest-800 px-4 text-sm font-medium text-paper hover:bg-forest-900"
          >
            Apply
          </button>
          {filtered && (
            <Link
              href="/dashboard/finances?tab=records"
              className="inline-flex h-10 items-center rounded-[var(--radius-sm)] border border-line-strong px-3 text-sm text-ink-700 hover:bg-paper"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {scoped.groups.length === 0 ? (
        <Panel>
          <EmptyState
            compact
            title={
              filtered
                ? "No records match these filters"
                : "No records in your scope yet"
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4">
          {scoped.groups.map((g) => (
            <details
              key={g.chapterId}
              open={scoped.groups.length <= 2 || !!filters.chapterId}
              className="group rounded-[var(--radius-lg)] border border-line bg-white/60"
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="text-ink-500 transition-transform group-open:rotate-90"
                  >
                    ›
                  </span>
                  <span>
                    <span className="block font-display text-lg text-forest-900">
                      {g.chapterName}
                    </span>
                    <span className="text-xs text-ink-500">
                      {g.regionName ?? "Reports directly to the organisation"} ·{" "}
                      {plural(g.totals.count, "record")}
                      {g.totals.voided ? ` · ${g.totals.voided} cancelled` : ""}
                    </span>
                  </span>
                </span>
                <span className="num font-display text-xl text-forest-900">
                  {formatMoney(g.totals.amount)}
                </span>
              </summary>
              <div className="relative overflow-x-auto border-t border-line px-5 py-2 sm:px-6">
                <ContributionTable
                  rows={g.rows}
                  showMember
                  canVoid={(r) => scoped.canVoid(r)}
                  contactOf={(id) => contactFor(actor, id)}
                />
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

const filterInput =
  "h-10 w-full rounded-[var(--radius-sm)] border border-line-strong bg-paper px-3 text-sm font-normal text-ink-900 focus:border-forest-700 focus:outline-none focus:ring-2 focus:ring-forest-700/15";

/* ── Collections ────────────────────────────────────────────────────── */

function Progress({
  value,
  max,
  label,
  tone = "forest",
}: {
  value: number;
  max: number;
  label: string;
  tone?: "forest" | "earth";
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <span
      className="block h-2 overflow-hidden rounded-full bg-bone"
      role="img"
      aria-label={`${label}: ${pct}%`}
    >
      <span
        className={cn(
          "block h-full rounded-full",
          tone === "forest" ? "bg-forest-700" : "bg-earth-500",
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

function CollectionsTab({ actor }: { actor: Actor }) {
  const summaries = collectionSummaries(actor);
  const scopes = collectionScopeOptions(actor);
  const fines = outstandingFines(actor);
  const seesRecords = hasAnywhere(actor, "VIEW_CONTRIBUTIONS");
  if (seesRecords) {
    recordAudit(actor, {
      action: "VIEW",
      entityType: "collection",
      entityId: null,
      chapterId: null,
      regionId: null,
      summary: "Viewed project balances and outstanding amounts",
    });
  }
  return (
    <div className="grid gap-6">
      {scopes && (
        <details className="group rounded-[var(--radius-lg)] border border-line bg-cream/60">
          <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block font-display text-lg text-forest-900">
                New Project
              </span>
            </span>
            <span
              aria-hidden
              className="text-2xl text-ink-500 transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <div className="border-t border-line px-6 py-6">
            <CreateCollectionForm scopes={scopes} />
          </div>
        </details>
      )}

      {summaries.length === 0 ? (
        <Panel>
          <EmptyState compact title="No projects yet">
            
          </EmptyState>
        </Panel>
      ) : (
        // Grouped by scope (whole organisation, regional, chapter); newest projects first.
        (
          [
            ["organization", "Whole organisation"],
            ["region", "Regional"],
            ["chapter", "Chapter"],
          ] as const
        ).map(([level, label]) => {
          const list = summaries.filter((x) => x.scope.level === level).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          if (list.length === 0) return null;
          return (
            <details key={level} className="group rounded-[var(--radius-lg)] border border-line bg-paper">
              <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block font-display text-lg text-forest-900">{label}</span>
                  <span className="text-sm text-ink-500">{plural(list.length, "project")}</span>
                </span>
                <span aria-hidden className="text-2xl text-ink-500 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="grid gap-6 border-t border-line p-4 sm:p-6">
                {list.map((c) => (
              <Panel
                key={c.id}
                title={c.name}
                action={
                  <Pill tone={c.scope.level === "organization" ? "dark" : "neutral"}>
                    {c.scopeLabel}
                  </Pill>
                }
              >
                <p className="text-sm leading-relaxed text-ink-700">
                  {c.description}
                </p>
                <p className="mt-2 text-xs text-ink-500">
                  Executives{" "}
                  <span className="num font-medium text-ink-900">
                    {formatMoney(c.expected.executive)}
                  </span>{" "}
                  · Members{" "}
                  <span className="num font-medium text-ink-900">
                    {formatMoney(c.expected.member)}
                  </span>{" "}
                  each · {c.started ? "since" : "starts"} {formatDate(c.startsOn)}
                  {c.endsOn ? ` · until ${formatDate(c.endsOn)}` : ""}
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <Stat
                    label={c.partial ? "Expected in your scope" : "Expected"}
                    value={formatMoney(c.expectedTotal)}
                    hint={plural(c.people, "person", "people")}
                  />
                  <Stat
                    label="Collected"
                    value={formatMoney(c.collected)}
                    hint={`${c.paidInFull} paid in full`}
                  />
                  <Stat
                    label="Outstanding"
                    value={formatMoney(c.outstanding)}
                    hint={c.started ? "Still owed" : "Not started yet"}
                  />
                </div>
                <div className="mt-4">
                  <Progress
                    value={c.collected}
                    max={c.expectedTotal}
                    label="Collected of expected"
                  />
                </div>

                {c.byChapter.length > 0 && (
                  <ul className="mt-6 grid gap-4 border-t border-line pt-5">
                    {c.byChapter.map((b) => (
                      <li key={b.chapterId} className="grid gap-2 text-sm">
                        <div className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
                          <span className="truncate text-ink-900">
                            {b.chapterName}
                          </span>
                          <Progress
                            value={b.collected}
                            max={b.expected}
                            label={`${b.chapterName} collected of expected`}
                            tone="earth"
                          />
                          <span className="num text-right text-ink-700">
                            {formatMoney(b.collected)}
                            <span className="text-xs text-ink-500">
                              {" "}
                              / {formatMoney(b.expected)}
                            </span>
                          </span>
                        </div>
                        <p className="text-xs text-ink-500 sm:pl-[10.75rem]">
                          {b.paidInFull} of {b.people} paid in full
                          {b.outstanding > 0 &&
                            ` · ${formatMoney(b.outstanding)} outstanding`}
                        </p>
                        {b.debtors && b.debtors.length > 0 && (
                          <details className="sm:pl-[10.75rem]">
                            <summary className="cursor-pointer text-xs font-medium text-earth-700">
                              Who still owes ({b.debtors.length})
                            </summary>
                            <ul className="mt-2 grid gap-1 rounded-[var(--radius-sm)] border border-line bg-paper p-3 text-xs">
                              {b.debtors.map((p) => (
                                <li
                                  key={p.memberId}
                                  className="flex flex-wrap justify-between gap-2"
                                >
                                  <span className="text-ink-900">
                                    {p.name}
                                    {p.executive && (
                                      <span className="text-ink-500"> · executive</span>
                                    )}
                                    <Contact contact={contactFor(actor, p.memberId)} />
                                  </span>
                                  <span className="num text-ink-700">
                                    paid {formatMoney(p.paid)} of{" "}
                                    {formatMoney(p.expected)} ·{" "}
                                    <span className="font-medium text-earth-800">
                                      {formatMoney(p.balance)} owed
                                    </span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 text-xs text-ink-500">
                  Set up by {c.createdByPost}
                  <Contact inline contact={contactFor(actor, c.createdBy)} />
                  {seesRecords && (
                    <>
                      {" · "}
                      <Link
                        href={`/dashboard/finances?tab=records&collection=${c.id}`}
                        className="text-earth-700 underline-offset-4 hover:underline"
                      >
                        View its records
                      </Link>
                    </>
                  )}
                </p>
              </Panel>
                ))}
              </div>
            </details>
          );
        })
      )}

      {fines.length > 0 && (
        <Panel title="Outstanding fines" bodyClassName="overflow-x-auto">
          <table className={t.table}>
            <thead>
              <tr>
                <th scope="col" className={t.th}>
                  Member
                </th>
                <th scope="col" className={t.th}>
                  Reason
                </th>
                <th scope="col" className={`${t.th} text-right`}>
                  Fine
                </th>
                <th scope="col" className={`${t.th} text-right`}>
                  Paid
                </th>
                <th scope="col" className={`${t.th} text-right`}>
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {fines.map((f) => (
                <tr key={f.fine.id}>
                  <td className={t.td}>
                    <span className="font-medium text-ink-900">
                      {f.row.memberName}
                    </span>
                    <span className="block text-xs text-ink-500">
                      {f.fine.ledger === "central"
                        ? "Central ledger"
                        : f.row.chapterName}
                    </span>
                    <Contact contact={contactFor(actor, f.fine.memberId)} />
                  </td>
                  <td className={t.td}>
                    {f.fine.description}
                    <span className="block text-xs text-ink-500">
                      {formatDate(f.fine.receivedOn)} · {f.fine.reference}
                    </span>
                  </td>
                  <td className={`${t.td} num text-right`}>
                    {formatMoney(f.imposed)}
                  </td>
                  <td className={`${t.td} num text-right`}>
                    {formatMoney(f.paid)}
                  </td>
                  <td className={`${t.td} num text-right`}>
                    <Balance amount={f.balance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

/* ── Expenses ───────────────────────────────────────────────────────── */

function ExpensesTab({ actor }: { actor: Actor }) {
  const ex = scopedExpenses(actor);
  recordAudit(actor, {
    action: "VIEW",
    entityType: "expense",
    entityId: null,
    chapterId: null,
    regionId: null,
    summary: `Viewed expenses (${ex.groups.map((g) => g.label).join(", ") || "none"})`,
  });
  return (
    <div className="grid gap-6">
      {ex.scopes.length > 0 && (
        <Panel title="Record an expense" tone="cream" className="print:hidden">
          <RecordExpenseForm
            scopes={ex.scopes}
            projects={ex.scopes.flatMap((sc) => (sc.value.startsWith("chapter:") ? sendableProjects(sc.value.slice(8)).map((pr) => ({ ...pr, scope: sc.value })) : []))}
          />
        </Panel>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-forest-900">Expenses</h2>
          <p className="mt-1 text-sm text-ink-500">
            Money spent ·{" "}
            <span className="num font-medium text-ink-900">
              {formatMoney(ex.total)}
            </span>{" "}
            in your scope
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ex.scopes.length === 0 && <Pill>View only</Pill>}
          <ExportLink kind="expenses" />
          <PrintButton />
        </div>
      </div>

      {ex.groups.length === 0 ? (
        <Panel>
          <EmptyState compact title="No expenses recorded in your scope" />
        </Panel>
      ) : (
        ex.groups.map((g) => (
          <details
            key={g.key}
            open={ex.groups.length <= 3}
            className="group rounded-[var(--radius-lg)] border border-line bg-white/60"
          >
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="text-ink-500 transition-transform group-open:rotate-90"
                >
                  ›
                </span>
                <span>
                  <span className="block font-display text-lg text-forest-900">
                    {g.label}
                  </span>
                  <span className="text-xs text-ink-500">
                    {g.level === "organization"
                      ? "Central funds"
                      : g.level === "region"
                        ? "Regional funds"
                        : "Chapter funds"}{" "}
                    · {plural(g.rows.length - g.voided, "expense")}
                    {g.voided ? ` · ${g.voided} cancelled` : ""}
                  </span>
                </span>
              </span>
              <span className="num font-display text-xl text-earth-800">
                −{formatMoney(g.total)}
              </span>
            </summary>
            <div className="relative overflow-x-auto border-t border-line px-5 py-2 sm:px-6">
              <ExpenseTable rows={g.rows} canVoid={ex.canVoid} contactOf={(id) => contactFor(actor, id)} />
            </div>
          </details>
        ))
      )}
    </div>
  );
}

function ExpenseTable({
  rows,
  canVoid,
  contactOf,
}: {
  rows: ExpenseRow[];
  canVoid: (e: ExpenseRow) => boolean;
  /** The recorder's email and phone (officers only). */
  contactOf?: (memberId: string) => ContactInfo | null;
}) {
  return (
    <table className={t.table}>
      <thead>
        <tr>
          <th scope="col" className={t.th}>
            Date
          </th>
          <th scope="col" className={t.th}>
            Spent on
          </th>
          <th scope="col" className={`${t.th} hidden lg:table-cell`}>
            Recorded by
          </th>
          <th scope="col" className={`${t.th} text-right`}>
            Amount
          </th>
          <th scope="col" className={`${t.th} text-right`}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const voided = r.status === "voided";
          return (
            <tr key={r.id} className={voided ? "bg-bone/40" : undefined}>
              <td className={`${t.td} num whitespace-nowrap`}>
                {formatDate(r.spentOn)}
              </td>
              <td className={t.td}>
                <span
                  className={
                    voided ? "text-ink-500 line-through" : "text-ink-900"
                  }
                >
                  {r.description}
                </span>
                <span className="mt-1 block text-xs text-ink-500">
                  {r.paidTo && <>Paid to {r.paidTo} · </>}
                  <span className="num">{r.reference}</span>
                </span>
                {voided && (
                  <span className="mt-2 block text-xs text-earth-800">
                    Cancelled {r.voidedAt && formatDate(r.voidedAt)} —{" "}
                    {r.voidReason}
                  </span>
                )}
              </td>
              <td className={`${t.td} hidden lg:table-cell`}>
                {r.recordedByName}
                <Contact contact={contactOf?.(r.recordedBy)} />
              </td>
              <td
                className={`${t.td} num whitespace-nowrap text-right font-medium ${voided ? "text-ink-300 line-through" : "text-ink-900"}`}
              >
                {formatMoney(r.amount)}
              </td>
              <td className={`${t.td} text-right`}>
                {!voided && canVoid(r) ? (
                  <VoidContributionButton
                    id={r.id}
                    kind="expense"
                    label={r.description}
                  />
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── Summary ────────────────────────────────────────────────────────── */

function SummaryTab({ actor }: { actor: Actor }) {
  const summary = financialSummary(actor);
  if (!summary) return null;
  const chapterKeys = summary
    .map((s) => s.key)
    .filter((k) => k !== CENTRAL_LEDGER && !k.startsWith("region:"));
  recordAudit(actor, {
    action: "VIEW",
    entityType: "financial_report",
    entityId: null,
    chapterId: summary.length === 1 && chapterKeys.length === 1 ? chapterKeys[0] : null,
    regionId:
      summary.length === 1 && chapterKeys.length === 1
        ? undefined
        : summary.some((s) => s.key === CENTRAL_LEDGER)
          ? null
          : sharedRegion(chapterKeys),
    summary: `Viewed financial summary (${summary.map((s) => s.name).join(", ")})`,
  });
  const year = new Date().getFullYear();
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {summary.map((s) => (
        <Panel key={s.key} tone="cream">
          <Stat
            label={`${s.name} · ${year}`}
            value={s.hasIncome ? formatMoney(s.balance) : `−${formatMoney(s.spent)}`}
            hint={s.hasIncome ? "Balance this year (in − out)" : "Spent from regional funds this year"}
          />
          <dl className="mt-4 grid gap-1.5 border-t border-line pt-4 text-sm">
            {s.hasIncome &&
              (["fine", "contribution", "registration"] as const).map((k) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-ink-500">{k === "fine" ? "Fines" : k === "contribution" ? "Contributions" : "Registration"}</dt>
                  <dd className="num text-ink-900">{formatMoney(s.byKind[k])}</dd>
                </div>
              ))}
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Expenses</dt>
              <dd className="num text-earth-800">−{formatMoney(s.spent)}</dd>
            </div>
          </dl>
        </Panel>
      ))}
      {!hasAnywhere(actor, "RECORD_CONTRIBUTION") && (
        <p className="text-xs text-ink-500 sm:col-span-2 lg:col-span-3">
          View only.
        </p>
      )}
    </div>
  );
}

/* ── Record ─────────────────────────────────────────────────────────── */

function RecordTab({ actor }: { actor: Actor }) {
  const chapter = contributionMemberOptions(actor);
  const central = centralPayerOptions(actor);
  return (
    <div className="grid gap-6">
      {central && (
        <Panel title="Record a central payment" tone="cream">
          <RecordPaymentForm
            mode="central"
            payers={central.members}
            projects={central.projects}
          />
        </Panel>
      )}
      {chapter.members.length > 0 && (
        <Panel title="Record a payment" tone="cream">
          <RecordPaymentForm
            mode="chapter"
            payers={chapter.members}
            projects={chapter.projects}
          />
        </Panel>
      )}
      {!central && chapter.members.length === 0 && (
        <Panel>
          <EmptyState compact title="No members to record for" />
        </Panel>
      )}
    </div>
  );
}

/** Where the payer stood right after a payment. */
function Standing({ owed }: { owed: number }) {
  return (
    <span
      className={cn(
        "block text-xs font-normal",
        owed > 0 ? "text-earth-800" : "text-forest-700",
      )}
    >
      {owed > 0
        ? `${formatMoney(owed)} still owed`
        : owed === 0
          ? "Now paid in full"
          : `Paid in full · ${formatMoney(-owed)} extra`}
    </span>
  );
}

/* ── Shared table ───────────────────────────────────────────────────── */

function ContributionTable({
  rows,
  showMember,
  canVoid,
  contactOf,
}: {
  rows: ContributionRow[];
  showMember: boolean;
  canVoid?: (r: ContributionRow) => boolean;
  /** The payer's email and phone (officers only). */
  contactOf?: (memberId: string) => ContactInfo | null;
}) {
  return (
    <table className={t.table}>
      <thead>
        <tr>
          <th scope="col" className={t.th}>
            Date
          </th>
          {showMember && (
            <th scope="col" className={t.th}>
              From
            </th>
          )}
          <th scope="col" className={t.th}>
            Description
          </th>
          <th scope="col" className={`${t.th} hidden lg:table-cell`}>
            Recorded by
          </th>
          <th scope="col" className={`${t.th} text-right`}>
            Paid
          </th>
          {canVoid && (
            <th scope="col" className={`${t.th} text-right`}>
              <span className="sr-only">Actions</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const voided = r.status === "voided";
          return (
            <tr key={r.id} className={voided ? "bg-bone/40" : undefined}>
              <td className={`${t.td} num whitespace-nowrap`}>
                {formatDate(r.receivedOn)}
              </td>
              {showMember && (
                <td className={t.td}>
                  <span className="font-medium text-ink-900">
                    {r.memberName}
                  </span>
                  <span className="block text-xs text-ink-500">
                    {r.chapterName}
                  </span>
                  <Contact contact={contactOf?.(r.memberId)} />
                </td>
              )}
              <td className={t.td}>
                <span
                  className={
                    voided ? "text-ink-500 line-through" : "text-ink-900"
                  }
                >
                  {r.description}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                  <Pill tone={KIND_TONE[r.kind]}>{TYPE_LABEL[r.kind]}</Pill>
                  {r.collectionName && (
                    <Pill tone="gold">{r.collectionName}</Pill>
                  )}
                  {r.settlesFineId && <span>Towards an earlier fine</span>}
                  <span className="num">{r.reference}</span>
                </span>
                {voided && (
                  <span className="mt-2 block text-xs text-earth-800">
                    Cancelled {r.voidedAt && formatDate(r.voidedAt)} —{" "}
                    {r.voidReason}
                  </span>
                )}
              </td>
              <td className={`${t.td} hidden lg:table-cell`}>
                {r.recordedByName}
                <Contact contact={contactOf?.(r.recordedBy)} />
              </td>
              <td
                className={`${t.td} num whitespace-nowrap text-right font-medium ${voided ? "text-ink-300 line-through" : "text-ink-900"}`}
              >
                {formatMoney(r.amount)}
                {r.owedAfter !== null && <Standing owed={r.owedAfter} />}
              </td>
              {canVoid && (
                <td className={`${t.td} text-right`}>
                  {!voided && canVoid(r) ? (
                    <VoidContributionButton
                      id={r.id}
                      label={`${r.description} for ${r.memberName}`}
                      paymentKind={r.kind}
                    />
                  ) : null}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
