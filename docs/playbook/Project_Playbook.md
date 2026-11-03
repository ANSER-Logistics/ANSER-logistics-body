# ANSER-v2 — Project Playbook

> Last updated 17/09/2026
> This doc does not replace documents numbered `0.`–`4.` below (in `docs/decisions/`) — it points at them, tells you which parts are stale, and adds what happened after `4.` was last written.

## 0. How to use this document

Read this first, then go to the specific doc a section points you to. Don't re-read
`0.`–`3.` front-to-back — they're **decision history** (each one superseded by the next,
per their own headers). `schema.ts` is the only thing that's always current; if this
playbook and `schema.ts` disagree, trust `schema.ts` and fix this doc.

## 1. What this project is

**ANSER Web v2** — inventory + sales management for **Hoàng Phát**, a Vietnamese
lubricant/oil distributor. Rewrite of an older Flask codebase (unrelated, not called
into). Single Next.js app: UI + API routes in one project, no separate backend.

| Layer | Choice | Why (see `docs/architecture/STACK_DECISIONS.md`) |
|---|---|---|
| Web app | Next.js (App Router, Route Handlers) | One deploy, one type system FE↔BE, no CORS |
| DB | Neon Postgres via Drizzle ORM, `neon-serverless` pool driver | Pool driver (not `neon-http`) specifically because `db.transaction()` is required for inventory writes |
| Auth | JWT in httpOnly cookie | — |
| AI (OCR, chat, audits) | Separate service(s), called over HTTP — see §7 | Keeps the web app from carrying model-serving weight |
| Automation | n8n, self-hosted, called via webhook | — |

## 2. Documentation map

| Doc | Branch | What's in it | Status |
|---|---|---|---|
| `docs/decisions/0. HA_TANG_VA_ERD.md` | both | Original infra + ERD v3, proposals D1–D7 | History |
| `docs/decisions/1. ERD_Merge_Finalization_Strategy.md` | both | My merge proposal, M1–M6 | History |
| `docs/decisions/2. ERD_PHAN_HOI_VA_LUOC_DO.md` | both | Dev team's reply, added B1–B7 | History |
| `docs/decisions/3. ERD_CHUAN.md` | both | **Canonical ERD** after real MISA data was run through it. Added C1/C2. Includes full target `schema.ts`, indexes, reconciliation SQL. | **Partially stale** — see §3.1 |
| `docs/decisions/4. Database_Implementation_Documentation.md` | **master only** | Step-by-step implementation log for ERD_CHUAN's Task 1–4 (schema migration, constraint verification, `sales.ts` sign-convention fix, `/api/inventory/reconcile`), plus a short retrospective timeline for Task 5, added 18/09. | Not merged into `feat/database-application` — read it on `master` |
| `docs/decisions/evidence/all_constrain.json`, `docs/decisions/evidence/single_table_data_types_and_columns.json` | **master only** | Raw Neon `pg_constraint`/`information_schema` dumps used to verify Task 2 above | Reference, not living docs |
| `docs/decisions/5. Database_Session_Log.md` | this branch, uncommitted | Dense session log: bugs found/fixed, real-data import findings, prioritized open items | Mine everything in §5 comes from here — read it directly for full detail |
| `docs/architecture/ARCHITECTURE.md` | this branch | Full file-by-file map of the Next.js app, request flows, current limitations table | Current, keep using it |
| `src/server/db/schema.ts` | this branch | **Ground truth.** Ahead of ERD_CHUAN — see §3.1 | Always current |

## 3. Current domain model

