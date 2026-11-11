import "server-only";
import type { MessageStream } from "@anthropic-ai/sdk/lib/MessageStream";

/**
 * Real progress for a Claude call: the share of the streamed output (text, thinking and tool-input
 * characters, about four per token) against the output we expect for this kind of task.
 */
export function trackOutput(stream: MessageStream, expectedTokens: number, onProgress?: (fraction: number) => void) {
  if (!onProgress) return;
  let chars = 0;
  let last = -1;
  stream.on("streamEvent", (ev) => {
    if (ev.type !== "content_block_delta") return;
    const d = ev.delta as { type: string; text?: string; thinking?: string; partial_json?: string };
    chars += (d.text ?? d.thinking ?? d.partial_json ?? "").length;
    const f = Math.min(0.97, chars / 4 / expectedTokens);
    if (f - last >= 0.01) {
      last = f;
      onProgress(f);
    }
  });
}
