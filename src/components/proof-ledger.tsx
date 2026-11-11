"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type RowClickedEvent } from "ag-grid-community";
import { Button } from "@/components/ui/button";
import type { Transaction } from "@/db/schema";
import { usePolled } from "./use-polled";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  accentColor: "oklch(0.55 0.13 45)",
  fontFamily: "inherit",
  headerFontWeight: 600,
  borderRadius: 8,
});

const ROW_STYLE = { cursor: "pointer" };
const REFRESH_MS = 12_000;

function ScoreCell({ value }: { value: number }) {
  const tone = value >= 80 ? "bg-success/15 text-success" : value >= 50 ? "bg-warning/25" : "bg-destructive/15 text-destructive";
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>{value}</span>;
}

/**
 * The Proof ledger.
 *
 * Loading, error and empty states live OUTSIDE the grid, and the grid is only rendered once it has rows.
 * The grid's own `loading` prop is a constant `false`. It used to flip from true to false after the fetch,
 * and when Next restored the page from its hidden cache on navigating back, the grid kept its old
 * "Loading..." overlay on top of loaded rows. A prop that never changes cannot get out of step.
 * Background refreshes just swap the rows; they never bring a loading state back.
 */
export function ProofLedger() {
  const router = useRouter();
  const { data: rows, error, refresh } = usePolled<Transaction[]>("/api/transactions", REFRESH_MS);

  const cols = useMemo<ColDef<Transaction>[]>(
    () => [
      { field: "capturedAt", headerName: "Sale", valueFormatter: (p) => new Date(p.value).toLocaleString(), width: 180 },
      {
        field: "itemDescription",
        headerName: "Item",
        flex: 1,
        minWidth: 180,
        // A real link, so the sale can be opened with the keyboard too (row click does the same for the mouse).
        cellRenderer: (p: { data?: Transaction; value?: string }) =>
          p.data ? <Link href={`/sales/${p.data.id}`} className="underline-offset-2 hover:underline">{p.value ?? "Sale"}</Link> : null,
      },
      { field: "buyerName", headerName: "Buyer", width: 150 },
      { headerName: "Amount", valueGetter: (p) => `${p.data?.amount} ${p.data?.currency}`, width: 120 },
      { field: "readinessScore", headerName: "Readiness", cellRenderer: ScoreCell, width: 120, sort: "asc" },
      { field: "trackingFiled", headerName: "Tracking", valueFormatter: (p) => (p.value ? "Filed" : "Not filed"), width: 120 },
      { field: "paypalCaptureId", headerName: "Capture ID", width: 200 },
    ],
    []
  );
  const getRowId = useCallback((p: { data: Transaction }) => p.data.id, []);
  const onRowClicked = useCallback((e: RowClickedEvent<Transaction>) => e.data && router.push(`/sales/${e.data.id}`), [router]);

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

  if (!rows) return <p className="py-10 text-center text-sm text-muted-foreground">Loading your sales…</p>;

  if (rows.length === 0) {
    return (
      <div className="space-y-3 rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">No sales yet. Make a test sale to see it here.</p>
        <Button asChild size="sm">
          <Link href="/store">Make a test sale</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* A later refresh failed: keep showing the last good rows and offer a retry. */}
      {error && (
        <p role="alert" className="flex items-center gap-3 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
          Could not refresh: {error}. Showing the last loaded sales.
          <Button size="sm" variant="outline" onClick={refresh}>
            Retry
          </Button>
        </p>
      )}
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
    </div>
  );
}
