"use client";

import type { PackData } from "@/lib/limitation";
import { NOT_SENT, NO_PROMISE, SIMULATED_BANNER } from "@/lib/limitation-text";

/**
 * The printable / downloadable document. It uses plain class names and its own CSS (below), not Tailwind,
 * so the same markup can be saved as one self-contained HTML file.
 */
export const PACK_CSS = `
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#1c1917;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#pack{max-width:960px;margin:0 auto;padding:24px}
.pk-banner{border:2px dashed #b45309;background:#fffbeb;color:#78350f;padding:10px 14px;font-weight:700;border-radius:6px}
h1{font-size:22px;margin:18px 0 2px} h2{font-size:16px;margin:26px 0 8px;border-bottom:1px solid #d6d3d1;padding-bottom:4px}
.pk-muted{color:#57534e;font-size:12px}
.pk-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.pk-card{border:1px solid #d6d3d1;border-radius:6px;padding:8px 10px}
.pk-card b{display:block;font-size:18px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #d6d3d1;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#f5f5f4}
.pk-bad{color:#b91c1c;font-weight:600}
.pk-mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;word-break:break-all}
.pk-note{white-space:pre-wrap;border:1px solid #d6d3d1;border-radius:6px;padding:10px 12px;background:#fafaf9}
.pk-foot{margin-top:24px;border-top:1px solid #d6d3d1;padding-top:8px}
tr,.pk-card{break-inside:avoid}
@media print{.no-print{display:none!important} #pack{padding:0;max-width:none}}
`;

const d = (s: string) => new Date(s).toLocaleDateString();
const yn = (b: boolean) => (b ? "Yes" : "No");

export function PackDocument({ data, note }: { data: PackData; note: string }) {
  const s = data.summary;
  const fallback = !data.search.ok;
  return (
    <div id="pack">
      <div className="pk-banner">{SIMULATED_BANNER}</div>
      <h1>Recent sales: proof pack</h1>
      <p className="pk-muted">
        Prepared {new Date(data.generatedAt).toLocaleString()} · sales from {d(data.windowStart)} to {d(data.windowEnd)} ·{" "}
        {fallback ? "listed from the seller's own Ostraca records (PayPal's report could not be read)" : "PayPal Transaction Search matched against the seller's Ostraca records"}
      </p>

      <h2>Summary</h2>
      <div className="pk-grid">
        <div className="pk-card"><b>{s.total}</b>sales in the last 30 days</div>
        <div className="pk-card"><b>{s.matched}</b>matched to a proof record</div>
        <div className="pk-card"><b>{s.unmatched}</b>with no proof on file</div>
        <div className="pk-card"><b>{s.withEvidence}</b>with evidence on file</div>
        <div className="pk-card"><b>{s.verifiedTracking}</b>with verified tracking</div>
        <div className="pk-card"><b>{s.trackingFiled}</b>with tracking filed with PayPal</div>
      </div>
      <p>
        {s.amounts.map((a) => (
          <span key={a.currency}>
            Total {a.total} {a.currency}; with verified tracking {a.withVerifiedTracking} {a.currency}.{" "}
          </span>
        ))}
      </p>

      {note.trim() && (
        <>
          <h2>Cover note</h2>
          <div className="pk-note">{note.trim()}</div>
        </>
      )}

      <h2>Sales</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th><th>Amount</th><th>Buyer</th><th>Capture ID</th><th>Proof record</th><th>Readiness</th><th>Evidence</th><th>Verified tracking</th><th>Filed with PayPal</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.key}>
              <td>{d(r.date)}</td>
              <td>{r.amount} {r.currency}</td>
              <td>{r.buyer ?? "—"}</td>
              <td className="pk-mono">{r.captureId}</td>
              <td className={r.matched ? "" : "pk-bad"}>{r.matched ? "Matched" : "No proof on file"}</td>
              <td>{r.readinessScore ?? "—"}</td>
              <td>{r.evidenceCount}</td>
              <td>{r.tracking ? <span className="pk-mono">{r.tracking.number}{r.tracking.carrier ? ` (${r.tracking.carrier})` : ""}</span> : "No"}</td>
              <td>{yn(r.trackingFiled)}</td>
            </tr>
          ))}
          {!data.rows.length && <tr><td colSpan={9}>No sales in this period.</td></tr>}
        </tbody>
      </table>

      <h2>Gaps</h2>
      {data.gaps.length ? (
        <ul>
          {data.gaps.map((g) => (
            <li key={g.captureId}>
              <span className="pk-mono">{g.captureId}</span> ({g.label}): {g.problems.join("; ")}
            </li>
          ))}
        </ul>
      ) : (
        <p>No gaps found in the records listed above.</p>
      )}

      <h2>Evidence details</h2>
      {data.evidence.length ? (
        <table>
          <thead>
            <tr><th>Sale (capture ID)</th><th>Kind</th><th>File</th><th>SHA-256</th><th>Added</th></tr>
          </thead>
          <tbody>
            {data.evidence.map((e, i) => (
              <tr key={i}>
                <td className="pk-mono">{e.captureId}</td>
                <td>{e.kind.replace(/_/g, " ")}</td>
                <td>{e.sellerEntered ? "Seller-entered details (no document)" : e.fileName}</td>
                <td className="pk-mono">{e.sha256}</td>
                <td>{d(e.uploadedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No evidence files on record yet.</p>
      )}

      <div className="pk-foot pk-muted">
        <p>{SIMULATED_BANNER}</p>
        <p>{NOT_SENT}</p>
        <p>{NO_PROMISE}</p>
        <p>Originals are stored unchanged; each SHA-256 above is the fingerprint of the stored original.</p>
      </div>
    </div>
  );
}
