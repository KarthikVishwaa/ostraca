"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import type { Transaction } from "@/db/schema";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  accentColor: "oklch(0.55 0.13 45)",
  fontFamily: "inherit",
  headerFontWeight: 600,
  borderRadius: 8,
});

function ScoreCell({ value }: { value: number }) {
  const tone = value >= 80 ? "bg-success/15 text-success" : value >= 50 ? "bg-warning/25" : "bg-destructive/15 text-destructive";
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>{value}</span>;
}

export function ProofLedger() {
  const router = useRouter();
  const [rows, setRows] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/transactions")
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error ?? r.statusText))))
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

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

  if (error)
    return (
      <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
        Could not load transactions: {error}. Check /api/health.
      </p>
    );

  return (
    <div className="h-[420px] w-full">
      <AgGridReact<Transaction>
        theme={theme}
        rowData={rows ?? undefined}
        loading={rows === null}
        columnDefs={cols}
        getRowId={(p) => p.data.id}
        onRowClicked={(e) => e.data && router.push(`/sales/${e.data.id}`)}
        rowStyle={{ cursor: "pointer" }}
        overlayNoRowsTemplate="No sales yet. Make a test purchase in the Demo store. Click a sale to add proof."
      />
    </div>
  );
}
