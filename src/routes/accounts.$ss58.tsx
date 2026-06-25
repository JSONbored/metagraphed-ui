import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState, type ReactNode } from "react";
import { Activity, Boxes, Clock, Coins, Fingerprint, Radar, Rows3 } from "lucide-react";
import { AppShell } from "@/components/metagraphed/app-shell";
import { CopyableCode } from "@/components/metagraphed/copyable-code";
import { TimeAgo } from "@/components/metagraphed/time-ago";
import { ApiSourceFooter } from "@/components/metagraphed/api-source-footer";
import { EmptyState, ErrorState, PageHeading, Skeleton } from "@/components/metagraphed/states";
import { PageHero } from "@/components/metagraphed/page-hero";
import { SectionAnchor } from "@/components/metagraphed/section-anchor";
import { EndpointSnippet } from "@/components/metagraphed/endpoint-snippet";
import { StatTile } from "@/components/metagraphed/charts/stat-tile";
import { QueryErrorBoundary } from "@/components/metagraphed/error-boundary";
import { AccountHistoryChart } from "@/components/metagraphed/account-history-chart";
import {
  accountBalanceQuery,
  accountExtrinsicsQuery,
  accountQuery,
  accountTransfersQuery,
} from "@/lib/metagraphed/queries";
import { classNames, formatNumber } from "@/lib/metagraphed/format";
import { shortHash } from "@/lib/metagraphed/blocks";
import { extrinsicCall } from "@/lib/metagraphed/extrinsics";
import { isValidSs58, ss58PathSegment } from "@/lib/metagraphed/accounts";
import type {
  AccountSummary,
  AccountTransfer,
  AccountTransferDirection,
  Extrinsic,
} from "@/lib/metagraphed/types";

