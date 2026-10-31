# ANSER-v2 — ERD Merge & Finalization Strategy

> Prepared by: Database Design
> Inputs merged: ERD draft v1 (combined `StockMovement`), ERD draft v2 (split `Import/ExportTransaction`),
> developer's `HA_TANG_VA_ERD.md` (ERD v3 + proposals D1–D7), live `schema.ts` + 10 applied migrations,
> `Tong_hop_ton_kho-Hoàng-Phát-Kho-KM-24-07.xlsx` (real business stock report).

## 0. Premise

Neither the two hand-drawn ERDs nor the developer's markdown is being treated as "history" here — they
encode different knowledge (business modeling intent on one side, live implementation reality on the
other) and both are still live inputs. This document is the single place those get reconciled into one
schema decision per open point, so we stop having two documents that disagree.

**Ground truth for what currently *runs*:** `schema.ts` + the 10 applied migrations. Where the ERDs
propose something schema.ts doesn't have, that's a *proposal*, not a correction.

**Why this merge is comparatively cheap right now:** there is no production data yet, and you're
planning a one-time migration + cutover at ship time. That removes the hardest part of most schema
changes — backfilling and reconciling live rows — from nearly every item below. I've marked the couple
of places where that's *not* quite true (mainly if you intend to import the Excel/N-X-T historical data
before go-live).

Each item below follows the same format as the developer's D1–D7: **what**, **decision**, **why**,
**what breaks if left unresolved**. Items are numbered `M1…` (Merge) to avoid colliding with `D1…`.

---

## 1. Items where I'm recommending a decision now

### M1 · Retire `Category` as a placeholder question — decide table vs. text explicitly

**Conflict:** Both v1 and v2 model `Category` as its own table with an FK from `Product`. `schema.ts`
has `products.category` as free `text`, with no evidence in the code of it being anything else.

**Recommendation: promote `category` to a real table now.**

**Why now specifically:** this is the cheapest possible moment to do it — zero rows to migrate. Once
real product data exists, "Dầu nhớt," "dầu nhớt," and "Dầu Nhớt" become three categories the moment two
different people type it into a form, and cleaning that up later is exactly the kind of retrofit D5
(suppliers) is trying to avoid for counterparties. There's no offsetting cost to doing it early.

**What breaks if left as text:** category-based reporting ("lãi gộp theo từng loại dầu") silently
fragments the same category into near-duplicates; the low-stock automation's `categoryFilter` column
(already free text in `automationRules`) inherits the same drift.

**Needs your/dev team confirmation**, since it's new work, not a bug fix — flagging as a decision, not
silently resolving it.

---

### M2 · `Workflow` / `WorkflowExecution` — I'm dropping these from the ERD

You said these two tables were a placeholder because you didn't know how the dev team stored n8n
automation state. `schema.ts` answers that: it's a single table, `automation_rules` — `type`,
`thresholdQty`, `categoryFilter`, `warehouseId`, `enabled` (boolean, confirms your team's answer that
workflows can be disabled), and `n8nWorkflowId` as a manually-pasted pointer into n8n. There is
**no execution-history table today** — n8n presumably keeps its own run log.

**Decision: retire the placeholder `Workflow`/`WorkflowExecution` tables from the ERD; `automation_rules`
is the real table.**

**Open question to raise with the dev team (not something I can resolve from the artifacts I have):**
does the business ever need to see workflow *run history* (last run, success/fail, what it did) inside
ANSER's own dashboard, or is n8n's own execution log sufficient? If the former, that's a new table —
essentially your original `WorkflowExecution` idea, just attached to `automation_rules` instead of a
`Workflow` table. If the latter, no schema work needed here at all.

---

### M3 · Multi-warehouse: re-open the business question, don't resolve it silently

You noted the warehouse-visibility filter is "mostly precaution" and you don't actually know if the
owner runs multiple warehouses. The Excel report is titled `Kho: KHO KHUYẾN MẠI` and is scoped to that
one named kho — which implies there is at least a *concept* of more than one warehouse already in use
operationally (a promo-stock pool, separate from wherever the regular saleable inventory lives), whether
or not the owner has framed it to you that way.

**Decision: don't resolve this in the ERD.** Instead, take this specific finding back to the business
owner as a concrete question: *"Is 'KHO KHUYẾN MẠI' one of several warehouses you already operate, or a
separate bookkeeping category rather than a physical location?"* The answer changes how urgent D7
(`warehouse_id` on `inventory_transactions`, not just on `products`) is — right now `products.warehouseId`
is `NOT NULL`, meaning one product code can only ever live in one warehouse, which the promo-kho pattern
may already be straining if the same oil product also exists in a "regular" warehouse under a different
code.

