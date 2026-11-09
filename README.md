# Ostraca

**Prove it before they ask.** Ostraca keeps an AI-verified proof record for every PayPal sale, so small sellers can answer holds, disputes and account limitations in minutes instead of days.

Built for the [PayPal AI Hackathon 2026](https://paypalaihackathon.devpost.com/). Runs entirely on the **PayPal sandbox**.

> Ostraca does not control PayPal's decisions. PayPal decides on holds, disputes and limitations. Ostraca makes sure the seller's evidence is complete, correct and fast.

---

## What it does

Ostraca has three flows. In all of them the AI only suggests, code checks, you approve, and PayPal decides.

**A. Capture proof.** Pick a sale in the Proof ledger and add shipping evidence: a receipt photo, a PDF, a voice note, or details typed by hand. Ostraca reads it, and code checks every value (for example the tracking number's check digit and the amount against the PayPal payment). You confirm or edit each value, approve, and Ostraca files the tracking with PayPal. The sale's readiness score goes up. Values you have not confirmed do not count.

**B. Answer disputes.** When a buyer opens a dispute, open it in Ostraca. It builds a short response from your confirmed proof only, with every sentence citing a numbered fact. Code checks the citations and numbers. You edit and approve, and Ostraca submits it to PayPal only if PayPal currently allows evidence. The dispute's status is always read back from PayPal.

**C. Limitation pack (simulated).** PayPal's sandbox cannot place a real account limitation, so this flow starts from a clearly labelled simulation. Ostraca matches your recent sales to your proof record and builds a document you can print or save as PDF, with a summary, a table, evidence details and an optional cover note. It is never sent to PayPal. You submit it yourself.

> **PayPal decides on holds, disputes and limitations.** Ostraca makes your evidence complete and quick to send. It does not lift a hold, win a dispute or remove a limitation, and nothing it produces says it will. Sandbox only.

## Prerequisites

| What | Why | Cost |
|---|---|---|
| Node.js **20.9+** (22 recommended) | Next.js 16 | Free |
| Git + a GitHub account | Public repo (hackathon rule) | Free |
| PayPal developer account — [developer.paypal.com](https://developer.paypal.com/) | Sandbox API keys + test buyer/seller | Free |
| Neon Postgres — [neon.tech](https://neon.tech/) | Database | Free tier |
| Claude API key — [console.anthropic.com](https://console.anthropic.com/) | Reads receipts, invoices, PDFs | Pay-as-you-go (cents per call) |
| OpenAI API key — [platform.openai.com](https://platform.openai.com/) | Transcribes Tamil/Hindi/English voice notes | Pay-as-you-go (cents per minute) |
| Render — [render.com](https://render.com/) | Hosting for judges + webhooks | Free tier |

Only the two AI keys cost money, and only a little: extraction runs once per uploaded file, so a full day of testing should cost very little. Set a low monthly spend limit in both consoles.

## Free resources from the hackathon

PayPal brought in partners offering free credits and tools. **Claim links and instructions are on the hackathon's [Resources tab](https://paypalaihackathon.devpost.com/resources)** — check it while logged in.

| Partner | What it gives you | Used in Ostraca? |
|---|---|---|
| **PayPal sandbox + Agent Toolkit** | Free test APIs, test accounts, AI agent tools | ✅ Core |
| **AG Grid** (AG Studio) | Data grid, dashboards, AI assistant | ✅ Proof Ledger — eligible for AG Grid prize |
| **Render** | Hosting, Render Workflows | ✅ Deployment — eligible for Render prize |
| APIMatic | Context Plugin to give AI agents PayPal API knowledge | Optional, great while coding |
| Postman | Test/document APIs | Optional — publish a collection of our PayPal calls |
| Elastic, Kernel, Astropods, Channel3, Bryntum, Zapier | Search, agent infra, product data, scheduling, automation | Not needed |

## Setup (about 20 minutes)

### 1. PayPal sandbox
1. Log in at **developer.paypal.com**, switch the toggle to **Sandbox**.
2. **Testing Tools → Sandbox Accounts**: note the default **Business** (seller) and **Personal** (buyer) accounts; set their passwords via *View/Edit account*.
3. **Apps & Credentials → Create App** (type *Merchant*), linked to the sandbox Business account. Copy **Client ID** and **Secret**.
4. In the app's features, make sure **Disputes** is enabled.

### 2. Install and configure
```bash
npm install
cp .env.example .env      # then fill it in
```

### 3. Database
Create a free Neon project, paste its connection string into `DATABASE_URL`, then:
```bash
npm run db:push           # creates all tables from src/db/schema.ts
```

### 4. Check everything before building features
```bash
npm run check:sandbox     # PayPal auth, Disputes API access, tracking validator
npm run dev               # then open http://localhost:3000/api/health
```

### 5. First test sale and dispute
1. Open **http://localhost:3000/store** and pay with the sandbox **Personal** account.
2. The sale appears in the **Proof ledger** on the home page.
3. Log in to **sandbox.paypal.com** as the buyer → find the payment → *Report a problem* → *Item not received*.
4. After 10–15 minutes it shows on **/disputes** and in `npm run check:sandbox`.

### 6. Webhooks (after deploying to Render)
Developer Dashboard → your app → **Webhooks → Add**: `https://<your-app>.onrender.com/api/webhooks/paypal`, events `PAYMENT.CAPTURE.COMPLETED` and `CUSTOMER.DISPUTE.*`. Put the webhook ID in `PAYPAL_WEBHOOK_ID`.

## How to test

Start the app with `npm run dev`, open http://localhost:3000, and have your sandbox keys in `.env` (see Setup).

### Flow A: Capture proof
1. Open **Demo store** and pay with the sandbox Personal account. The sale appears in the **Proof ledger** on the home page.
2. Click the sale (its item name or anywhere on the row).
3. Under **1. Add proof**, open **Type it in**. Enter tracking `EE123456789IN` and carrier `India Post`, then **Save and check**. It is flagged `rejected` (wrong check digit) and nothing is queued.
4. On that field click **Edit**, change it to `EE123456785IN` and **Save**. It verifies, the readiness score rises, and **Ready to file with PayPal** appears.
5. Press **Approve and file tracking**. You should see "Tracking filed. PayPal usually releases holds about 24h after delivery." The ledger row now says Filed.
6. Optional: use **Upload a file** with a receipt photo, then **Confirm** or **Edit** each extracted field. Without an AI key, use **Type it in**.
7. Enter the same details again: it says "Already in your proof record". The **Activity** panel lists every step.

### Flow B: Answer a dispute
1. In sandbox.paypal.com, log in as the Personal buyer, find the payment, **Report a problem**, **Item not received**. It can take 10 to 15 minutes to appear.
2. In Ostraca open **Disputes** and click the dispute. Its status and stage come from PayPal and refresh every 10 seconds.
3. Open the linked sale (right side) and add proof as in Flow A, so there is something to cite. With no verified proof, the draft refuses and lists what is missing.
4. Back on the dispute press **Draft response with AI**. Every sentence cites facts like [F2] and you should see "Checks passed".
5. Edit the text to break a rule, for example change the tracking number. A red warning appears and queueing is disabled. Fix it.
6. Press **Queue for approval**. PayPal's status has not changed yet.
7. Under **Approval** press **Approve and send to PayPal**. Ostraca re-reads the dispute first and sends nothing if PayPal does not currently accept evidence. The status shown afterwards is whatever PayPal reports.
8. In the dashed **SANDBOX ONLY** box, the helpers (move to evidence stage, adjudicate) only simulate buyer or PayPal steps. PayPal may refuse them depending on the dispute's state, and you will see its message.

### Flow C: Limitation pack (simulated)
1. Click **Limitation pack** in the nav. The SIMULATED banner is at the top.
2. Click **Simulate limitation notice**. A generic sample notice appears and the step is logged.
3. Check the table. Sandbox reports can lag by hours, so sales PayPal has not listed yet are shown from Ostraca's own records and labelled.
4. Under **Cover note** press **Write a cover note with AI**. Try adding "This will lift the limitation." The check blocks it.
5. Click **Open print-friendly pack**. Press **Print or save as PDF** and choose "Save as PDF", or **Download HTML file**. The banner and disclaimers are in both.

## Architecture

```
Next.js UI (shadcn + AG Grid)
   │
API routes ──► AI extraction (Claude + OpenAI speech)  suggests
           ──► Validation engine (code)    verifies
           ──► Approval queue (seller)     decides
           ──► PayPal REST (sandbox)       acts — with idempotency keys
           ──► Postgres proof graph + audit log
```

| Folder | What lives there |
|---|---|
| `src/lib/paypal/` | Typed PayPal client: orders, capture, tracking, disputes, webhooks, transaction search |
| `src/lib/ai/extract.ts` | Claude reads images/PDFs; OpenAI transcribes voice notes; Claude returns schema-shaped JSON |
| `src/lib/validation/` | Deterministic checks: UPU S10 check digit, amount reconciliation, dates, buyer match |
| `src/lib/ai/dispute-draft.ts`, `src/lib/ai/limitation-note.ts` | Claude suggests wording from numbered facts only |
| `src/lib/validation/draft.ts`, `validation/limitation.ts` | Code checks every citation, number and promise in a draft |
| `src/lib/approvals.ts` | The approval queue (`agent_actions`): pending, approved, executed or failed, with idempotency keys |
| `src/lib/proof.ts` | Readiness recomputation and which uses each piece of evidence supports |
| `src/lib/limitation.ts` | Builds the limitation pack from Transaction Search and the proof record |
| `src/lib/readiness.ts` | Freeze Readiness Score (code, not AI) |
| `src/db/schema.ts` | Proof graph tables: transactions, evidence, extractions, links, disputes, actions, audit |
| `src/app/api/` | Route handlers |
| `scripts/check-sandbox.ts` | Sandbox readiness test |

### Safety rules built in
- Sandbox only — the app refuses to start against live PayPal.
- AI never has the final word: code validates, the seller approves every PayPal write.
- Original evidence stored unchanged with a SHA-256 hash.
- Dispute status is always re-read from PayPal; "resolved" is never assumed.
- Webhooks are verified with PayPal before being trusted.
- No card or bank data is ever stored.
- Dispute evidence is sent only if PayPal currently offers `provide_evidence`; otherwise nothing is sent.
- The limitation flow is a simulation. Its pack is never sent to PayPal and never claims to change PayPal's decision.

## Build plan

- [x] Boilerplate: checkout → capture → transaction, PayPal client, proof graph schema, extraction + validation modules
- [x] **Flow A** — evidence upload UI, seller confirmation, approval → `/track`, readiness score
- [x] **Flow B** — dispute webhook → cited draft → approval → `provide-evidence` → status from PayPal
- [x] **Flow C** — simulated limitation (clearly labelled) → transaction matching → printable pack
- [ ] Deploy to Render, demo video, Devpost story

## Adding more shadcn components
```bash
npx shadcn@latest add dialog table dropdown-menu
```

## License
[MIT](./LICENSE)
