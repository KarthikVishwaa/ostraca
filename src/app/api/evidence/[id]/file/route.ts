import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** Serves the stored original, byte for byte, so the seller can check it against the extracted values. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [ev] = await db().select().from(schema.evidence).where(eq(schema.evidence.id, id));
  if (!ev) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(ev.content), {
    headers: {
      "Content-Type": ev.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(ev.fileName)}"`,
      "X-Content-Type-Options": "nosniff",
      "X-Evidence-SHA256": ev.sha256,
    },
  });
}