**What breaks if left unresolved:** you ship D7 as deferred based on an assumption ("probably single
warehouse") that the one piece of real operational data you have mildly contradicts.

---

### M4 · `inventory_transactions.type` — enforce it, don't just comment it

`schema.ts` currently has `type: text("type")` with only a code comment saying `"import" | "export"` —
nothing in the database stops a bad value. D2 (adding `adjustment`/`transfer`) is about *which* values
are valid; this item is about *how* that's enforced.

**Decision: use a Postgres-level constraint (native `enum` type or `CHECK`), not just an
application-level comment**, once D2's value set is finalized. With multiple people writing to this
table (app code, any future import scripts, potentially n8n), a comment is not a guarantee.

**What breaks if left as free text:** exactly the D2 failure mode the developer already described
(users faking a phiếu to make numbers match) becomes *easier*, not harder, because there's nothing
stopping a typo'd type value like `"exprt"` from silently never matching any report filter.

---

### M5 · `quantity` precision — go one step further than "numeric"

Excel evidence: quantities like `38.4`, `172.8`, `940.8`, `2092.8` liters. D3 already proposes
`integer → numeric` for `inventory_transactions.quantity` and `sales_invoice_items.quantity` — agreed,
and now evidenced, not just argued.

**Decision: specify the precision explicitly** — `numeric(14,3)` (or similar) rather than unconstrained
`numeric`, so a future rounding bug can't silently produce eleven decimal places. Also: the units in the
same report aren't all liquid (`Cái`, `Bộ`, `Thùng`, `Chai` appear alongside `Lít`), so D3's companion
proposal (`products.unit_factor` for phuy↔lít conversion) needs to be general enough to cover "1 Thùng =
24 Chai" style conversions too, not only volume. Worth a short conversation with the dev team on whether
`unit_factor` is a single number (base-unit multiplier) or needs a small `unit_conversions` lookup if
multiple conversion chains exist per product.

---

### M6 · Suppliers (D5) — confirmed, and cheaper than the developer's writeup assumed

The developer's worry about D5 was messy free-text cleanup (`"Cty ABC"` vs `"ABC"` vs `"abc trading"`).
**That risk doesn't apply here** — there's no production data, so there's nothing to clean up. This is
a greenfield table add, not a migration.

**Decision: adopt D5 as written.** One thing worth deciding alongside it: the Excel report has **no
supplier column at all**, so I can't validate supplier data shape from it — if you plan to import
historical N-X-T files that *do* carry supplier names as free text, that import step (not the schema)
is where the messy-matching problem the developer described will actually show up. Flag it as a data-
import concern, not a schema concern.

---

## 2. Items I'm treating as settled — carried through as-is

These already have a clear resolution from either your answers or the developer's writeup; listed here
so this document is a complete picture, not because they need more debate.

| Item | Resolution |
|---|---|
| Combined vs. split stock-movement tables | Combined (`inventory_transactions`), matches live code. Split `ImportTransaction`/`ExportTransaction` from ERD v2 dropped. |
| D1 — link `inventory_transactions` to source document | Adopt. Add `source_type` + `source_id` (soft/polymorphic FK, nullable). |
| D2 — add `adjustment`, `transfer` to `type` | Adopt (see M4 for enforcement). |
| D4 — receivables in Postgres | Adopt. One-time cutover from Sheets at ship time, per your answer — no dual-source period to design around. |
| Transport/vận tải (nhà xe, tuyến, báo giá) | Explicitly out of scope this round. Stays in Sheets/n8n; separate conversation with the business owner before ERD v4. |
| D6 — stock reconciliation endpoint | Adopt as described; no schema change, just a `POST /api/inventory/reconcile` deliverable for the dev team. |
| `Inventory` as a separate table (ERD v2) | Dropped — `products.stock` is the running-balance column; D6 is the safeguard against it drifting from `inventory_transactions`. |

---

## 3. Still genuinely open — needs a person, not a schema decision

- **M1** (Category table) — needs a yes/no from you + dev team; cheap either way, but it's new scope.
- **M2** (workflow execution history) — needs to be asked of the dev team; depends on whether n8n's own
  logs are considered sufficient by the business.
- **M3** (multi-warehouse reality) — needs to go back to the business owner with the specific
  `KHO KHUYẾN MẠI` question above. This is the one item that could change D7's priority.
- **D7 itself** (`warehouse_id` on transactions) — priority is contingent on M3's answer. If the owner
  confirms multiple physical warehouses are real and current, I'd move D7 out of "deferrable" and into
  the same batch as D1–D4.

---

## 4. Recommended sequence

1. **Circulate this document** — get M1/M2/M3 answered (owner + dev team) before writing the final ERD,
   since M3 in particular can change what "final" even means for D7.
2. **Produce one canonical ERD** (mermaid, same style as the developer's v3) incorporating every decision
   above — this document's job ends once that diagram exists and both sides have signed off on it.
3. **Write the corresponding `schema.ts` changes** — D1–D6 (+ D7 if M3 elevates it), M1, M4, M5, M6.
4. **Generate migrations the normal way** (`drizzle-kit generate`), continuing the existing sequence
   (`0011_…` onward) — no need to squash the existing 10 migrations; there's no production data forcing
   a clean slate, and keeping the history is useful for anyone reviewing how the schema got here.
5. **If historical data import is in scope** (N-X-T files, old Excel reports) — do that *after* the new
   constraints (M4's type enum, M5's numeric precision, D3) are live, so bad historical rows fail loudly
   at import time instead of silently violating assumptions later.
6. **Cutover**, then turn on M2's answer (execution history) and D6 (reconciliation endpoint) as
   post-launch hardening rather than blockers.

---

## 5. Open items summary (for quick reference)

| # | Item | Type | Status |
|---|---|---|---|
| M1 | `Category` as table | Business/dev decision | Open |
| M2 | Workflow execution history | Business/dev decision | Open |
| M3 | Multi-warehouse reality (`KHO KHUYẾN MẠI`) | Business question | Open — take back to owner |
| M4 | `type` enforcement (constraint, not comment) | Technical, low risk | Recommended |
| M5 | `quantity` precision + generalized `unit_factor` | Technical, evidenced by Excel | Recommended |
| M6 | Suppliers table | Adopt (D5), no cleanup needed | Recommended |
| D7 | `warehouse_id` on transactions | Priority contingent on M3 | Pending M3 |
