"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type RowClickedEvent } from "ag-grid-community";
import { ChevronRight, ReceiptText } from "lucide-react";
import { startNavProgress } from "@/components/layout/nav-progress";
import { Stagger } from "@/components/motion/stagger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataBoundary } from "@/components/motion/data-boundary";
import { LedgerSkeleton } from "@/components/skeletons";
import type { Transaction } from "@/db/schema";
import { ReadinessChip } from "./readiness-chip";
import { formatMoney, formatText, shortDate } from "@/lib/format";
import { useMediaQuery } from "./use-media-query";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  accentColor: "oklch(0.55 0.13 45)",
  fontFamily: "inherit",
  headerFontWeight: 600,
  borderRadius: 8,
});

const ROW_STYLE = { cursor: "pointer" };

function ScoreCell({ value }: { value: number }) {
  return <ReadinessChip score={value} />;
}

/** Mobile layout: one tappable card per sale, lowest readiness first (same order as the grid). */
function SaleCards({ rows }: { rows: Transaction[] }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => a.readinessScore - b.readinessScore), [rows]);
  return (
    <Stagger as="ul" className="space-y-3" aria-label="Sales">
      {sorted.map((t) => (
        <li key={t.id}>
          <Link
            href={`/sales/${t.id}`}
            className="lift block rounded-xl border bg-card p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-accent/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{formatText(t.itemDescription, "Sale")}</p>
                <p className="truncate text-sm text-muted-foreground">{formatText(t.buyerName, "Unknown buyer")}</p>
              </div>
              <p className="shrink-0 font-semibold tabular-nums">
                {formatMoney(t.amount, t.currency)}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ReadinessChip score={t.readinessScore} />
              <Badge variant={t.trackingFiled ? "success" : "outline"}>{t.trackingFiled ? "Tracking filed" : "Tracking not filed"}</Badge>
              <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden />
            </div>
          </Link>
        </li>
      ))}
    </Stagger>
  );
}

/**
 * The grid's own `loading` prop stays a constant false: when it flipped after the fetch, Next's restored page kept
 * a stale overlay over loaded rows. Below md the grid is replaced by cards, and only the container is animated.
 */
function LedgerBody({ rows, error, refresh }: { rows: Transaction[] | null; error: string | null; refresh: () => void }) {
  const router = useRouter();
  const wide = useMediaQuery("(min-width: 768px)");

  const cols = useMemo<ColDef<Transaction>[]>(
    () => [
      { field: "capturedAt", headerName: "Sale", valueFormatter: (p) => shortDate(p.value), width: 120 },
      {
        field: "itemDescription",
        headerName: "Item",
        flex: 1,
        minWidth: 170,
        // A real link, so the sale can be opened with the keyboard too (row click does the same for the mouse).
        cellRenderer: (p: { data?: Transaction; value?: string }) =>
          p.data ? <Link href={`/sales/${p.data.id}`} className="underline-offset-2 hover:underline">{formatText(p.value, "Sale")}</Link> : null,
      },
      { field: "buyerName", headerName: "Buyer", width: 140, valueFormatter: (p) => formatText(p.value) },
      { headerName: "Amount", valueGetter: (p) => formatMoney(p.data?.amount, p.data?.currency), width: 115 },
      { field: "readinessScore", headerName: "Readiness", cellRenderer: ScoreCell, width: 150, sort: "asc" },
      { field: "trackingFiled", headerName: "Tracking", valueFormatter: (p) => (p.value ? "Filed" : "Not filed"), width: 110 },
      { field: "paypalCaptureId", headerName: "Capture ID", width: 190 },
    ],
    []
  );
  const getRowId = useCallback((p: { data: Transaction }) => p.data.id, []);
  const onRowClicked = useCallback(
    (e: RowClickedEvent<Transaction>) => {
      if (!e.data) return;
      startNavProgress();
      router.push(`/sales/${e.data.id}`);
    },
    [router]
  );

  // First load failed: nothing to show yet, so say what happened and let the seller retry.
  if (!rows && error) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 p-4 text-sm">
        <p className="text-destructive">Could not load your sales: {error}</p>
        <p className="text-muted-foreground">Check /api/health if this keeps happening.</p>
        <Button size="sm" variant="outline" onClick={refresh}>
          Retry
        </Button>
      </div>
    );
  }

  if (!rows || wide === null) return null;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-accent text-primary">
          <ReceiptText className="size-6" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="font-medium">No sales yet</p>
          <p className="text-sm text-muted-foreground">Make a test sale and it appears here with its readiness score.</p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/store">Make a test sale</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* A later refresh failed: keep showing the last good rows and offer a retry. */}
      {error && (
        <p role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
          Could not refresh: {error}. Showing the last loaded sales.
          <Button size="sm" variant="outline" onClick={refresh}>
            Retry
          </Button>
        </p>
      )}
      {wide ? (
        <div className="h-[420px] w-full">
          <AgGridReact<Transaction>
            theme={theme}
            rowData={rows}
            loading={false}
            columnDefs={cols}
            getRowId={getRowId}
            onRowClicked={onRowClicked}
            rowStyle={ROW_STYLE}
          />
        </div>
      ) : (
        <SaleCards rows={rows} />
      )}
    </div>
  );
}

/** Skeleton while the first read is in flight, then one crossfade into the table or cards. Polls never bring it back. */
export function ProofLedger(props: { rows: Transaction[] | null; error: string | null; refresh: () => void }) {
  const wide = useMediaQuery("(min-width: 768px)");
  const ready = (props.rows !== null && wide !== null) || (!props.rows && !!props.error);
  return (
    <DataBoundary ready={ready} skeleton={<LedgerSkeleton />}>
      <LedgerBody {...props} />
    </DataBoundary>
  );
}