```mermaid
erDiagram
    warehouses  ||--o{ products              : "chứa"
    warehouses  ||--o{ employees             : "phụ trách"
    warehouses  ||--o{ automation_rules      : "phạm vi"
    categories  ||--o{ products              : "phân loại"
    categories  ||--o{ automation_rules      : "lọc theo"
    products    ||--o{ products              : "cùng mặt hàng (C1)"
    products    ||--o{ inventory_transactions : "ghi trong"
    products    ||--o{ sales_invoice_items   : "bán trong"
    suppliers   ||--o{ inventory_transactions : "cung cấp"
    employees   ||--o{ inventory_transactions : "thực hiện"
    users       }o--|| employees             : "gắn với"
    customers   ||--o{ sales_invoices        : "đặt"
    sales_invoices ||--|{ sales_invoice_items : "gồm"
    sales_invoices ||--o{ invoice_payments   : "được trả bằng"

    warehouses {
        uuid id PK
        text name UK
        boolean allows_zero_value
    }
    categories {
        uuid id PK
        text name "case-insensitive unique index, not a UK constraint"
    }
    suppliers {
        uuid id PK
        text code "nullable, MISA NCC00001, case-insensitive unique"
        text tax_code
        numeric opening_debt
    }
    products {
        uuid id PK
        text code UK
        uuid category_id FK
        uuid warehouse_id FK
        uuid linked_product_id FK
        text unit
        text base_unit
        numeric unit_factor
        numeric stock
        integer price
        integer cost
        boolean is_reduced_vat
    }
    inventory_transactions {
        uuid id PK
        uuid product_id FK
        uuid warehouse_id FK "nullable, D7"
        text type
        numeric quantity "signed"
        integer unit_cost
        text source_type
        uuid source_id
        uuid supplier_id FK
        uuid employee_id FK
    }
    customers {
        uuid id PK
        text code "nullable, unique"
        text name
        numeric opening_debt
    }
    sales_invoices {
        uuid id PK
        uuid customer_id FK
        uuid warehouse_id FK
        integer total
        date due_date
    }
    sales_invoice_items {
        uuid id PK
        uuid invoice_id FK
        uuid product_id FK
        text product_name "snapshot"
        integer unit_price "snapshot"
        integer unit_cost "snapshot"
        numeric quantity
    }
    invoice_payments {
        uuid id PK
        uuid invoice_id FK
        integer amount
        text method
    }
    employees {
        uuid id PK
        text name
        uuid warehouse_id FK
    }
    users {
        uuid id PK
        text role "CHECK staff|manager|admin"
        uuid employee_id FK
    }
    automation_rules {
        uuid id PK
        text type
        uuid category_id FK
        uuid warehouse_id FK
        text n8n_workflow_id
    }
```

Full rationale for every column/constraint (why signed `quantity`, why `NULL` ≠ `0` on
`cost`, why `linked_product_id`, etc.) is in `docs/decisions/3. ERD_CHUAN.md` §4 — still accurate for
everything it covers. Don't re-derive those decisions; read them.

### 3.1 Where live `schema.ts` has moved past `ERD_CHUAN`

Migration `0014_youthful_red_wolf.sql` added three things ERD_CHUAN doesn't mention:

| Column | Why (inferred from schema.ts comments) |
|---|---|
| `suppliers.code`, `customers.code` (nullable, case-insensitive unique index) | Reconciliation key against MISA exports — MST/tax code alone isn't reliable (comments cite 42/43 suppliers have one, but only 77/105 customers do) |
| `suppliers.opening_debt`, `customers.opening_debt` (`numeric(18,2)`) | Opening payable/receivable at export time. **This is new schema surface that didn't exist when `frontend/import-real-data.ts` (untracked, see §5) was written** — that script's own comments say no such column exists. It's now wrong on that point. |
| `products.is_reduced_vat` (nullable boolean) | Nghị định 174/2025 2% VAT reduction flag, read by `/api/ai/vat-catalog`. Nullable = "not checked yet," same NULL-≠-false discipline as `cost`. |

Also new since ERD_CHUAN: an **AI module** (`/api/ai/*` — chat, report, freight-invoice
OCR, inventory-audit, inventory-cost, partner-audit, period-diff, vat-catalog) and an
**Excel category-import feature** (`src/server/import/`, latest commit). Neither changed
the core schema beyond the `0014` columns above.

## 4. How we got here (condensed)

1. Two hand-drawn ERDs + `docs/decisions/0. HA_TANG_VA_ERD.md` (v3, D1–D7) needed reconciling against live
   `schema.ts` → I wrote `docs/decisions/1. ERD_Merge_Finalization_Strategy.md` (M1–M6).
2. Dev team agreed, added B1–B7 (most importantly **B1**: signed `quantity` instead of
   type+unsigned add/subtract logic) → `docs/decisions/2. ERD_PHAN_HOI_VA_LUOC_DO.md`.
