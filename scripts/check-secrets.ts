/**
 * Run after `npm run build`. Fails if a secret value from .env, or anything shaped like a key, appears in
 * the browser bundle or in a git-tracked file. Findings name the file and kind, never the secret.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const SECRET_ENV = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "PAYPAL_CLIENT_SECRET", "DATABASE_URL"];

const values: Array<{ name: string; value: string }> = [];
for (const name of SECRET_ENV) {
  const v = process.env[name]?.trim().replace(/^["']|["']$/g, "");
  if (v && v.length >= 8) values.push({ name, value: v });
}

const PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: "Anthropic key (sk-ant-)", re: /sk-ant-[A-Za-z0-9_-]{16,}/ },
  { kind: "API key (sk-)", re: /\bsk-[A-Za-z0-9]{24,}/ },
  // A postgres URL with a real-looking password. The placeholders in .env.example ("user:password@host") are allowed.
  { kind: "database URL with password", re: /postgres(?:ql)?:\/\/(?!user:password@)[^:\s/'"]+:[^@\s'"]{4,}@/ },
  { kind: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { kind: "PayPal secret-looking assignment", re: /PAYPAL_CLIENT_SECRET\s*=\s*[A-Za-z0-9_-]{20,}/ },
];

const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".md", ".css", ".html", ".txt", ".map", ".env", ".example", ".yml", ".yaml", ".mdx", ".svg", ""]);
const SKIP_FILES = new Set(["package-lock.json", "scripts/check-secrets.ts"]);

function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const problems: string[] = [];
function scan(file: string, label: string) {
  if (SKIP_FILES.has(file.replace(/\\/g, "/"))) return;
  if (!TEXT_EXT.has(extname(file))) return;
  let text: string;
  try {
    if (statSync(file).size > 8_000_000) return;
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const { name, value } of values) if (text.includes(value)) problems.push(`${label} ${file}: contains the value of ${name}`);
  for (const { kind, re } of PATTERNS) if (re.test(text)) problems.push(`${label} ${file}: looks like a ${kind}`);
}

// The browser bundle.
const staticDir = join(".next", "static");
if (!existsSync(staticDir)) {
  console.error("No .next/static folder. Run `npm run build` first, then `npm run check:secrets`.");
  process.exit(1);
}
const bundle = walk(staticDir);
for (const f of bundle) scan(f, "[bundle]");

// Every file git tracks (and would therefore publish).
let tracked: string[] = [];
try {
  tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
} catch {
  console.warn("Could not run `git ls-files`; skipped the git check.");
}
for (const f of tracked) scan(f, "[git]");
if (tracked.some((f) => /(^|\/)\.env$/.test(f))) problems.push("[git] .env is tracked by git. Remove it from the index: git rm --cached .env");

console.log(`Checked ${bundle.length} browser-bundle files and ${tracked.length} git-tracked files for ${values.length} secret value(s) and ${PATTERNS.length} key patterns.`);
if (!values.length) console.warn("Warning: no secret values were found in the environment, so only the key patterns were checked. Is .env filled in?");

if (problems.length) {
  console.error("\nFAIL: possible secret leak:\n" + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
console.log("PASS: no secrets found in the browser bundle or in git.");
