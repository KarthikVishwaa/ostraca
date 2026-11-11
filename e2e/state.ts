import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** What global setup created, so the tests can find it and teardown can delete exactly that and nothing else. */
export type E2EState = {
  runStart: string; // ISO time of the run; teardown only touches rows created after it
  main: { id: string; captureId: string; item: string; buyer: string; city: string };
  sparse: { id: string; captureId: string; item: string };
  /** Temporary proof added to the dispute's sale so a draft can be written; removed in teardown. */
  proofEvidenceId?: string;
};

const FILE = join(process.cwd(), "e2e", ".state.json");

export const writeState = (s: E2EState) => writeFileSync(FILE, JSON.stringify(s, null, 2));
export function readState(): E2EState {
  if (!existsSync(FILE)) throw new Error("e2e/.state.json is missing: global setup did not run.");
  return JSON.parse(readFileSync(FILE, "utf8")) as E2EState;
}
export const stateFile = FILE;