3. Real MISA exports run through a loader surfaced two more decisions (C1
   `linked_product_id`, C2 `allows_zero_value`) and confirmed M3 (KHO KHUYẾN MẠI is a
   bookkeeping label — pilot is single-warehouse in practice) → `docs/decisions/3. ERD_CHUAN.md`,
   **the canonical schema**, with a 7-step implementation order at its end.
4. `docs/decisions/4. Database_Implementation_Documentation.md` (master only) executed that order,
   step by step, with real code diffs:
   - **Task 1** — pasted `schema.ts`, generated `0012_misty_cammi.sql`, diffed
     generated SQL against the source by hand (drizzle-kit has been known to drop
     `check()` constraints), created a Neon `dev` branch off `production` for safe
     experimentation.
   - **Task 2** — verified every constraint actually landed on Neon via
     `pg_constraint`/`information_schema` queries (dumps saved as the two `.json`
     files, master only).
   - **Task 3** — fixed `store/sales.ts`'s sign convention (`stock - quantity` →
     signed `+`), added missing `employeeId` threading, `sourceType`/`sourceId`
     linking a stock movement back to its invoice, `salesInvoices.warehouseId`
     population, proper error-flow in the route handler, and a `.for("update")` row
     lock closing a read-check-write race condition on concurrent sales of the same
     product.
   - **Task 4** — built `GET /api/inventory/reconcile` (compares `products.stock`
     against `SUM(inventory_transactions.quantity)`, `EPSILON = 0.001` for
     numeric(14,3) rounding) — after confirming it doesn't overlap
     `/api/ai/inventory-audit` (external-file diff) or `/api/ai/inventory-cost`
     (one-way cost-sheet write).
   - **Task 5** (real MISA data import, `allows_zero_value` flagging,
     `linked_product_id` linking) — the original plan, sitting in the untracked
     `frontend/import-real-data.ts` (§5 item 1). **Doc updated 18/09 with a
     retrospective instead of a Step 1**: `feat/database-application` branched off
     `master` 23/08 (right after `4.`'s Task 1–4 work merged in), and instead of
     finishing this plan, the team shipped migration `0014` + the new "Nhap Excel"
     catalog-import feature, demoed the app to chú Quyết, then paused the whole
     effort until 18/09. Read literally this sounds like "the general import problem
     got solved, not the specific historical-reconstruction one" — see §5 item 1 for
     why that's evidence, not confirmation.

## 5. Open items — moved

Open items no longer live in this playbook. Two living docs track them now:

- **Waiting on a decision** (owner, Brain team, team lead) → `docs/tasks/BLOCKERS.md`
- **Ready for someone to pick up** → `docs/tasks/Backend_Task_Board.md`

Where each item that used to be listed here went, so older references like "§5 item 1"
or "[PB] §5.2" still lead somewhere:

| Former item | Now |
|---|---|
| 1. `frontend/import-real-data.ts` is stale | `docs/tasks/BLOCKERS.md` D3 |
| 2. Three products disagree between catalog and N-X-T (`KM00008`, `KM00017`, `KM00034`) | `docs/tasks/BLOCKERS.md` D1 |
| 3. Negative-stock rows (`VT00039`, `VT00042`, possibly `KM00034`) | `docs/tasks/BLOCKERS.md` D2 |
| 4. No selling price in any source file | §6 below — the multi-tier pricing initiative |
| 5. `getSalesReportForPeriod` `::integer` cast | **Fixed** in `16ae83b` (`docs/tasks/BLOCKERS.md` → "Đã giải quyết") |
| 6. Seed orchestration (`seedCategories()` never ran) | **Fixed** in `16ae83b` (`runStartupSeed()`) |
| 7. Startup seed runs in production | **Fixed** in `16ae83b` (`ENABLE_STARTUP_SEED=true` opt-in) |
| 8. CRLF/LF line-ending noise | **Fixed** in `16ae83b` (`.gitattributes`); `brain.ts` still noisy → `docs/tasks/BLOCKERS.md` K1 |

## 6. Current initiative: multi-tier pricing ("Giá áp dụng")

### Business context (meeting with Mr. Quyết)

- Price is **deliberately absent** from every Excel export — it varies per customer
  ("khách ruột" vs "khách lạ") and by multiple factors, not an oversight.
- A fixed/base price list exists, but **changes require approval from someone above**
  before taking effect — not a plain field edit.
- He sets the *daily* price by weighing **Đại lý cấp 1, cấp 2, and giá bán lẻ together**
  against the market — the tiers inform each other, they aren't independent lists set
  once and forgotten.
- Purchase-side cost also tiers: **giá nhập lẻ vs giá nhập sỉ** (retail vs wholesale
  buy price) — a separate concept from the sales-side tiers below.
- His other company's ERP (`erp.eteksofts.com`) only supports **one price-tier field
  per invoice** — mixed-tier invoices must be split into multiple invoices. Anything we
  build should support tier selection **per line item** to beat that limitation.
- Open, unresolved, not a DB question but worth tracking: RBAC on the AI chatbot (who
  gets access, leak risk on his messages) and a TODO for expiry dates / hàng thanh lý
  (clearance stock) — neither has a schema home yet.

### Feature request (from his demo)

A "Giá áp dụng" selector when creating a sales transaction, five tiers:
`Bán lẻ` · `Đại lý cấp 1` · `Đại lý cấp 2` · `Đại lý cấp 3` · `Giá bán thương mại điện tử (online)`.

### Clarified 18/09/2026 (second coworker present at a follow-up pass on the meeting notes)

Two things that change the design, straight from re-checking the meeting notes with
someone else who was in the room:

- **Chú Quyết wears two hats.** He's an *employee* at "Tân Phát" (owner of the
  `erp.eteksofts.com` demo software) and separately the *owner* of "Hoàng Phát" (the
  actual pilot client). The "cần có bên đứng trên để duyệt giá" answer describes **Tân
  Phát's** process (he has to submit for a superior's approval there) — **it does not
  apply to Hoàng Phát**. At Hoàng Phát he's the owner of a 3–5 person team; the
  accountant enters prices by hand and he **monitors**, but there's no one "above him" to
  gate a change. → **Open question #2 below is resolved: no approval workflow to design.**
