import { checkDraft, type DraftCheck, type Fact } from "./draft";

/**
 * Checks for the limitation cover note: the same citation and number rules as a dispute draft,
 * plus a hard stop on promising any outcome. The note may describe records; it may never say
 * that it will lift, remove, restore or clear a limitation. PayPal alone decides that.
 */
const PROMISE = /\b(lift(?:ed|ing)?|remov\w*|restor\w*|clear(?:ed|ing)?|overturn\w*|guarantee\w*|resolv\w*)\b[^.\n]{0,80}\b(limit\w*|restrict\w*|hold)\b|\b(limit\w*|restrict\w*)\b[^.\n]{0,80}\b(lift(?:ed|ing)?|remov\w*|restor\w*|cleared|overturn\w*|resolv\w*)\b/i;

export function checkNote(note: string, facts: Fact[]): DraftCheck {
  const base = checkDraft(note, facts, { checkCounts: true });
  const problems = [...base.problems];
  for (const sentence of note.split(/(?<=[.!?])\s+|\n+/)) {
    if (PROMISE.test(sentence)) {
      problems.push(`"${sentence.replace(/\s*\[F[\d, F]+\]/g, "").trim().slice(0, 70)}" sounds like a promise about the limitation. Describe the records only; PayPal decides.`);
    }
  }
  return { ok: problems.length === 0, problems: [...new Set(problems)], cited: base.cited };
}
