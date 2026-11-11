import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { api, notFound, parseParam } from "@/lib/api";

/** Serves the stored original, byte for byte, so the seller can check it against the extracted values. */
export const GET = api<{ id: string }>({}, async ({ params }) => {
  const id = parseParam(params.id, z.string().uuid(), "Not found");
  const [ev] = await db()
    .select()
    .from(schema.evidence)
    .where(eq(schema.evidence.id, id));
  if (!ev) throw notFound("Not found");
  // A sandboxed CSP stops any script in the file, but Chrome's built-in PDF viewer cannot run under it, and a PDF
  // is rendered by that isolated viewer rather than by this origin, so PDFs get the other headers only.
  const csp: Record<string, string> = ev.mimeType === "application/pdf" ? {} : { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; frame-ancestors 'self'" };
  return new Response(new Uint8Array(ev.content), {
    headers: {
      ...csp,
      "Content-Type": ev.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(ev.fileName)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "X-Evidence-SHA256": ev.sha256,
    },
  });
});
