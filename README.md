# Ostraca

**Prove it before they ask.** Ostraca keeps an AI-verified proof record for every PayPal sale, so small sellers can answer holds, disputes and account limitations in minutes instead of days.

Built for the [PayPal AI Hackathon 2026](https://paypalaihackathon.devpost.com/). Runs entirely on the **PayPal sandbox**.

> Ostraca does not control PayPal's decisions. PayPal decides on holds, disputes and limitations. Ostraca makes sure the seller's evidence is complete, correct and fast.

---

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

## Build plan

- [x] Boilerplate: checkout → capture → transaction, PayPal client, proof graph schema, extraction + validation modules
- [ ] **Flow A** — evidence upload UI, seller confirmation, approval → `/track`, readiness score
- [ ] **Flow B** — dispute webhook → cited draft → approval → `provide-evidence` → status from PayPal
- [ ] **Flow C** — simulated limitation (clearly labelled) → transaction matching → PDF pack
- [ ] Deploy to Render, demo video, Devpost story

## Adding more shadcn components
```bash
npx shadcn@latest add dialog table dropdown-menu
```

## License
[MIT](./LICENSE)