- **Đại lý cấp 3 and the online/TMĐT price are Tân Phát demo artifacts, not confirmed
  Hoàng Phát tiers.** Tân Phát's software may simply offer a wider price list than
  Hoàng Phát actually uses today. The only tiers confirmed live at Hoàng Phát right now
  are **Bán lẻ, Đại lý cấp 1, Đại lý cấp 2**. Cấp 3/online might get added later — and
  when they do, it needs to be a data insert, not a schema migration. **This rules out a
  hardcoded `CHECK ... IN (5 values)` enum** (my first sketch) in favor of a lookup table.

### Proposed schema — **open proposal, not yet implemented, needs sign-off**

```ts
// Lookup table, not a hardcoded enum — adding a tier later (cấp 3, online, or
// anything else Hoàng Phát comes up with) is an INSERT, not a migration.
export const priceTiers = pgTable("price_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(), // 'retail' | 'agent_1' | 'agent_2' | ... — free-form
  name: text("name").notNull(), // display label, e.g. "Bán lẻ"
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true), // retire a tier without deleting its price history
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("price_tiers_code_unique").on(sql`lower(${t.code})`),
]);

export const productPrices = pgTable("product_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  tierId: uuid("tier_id").notNull().references(() => priceTiers.id, { onDelete: "restrict" }),
  price: integer("price").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("product_prices_product_tier_unique").on(t.productId, t.tierId),
]);
```

Seed only the 3 confirmed rows (`retail`/`agent_1`/`agent_2`) — do not pre-seed
`agent_3`/`online` until Hoàng Phát actually asks for them.

Plus one nullable FK on the existing sale line (nullable = walk-in/manual override,
no tier picked):

```ts
priceTierId: uuid("price_tier_id").references(() => priceTiers.id, { onDelete: "set null" }), // on sales_invoice_items
```

**Open questions to resolve before writing the migration**:

1. **`products.price` is read directly in a lot of places today**
   (`reports.ts`'s `totalStockValue`, `sales.ts` defaulting `unitPrice`, the products
   list UI). Does it become the `retail` row's mirror, get dropped in favor of always
   joining `product_prices`, or stay as a fallback when a tier price isn't set? Pick
   one before migrating — this determines whether it's an additive migration or a
   breaking one.