export const Route = createFileRoute("/accounts/$ss58")({
  head: ({ params }) => {
    const label = shortHash(params.ss58) ?? params.ss58;
    const title = `Account ${label} — Metagraphed`;
    const description = `Bittensor account ${label}: cross-subnet activity, registrations, and first-party chain-event history on Metagraphed.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: AccountDetailPage,
});

function AccountDetailPage() {
  const { ss58 } = Route.useParams();
  return (
    <AppShell>
      <QueryErrorBoundary>
        <Suspense fallback={<DetailSkeleton />}>
          <AccountDetail ss58={ss58} />
        </Suspense>
      </QueryErrorBoundary>
    </AppShell>
  );
}

function AccountDetail({ ss58 }: { ss58: string }) {
  if (!isValidSs58(ss58)) {
    return (
      <>
        <PageHeading
          eyebrow="Explorer"
          title="Invalid account address"
          description="Account addresses must be a valid ss58 (base58) string."
        />
        <EmptyState
          title="Invalid account address"
          description="Use a valid hotkey or coldkey ss58 address."
          action={{ label: "Back to accounts", href: "/accounts" }}
        />
      </>
    );
  }
  return <ValidAccountDetail ss58={ss58} />;
}

// Compact TAO formatter — mirrors the economics panel's fmtTao convention.
function fmtTao(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M τ`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k τ`;
  if (v >= 1) return `${v.toFixed(2)} τ`;
  return `${v.toFixed(4)} τ`;
}

function fmtTaoCell(v?: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const digits = abs >= 1 ? 2 : 4;
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v)} τ`;
}

function ValidAccountDetail({ ss58 }: { ss58: string }) {
  const sourceRef = ss58PathSegment(ss58);
  const account = useSuspenseQuery(accountQuery(ss58)).data.data as AccountSummary;
  // Balance is a separate live-RPC call: fetched non-blocking so a slow/failed
  // RPC never stalls or errors the rest of the entity page.
  const balanceResult = useQuery(accountBalanceQuery(ss58));
  const balance = balanceResult.data?.data;

  const balanceValue = balanceResult.isPending ? (
    <span className="text-ink-muted">…</span>
  ) : balance?.balance_tao != null ? (
    fmtTao(balance.balance_tao)
  ) : (
    "—"
  );

  const hasActivity =
    account.event_count > 0 || account.registrations.length > 0 || account.recent_events.length > 0;

  return (
    <>
      <PageHero
        eyebrow="Explorer · account"
        live
        title={shortHash(ss58, 8) ?? "Account"}
        description={
          <div className="space-y-4">
            <p className="max-w-2xl">
              Cross-subnet registrations, first-party chain events, and daily activity rollups for
              one Bittensor account.
            </p>
            <div className="max-w-fit rounded-2xl border border-border/80 bg-card/80 px-3 py-2 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.55)]">
              <CopyableCode value={ss58} truncate={false} />
            </div>
          </div>
        }
        actions={
          <>
            <a
              href="#history"
              className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/15"
            >
              View activity
            </a>
            <a
              href="#call"
              className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted transition-colors hover:border-ink/20 hover:text-ink-strong"
            >
              API endpoints
            </a>
          </>
        }
        aside={
          <AccountHeroAside
            registrations={account.registrations.length}
            eventKinds={account.event_kinds.length}
            firstSeenAt={account.first_seen_at ?? null}
          />
        }
        caption="explorer / v1"
      />

      <div className="mb-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Coins}
          eyebrow="Balance"
          value={balanceValue}
          hint={balance?.balance_tao != null ? "free + reserved · live RPC" : "live RPC"}
          tone="accent"
          className="rounded-2xl border-accent/25 bg-card/95 p-5 shadow-[0_24px_80px_-52px_rgba(45,212,191,0.45)]"
        />
        <StatTile
          icon={Activity}
          eyebrow="Events"
          value={formatNumber(account.event_count)}
          hint="indexed first-party"
          className="rounded-2xl border-border/80 bg-card/95 p-5 shadow-[0_24px_80px_-58px_rgba(15,23,42,0.45)]"
        />
        <StatTile
          icon={Boxes}
          eyebrow="Subnets"
          value={formatNumber(account.subnet_count)}
          hint="active footprint"
          className="rounded-2xl border-border/80 bg-card/95 p-5 shadow-[0_24px_80px_-58px_rgba(15,23,42,0.45)]"
        />
        <StatTile
          icon={Clock}
          eyebrow="Last seen"
          value={<TimeAgo at={account.last_seen_at ?? undefined} />}
          hint="chain-direct index"
          className="rounded-2xl border-border/80 bg-card/95 p-5 shadow-[0_24px_80px_-58px_rgba(15,23,42,0.45)]"
        />
      </div>

      <SectionAnchor
        id="history"
        title="Daily activity"
        subtitle="Per-day first-party account events, newest rollups from the chain-direct explorer."
        tone="accent"
        info="History is keyed by hotkey activity only. Coldkey-only addresses legitimately return an empty series."
        right={<SectionBadge tone="accent">hotkey rollup</SectionBadge>}
      >
        <AccountHistoryChart ss58={ss58} />
      </SectionAnchor>

      <div className="mt-8 md:mt-10">
        <AccountActivityDetails ss58={ss58} />
      </div>

      {!hasActivity ? (
        <EmptyState
          title="No activity indexed for this account"
          description="The chain poller indexes first-party events for recent blocks. Cold accounts or those without recent on-chain activity won't appear yet."
          action={{ label: "Back to accounts", href: "/accounts" }}
        />
      ) : null}

      {account.registrations.length > 0 ? (
        <SectionAnchor
          id="registrations"
          title="Registered subnets"
          subtitle="Current hotkey registrations across the indexed network footprint."
          tone="accent"
          right={<SectionBadge>{formatNumber(account.registrations.length)} rows</SectionBadge>}
        >
          <DataPanel>
            <table className="w-full text-left text-sm">
              <thead className="bg-surface/50">
                <tr>
                  <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                    Subnet
                  </th>
                  <th className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                    UID
                  </th>
                  <th className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                    Stake
                  </th>
                  <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                    Permit
                  </th>
                  <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                    Active
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {account.registrations.map((r) => (
                  <tr key={`${r.netuid}-${r.uid}`} className="hover:bg-surface/30">
                    <td className="px-5 py-4 font-mono text-[12px]">
                      {r.netuid != null ? (
                        <Link
                          to="/subnets/$netuid"
                          params={{ netuid: r.netuid }}
                          className="inline-flex items-center rounded-full border border-border bg-paper px-2.5 py-1 font-medium text-ink-strong transition-colors hover:border-accent/30 hover:text-accent"
                        >
                          SN{r.netuid}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-[12px] tabular-nums text-ink">
                      {r.uid != null ? formatNumber(r.uid) : "—"}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-[12px] tabular-nums text-ink">
                      {r.stake_tao != null ? `${formatNumber(r.stake_tao)} τ` : "—"}
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px]">
                      {r.validator_permit ? (
                        <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-500">
                          validator
                        </span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px]">
                      {r.active ? (
                        <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-500">
                          active
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-surface px-2 py-0.5 text-ink-muted">
                          idle
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataPanel>
        </SectionAnchor>
      ) : null}

      {account.event_kinds.length > 0 ? (
        <SectionAnchor
          id="kinds"
          title="Activity by kind"
          subtitle="Relative event mix across the indexed sample for this account."
          tone="accent"
          right={<SectionBadge>{formatNumber(account.event_kinds.length)} kinds</SectionBadge>}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {account.event_kinds.map((entry) => (
              <div
                key={entry.kind}
                className="rounded-2xl border border-border/80 bg-card/95 px-4 py-3 shadow-[0_18px_50px_-44px_rgba(15,23,42,0.55)]"
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                  event kind
                </div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <span className="min-w-0 truncate font-mono text-[12px] text-ink-strong">
                    {entry.kind}
                  </span>
                  <span className="font-display text-xl font-semibold tabular-nums text-ink-strong">
                    {formatNumber(entry.count)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SectionAnchor>
      ) : null}

      {account.recent_events.length > 0 ? (
        <SectionAnchor
          id="events"
          title="Recent events"
          subtitle="Newest decoded chain events touching this account."
          tone="accent"
          right={<SectionBadge>{formatNumber(account.recent_events.length)} events</SectionBadge>}
        >
          <DataPanel>
            <table className="w-full text-left text-sm">
              <thead className="bg-surface/50">
                <tr>
                  <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                    Block
                  </th>
                  <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                    Kind
                  </th>
                  <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                    Subnet
                  </th>
                  <th className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                    Amount
                  </th>
                  <th className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                    Observed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {account.recent_events.map((ev, i) => (
                  <tr
                    key={`${ev.block_number}-${ev.event_index}-${i}`}
                    className="hover:bg-surface/30"
                  >
                    <td className="px-5 py-4 font-mono text-[12px]">
                      {ev.block_number != null ? (
                        <Link
                          to="/blocks/$ref"
                          params={{ ref: String(ev.block_number) }}
                          className="text-ink hover:text-accent hover:underline"
                        >
                          #{formatNumber(ev.block_number)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-ink-strong">
                      {ev.event_kind ?? "—"}
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-ink-muted">
                      {ev.netuid != null ? `SN${ev.netuid}` : "—"}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-[11px] tabular-nums text-ink">
                      {ev.amount_tao != null ? `${formatNumber(ev.amount_tao)} τ` : "—"}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-[11px] text-ink-muted">
                      <TimeAgo at={ev.observed_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataPanel>
        </SectionAnchor>
      ) : null}

      <div className="mt-6">
        <Link
          to="/accounts"
          className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-2.5 py-1 text-[11px] font-medium hover:border-ink/30"
        >
          ← Account lookup
        </Link>
      </div>

      <SectionAnchor
        id="call"
        title="Call this endpoint"
        subtitle="Copy a ready-to-run request for this account."
      >
        <EndpointSnippet
          rows={[
            { label: "summary", path: `/api/v1/accounts/${sourceRef}` },
            { label: "balance", path: `/api/v1/accounts/${sourceRef}/balance` },
            { label: "history", path: `/api/v1/accounts/${sourceRef}/history` },
            { label: "signed extrinsics", path: `/api/v1/accounts/${sourceRef}/extrinsics` },
            { label: "transfers", path: `/api/v1/accounts/${sourceRef}/transfers?direction=all` },
            { label: "events", path: `/api/v1/accounts/${sourceRef}/events` },
            { label: "subnets", path: `/api/v1/accounts/${sourceRef}/subnets` },
          ]}
        />
      </SectionAnchor>

      <ApiSourceFooter
        paths={[
          `/api/v1/accounts/${sourceRef}`,
          `/api/v1/accounts/${sourceRef}/history`,
          `/api/v1/accounts/${sourceRef}/extrinsics`,
          `/api/v1/accounts/${sourceRef}/transfers`,
        ]}
      />
    </>
  );
}

function DetailSkeleton() {
  return (
    <>
      <Skeleton className="h-28 w-full mb-8" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-72 w-full" />
    </>
  );
}

function SectionBadge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em]",
        tone === "accent"
          ? "border-accent/30 bg-accent/10 text-accent"
          : "border-border bg-card text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}

function DataPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={classNames(
        "overflow-x-auto rounded-[1.5rem] border border-border/80 bg-card/95 shadow-[0_28px_90px_-60px_rgba(15,23,42,0.45)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

const ACCOUNT_DETAIL_LIMIT = 10;
const DETAIL_VIEWS = [
  { key: "transfers", label: "Transfers" },
  { key: "extrinsics", label: "Signed extrinsics" },
] as const;
const TRANSFER_DIRECTIONS: Array<"all" | AccountTransferDirection> = ["all", "sent", "received"];

function AccountActivityDetails({ ss58 }: { ss58: string }) {
  const [view, setView] = useState<(typeof DETAIL_VIEWS)[number]["key"]>("transfers");

  return (
    <SectionAnchor
      id="activity-details"
      title="Activity details"
      subtitle="Secondary live feeds for native TAO transfers and signer-matched extrinsics."
      tone="accent"
      info="Transfers are the native-TAO Balances.Transfer feed only; signed extrinsics are matched by the extrinsic signer only, not the hotkey/coldkey union."
      right={<SectionBadge tone="accent">live D1 feeds</SectionBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap rounded-full border border-border/80 bg-card/80 p-1 shadow-[0_18px_50px_-44px_rgba(15,23,42,0.45)]">
            {DETAIL_VIEWS.map((option) => {
              const active = view === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setView(option.key)}
                  className={classNames(
                    "rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors",
                    active
                      ? "bg-ink-strong text-paper shadow-[0_12px_30px_-24px_rgba(15,23,42,0.85)]"
                      : "text-ink-muted hover:text-ink-strong",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            {view === "transfers" ? "native TAO only" : "signer matched only"}
          </div>
        </div>

        {view === "transfers" ? (
          <AccountTransfersPanel ss58={ss58} />
        ) : (
          <AccountExtrinsicsPanel ss58={ss58} />
        )}
      </div>
    </SectionAnchor>
  );
}

function AccountTransfersPanel({ ss58 }: { ss58: string }) {
  const [direction, setDirection] = useState<"all" | AccountTransferDirection>("all");
  const result = useQuery(
    accountTransfersQuery(ss58, { direction, limit: ACCOUNT_DETAIL_LIMIT, offset: 0 }),
  );
  const rows = result.data?.data.transfers ?? [];

  return (
    <DataPanel>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-[linear-gradient(180deg,rgba(45,212,191,0.08),transparent)] px-5 py-4">
        <div>
          <div className="font-display text-lg font-semibold text-ink-strong">
            Native TAO transfers
          </div>
          <div className="mt-1 text-[11px] text-ink-muted">
            Balances.Transfer only. Stake add/remove flows stay in recent events and history.
          </div>
        </div>
        <div className="inline-flex flex-wrap items-center gap-1.5">
          {TRANSFER_DIRECTIONS.map((option) => {
            const active = direction === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setDirection(option)}
                className={classNames(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
                  active
                    ? "border-accent/60 bg-accent/15 text-ink-strong"
                    : "border-border bg-card text-ink-muted hover:text-ink-strong hover:border-ink/30",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      {result.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : result.isError ? (
        <div className="px-5 py-6">
          <ErrorState error={result.error} context="account transfers" />
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-6">
          <EmptyState
            title="No native TAO transfers indexed"
            description={
              direction === "all"
                ? "This account has no recent indexed Balances.Transfer activity."
                : `This account has no recent ${direction} Balances.Transfer activity.`
            }
          />
        </div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="bg-surface/50">
            <tr>
              <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                Block
              </th>
              <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                Counterparty
              </th>
              <th className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                Amount
              </th>
              <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                Direction
              </th>
              <th className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                Observed
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((transfer, i) => {
              const counterparty = transferCounterparty(transfer, ss58);
              return (
                <tr
                  key={`${transfer.block_number}-${transfer.event_index}-${i}`}
                  className="hover:bg-surface/30"
                >
                  <td className="px-5 py-4 font-mono text-[12px]">
                    {transfer.block_number != null ? (
                      <Link
                        to="/blocks/$ref"
                        params={{ ref: String(transfer.block_number) }}
                        className="text-ink hover:text-accent hover:underline"
                      >
                        #{formatNumber(transfer.block_number)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-4 font-mono text-[11px] text-ink">
                    {counterparty ? (
                      <Link
                        to="/accounts/$ss58"
                        params={{ ss58: counterparty.value }}
                        className="inline-flex items-center gap-2 text-ink hover:text-accent hover:underline"
                        title={counterparty.value}
                      >
                        <span className="rounded-full border border-border bg-paper px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                          {counterparty.role}
                        </span>
                        <span>{shortHash(counterparty.value) ?? counterparty.value}</span>
                      </Link>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-[11px] tabular-nums text-ink">
                    {fmtTaoCell(transfer.amount_tao)}
                  </td>
                  <td className="px-5 py-4 font-mono text-[11px]">
                    <DirectionBadge direction={transfer.direction} />
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-[11px] text-ink-muted">
                    <TimeAgo at={transfer.observed_at ?? undefined} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </DataPanel>
  );
}

function AccountExtrinsicsPanel({ ss58 }: { ss58: string }) {
  const result = useQuery(accountExtrinsicsQuery(ss58, { limit: ACCOUNT_DETAIL_LIMIT, offset: 0 }));
  const rows = result.data?.data.extrinsics ?? [];

  return (
    <DataPanel>
      <div className="border-b border-border/70 bg-[linear-gradient(180deg,rgba(15,23,42,0.04),transparent)] px-5 py-4">
        <div className="font-display text-lg font-semibold text-ink-strong">Signed extrinsics</div>
        <div className="mt-1 text-[11px] text-ink-muted">
          Matched by the extrinsic signer only. Coldkey activity can still appear elsewhere on the
          page.
        </div>
      </div>

      {result.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : result.isError ? (
        <div className="px-5 py-6">
          <ErrorState error={result.error} context="account signed extrinsics" />
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-6">
          <EmptyState
            title="No signed extrinsics indexed"
            description="This feed only includes extrinsics whose signer matches this ss58 exactly."
          />
        </div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="bg-surface/50">
            <tr>
              <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                Extrinsic
              </th>
              <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                Call
              </th>
              <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                Result
              </th>
              <th className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                Fee
              </th>
              <th className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                Observed
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((extrinsic, i) => (
              <tr
                key={
                  extrinsic.extrinsic_hash ??
                  `${extrinsic.block_number}-${extrinsic.extrinsic_index}-${i}`
                }
                className="hover:bg-surface/30"
              >
                <td className="px-5 py-4 font-mono text-[11px] text-ink">
                  {extrinsic.extrinsic_hash ? (
                    <Link
                      to="/extrinsics/$hash"
                      params={{ hash: extrinsic.extrinsic_hash }}
                      className="font-medium text-ink-strong hover:text-accent hover:underline"
                      title={extrinsic.extrinsic_hash}
                    >
                      {shortHash(extrinsic.extrinsic_hash)}
                    </Link>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                  <div className="mt-1 text-[10px] text-ink-muted">
                    {extrinsic.block_number != null ? (
                      <Link
                        to="/blocks/$ref"
                        params={{ ref: String(extrinsic.block_number) }}
                        className="hover:text-accent hover:underline"
                      >
                        #{formatNumber(extrinsic.block_number)}
                        {extrinsic.extrinsic_index != null ? ` · ${extrinsic.extrinsic_index}` : ""}
                      </Link>
                    ) : extrinsic.extrinsic_index != null ? (
                      `index ${extrinsic.extrinsic_index}`
                    ) : (
                      "no block/index"
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 font-mono text-[11px] text-ink-strong">
                  {extrinsicCall(extrinsic.call_module, extrinsic.call_function)}
                </td>
                <td className="px-5 py-4 font-mono text-[11px]">
                  <SuccessBadge success={extrinsic.success} />
                </td>
                <td className="px-5 py-4 text-right font-mono text-[11px] tabular-nums text-ink">
                  {fmtTaoCell(extrinsic.fee_tao)}
                </td>
                <td className="px-5 py-4 text-right font-mono text-[11px] text-ink-muted">
                  <TimeAgo at={extrinsic.observed_at} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DataPanel>
  );
}

function DirectionBadge({ direction }: { direction?: AccountTransferDirection | null }) {
  if (direction === "sent") {
    return (
      <span className="inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600">
        sent
      </span>
    );
  }
  if (direction === "received") {
    return (
      <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-500">
        received
      </span>
    );
  }
  return <span className="text-ink-muted">—</span>;
}

function SuccessBadge({ success }: { success?: boolean | null }) {
  if (success == null) return <span className="text-ink-muted">—</span>;
  return success ? (
    <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-500">
      ok
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-500">fail</span>
  );
}

function transferCounterparty(
  transfer: AccountTransfer,
  ss58: string,
): { role: "from" | "to"; value: string } | null {
  if (transfer.direction === "sent" && transfer.to) return { role: "to", value: transfer.to };
  if (transfer.direction === "received" && transfer.from) {
    return { role: "from", value: transfer.from };
  }
  if (transfer.from && transfer.from !== ss58) return { role: "from", value: transfer.from };
  if (transfer.to && transfer.to !== ss58) return { role: "to", value: transfer.to };
  if (transfer.to) return { role: "to", value: transfer.to };
  if (transfer.from) return { role: "from", value: transfer.from };
  return null;
}

function AccountHeroAside({
  registrations,
  eventKinds,
  firstSeenAt,
}: {
  registrations: number;
  eventKinds: number;
  firstSeenAt: string | null;
}) {
  return (
    <div className="w-[20rem] rounded-[1.75rem] border border-border/80 bg-card/95 p-5 shadow-[0_32px_100px_-72px_rgba(15,23,42,0.65)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
            account signal
          </div>
          <div className="mt-2 font-display text-xl font-semibold text-ink-strong">
            Indexed footprint
          </div>
        </div>
        <div className="rounded-2xl bg-accent/10 p-3 text-accent">
          <Fingerprint className="size-5" />
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <HeroAsideRow
          icon={Rows3}
          label="Registered subnets"
          value={formatNumber(registrations)}
          accent="live"
        />
        <HeroAsideRow
          icon={Radar}
          label="Activity kinds"
          value={formatNumber(eventKinds)}
          accent="decoded"
        />
        <HeroAsideRow
          icon={Clock}
          label="First indexed"
          value={firstSeenAt ? <TimeAgo at={firstSeenAt} /> : "—"}
          accent="chain-direct"
        />
      </div>
    </div>
  );
}

function HeroAsideRow({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Clock;
  label: string;
  value: ReactNode;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-surface/35 px-3.5 py-3">
      <div className="rounded-xl bg-paper p-2 text-ink-muted">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
          {label}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="truncate font-display text-lg font-semibold tabular-nums text-ink-strong">
            {value}
          </span>
          <span className="font-mono text-[10px] text-ink-muted">{accent}</span>
        </div>
      </div>
    </div>
  );
}