2. ~~Approval workflow~~ **Resolved 18/09** — no approval gate needed for Hoàng Phát (see
   above). Still worth asking whether "chú giám sát" wants more than that — e.g. a plain
   `updated_by`/`updated_at` on `product_prices` for visibility, short of a blocking
   workflow. Low priority, not a blocker.
3. **Effective-dating** — prices are "sửa liên tục." Is last-write-wins acceptable, or
   does reporting need to know what a tier's price *was* on a past date independent of
   any sale (the sale-line snapshot only captures the price actually charged, not the
   tier's list price history)?
4. **Purchase-side tiers** (giá nhập lẻ/sỉ) — separate table mirroring this one against
   `inventory_transactions`, or out of scope until sales-side ships first? Still open —
   also still unconfirmed whether this was a direct answer to a specific question or a
   volunteered aside (see the meeting note's own 18/09 follow-up list).
5. **Confirmed still open, not resolved by the 18/09 pass**: does the AI team's
   long-term-vs-walk-in idea (§7) end up as another row in `price_tiers`, a
   `customers.default_tier_id` column, or something orthogonal to this table entirely
   (e.g. a discount applied *within* whatever tier a customer is already on)? Directly
   confirmed as genuinely undecided — not something chú Quyết clarified, not something
   the AI team has written down yet either.

## 7. Dependency: the AI/"Brain" team

Separate repo: `PCBoiz/ANSER_AI`, branch `feat/workflow-format-and-deterministic-core`.
Two handover docs exist there (`TIEN_TRINH_BRAIN.md` — accounting/AI engine status,
`BAN_GIAO_VAN_TAI.md` — transport/freight quoting module, deprioritized to a side
branch because the pilot customer isn't a transport company). Neither doc currently
specifies the long-term-vs-walk-in customer pricing idea in writing — as of this
writing it's still a conversation on their side, not a spec.

**One principle from their docs is worth carrying into any pricing work here**: their
non-negotiable rule is that AI **never computes financial numbers, only deterministic
code does** (they had a real incident where a model mentally computed
`5.000.000 + 500.000`, got it right, and that was flagged as dangerous precisely
*because* it happened to be correct that one time). Whatever the AI team proposes for
customer-tier pricing, the actual charged-price calculation belongs in this repo's
deterministic backend — Brain can recommend or explain a tier, it shouldn't be the
thing computing the number that ends up on an invoice.

## 8. Working in this repo — operational notes

- **One lockfile**: `frontend/pnpm-lock.yaml`. Any package manager to develop with, but
  `pnpm install` + commit the lockfile after any dependency change (`README.md`).
- **Drizzle workflow**: edit `schema.ts` → `pnpm db:generate` → **manually diff the
  generated SQL against `schema.ts`** before trusting it — drizzle-kit has dropped
  `check()` constraints before (see §4, Task 1 step 2) → `pnpm db:migrate`.
- **Verify constraints actually landed** on Neon after migrating, don't just trust the
  generator — the `pg_constraint`/`information_schema` queries in `4.` (master) are the
  pattern to reuse.
- **Use a Neon branch for experiments** (`dev`, parented off `production`), not
  production directly — this project already does this (§4, Task 1 step 3).
- **Line endings**: `.gitattributes` normalizes everything to LF (since `16ae83b`). Set your
  editor to LF. `frontend/src/server/brain.ts` still shows as modified on every checkout —
  don't commit it; see `docs/tasks/BLOCKERS.md` K1.

## 9. Where to start

1. New to the codebase, or to coding? Read `docs/onboarding/Onboarding_Playbook.md` first
   (Vietnamese; setup, how the code is layered, never-do rules).
2. Read §1–§4 and §6 here for the big picture, then `docs/decisions/5. Database_Session_Log.md` for the detailed
   session log (this playbook only indexes it).
3. Pick work from `docs/tasks/Backend_Task_Board.md`, and follow its coordination rules
   (where to branch from, who may create migrations).
4. Before deciding anything about pricing tiers, credit terms, roles, or real-data
   anomalies, check `docs/tasks/BLOCKERS.md` — if it's listed there, it's not ours to decide
   alone.
