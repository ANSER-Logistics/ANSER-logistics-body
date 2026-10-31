@AGENTS.md

Last updated 18/09/2026 (previous entry below: 23/08/2026)
# ANSER-v2 Database — Conversation Compact Summary 

**Project:** ANSER-v2, an inventory/sales system for Hoàng Phát (Vietnamese oil/lubricant
distributor). Stack: Next.js + Drizzle ORM + Neon Postgres. Role in this conversation:
Database Designer/Engineer, working alongside a separate dev team ("Brain" = backend/Python
side that also handles Excel parsing for other features).

## How we got here

1. Two early hand-drawn ERDs (v1: combined `StockMovement` table; v2: split `Import/ExportTransaction`)
   plus a developer markdown (`HA_TANG_VA_ERD.md`, ERD v3, proposals **D1–D7**) needed reconciling
   against the live `schema.ts`.
2. I produced an **ERD Merge & Finalization Strategy** doc (**M1–M6**) (see 1. ERD_Merge_Finalization_Strategy) — resolved combined-vs-split
   in favor of the unified table (already matched code), flagged open items (Category as table,
   workflow execution history, multi-warehouse reality).
3. Dev team responded with `2__ERD_PHAN_HOI_VA_LUOC_DO.md` — agreed with M1–M6, added **B1–B7**
   (most important: **B1**, signed `quantity` instead of type-based add/subtract logic).
4. Dev team ran real MISA export files through a loader/checker, producing `3__ERD_CHUAN.md` —
   the **canonical final ERD**, superseding all prior docs. Added **C1** (`linked_product_id`,
   same item under two codes across warehouses) and **C2** (`allows_zero_value` on warehouses,
   for the promo warehouse's real ₫0-value rows). Resolved M3: "KHO KHUYẾN MẠI" confirmed as a
   bookkeeping label, not a second physical warehouse — pilot is single-warehouse, D7 (warehouse_id
   on transactions) stays deferred/nullable.

## Current final schema (as implemented, `feat/database-implementation` → merged to `master`)

Tables: `warehouses` (+`allowsZeroValue`), `categories` (new, M1), `suppliers` (new, M6),
`employees`, `users` (role CHECK constraint), `products` (+`categoryId`, `linkedProductId`,
`baseUnit`, `unitFactor` numeric>0, `stock` numeric(14,3)), `inventory_transactions`
(+`warehouseId` nullable, `quantity` **signed** numeric(14,3), `sourceType`/`sourceId` paired
CHECK, `supplierId`, `employeeId`, `type` CHECK'd to import/export/adjustment/transfer,
`quantity <> 0` CHECK), `customers` (+`taxCode`), `sales_invoices` (+`warehouseId`, `dueDate`),
`sales_invoice_items` (`quantity` numeric, `quantity <> 0` CHECK), `invoice_payments` (new, B4 —
receivables derived as `total - SUM(payments)`, not a stored balance column), `company_settings`,
`automation_rules` (+`categoryId` replacing free-text `categoryFilter`, +`lastRunAt`/`lastRunStatus`/
`lastRunNote` for M2).

## Bugs found and fixed, in order

1. **`store/sales.ts` sign convention** — original `stock - quantity` fixed to
   `stock + (-quantity)`, matching B1's signed-ledger design. Also added: `sourceType: "sale"` +
   `sourceId: invoice.id` (D1), `employeeId` threading end-to-end, `salesInvoices.warehouseId`
   population, `NoItemError` for empty line items, `.for("update")` row lock fixing a
   read-check-write race condition (my flag, their fix). `route.ts` catch block made exhaustive.
2. **A *second*, worse version of the same bug** appeared in a later paste: `stock + item.quantity`
   (missing the negation) while the ledger insert correctly had `-item.quantity` — directionally
   opposite, would have drifted `products.stock` upward on every sale. Caught by inspection before
   it reached real data; confirmed fixed in the next paste.
3. **`reports.ts` crash on login → dashboard**: `products.category` (old schema) still referenced
   after the M1 rename to `categoryId`, causing Drizzle's `orderSelectedFields` to recurse into
   `undefined` and throw `Cannot convert undefined or null to object`. Same stale-`category`
   pattern also caused **silent** (non-crashing) bugs: `automation.ts`'s `evaluateAlerts` comparing
   `undefined === undefined` (matched everything, defeating category-scoped rules), and
   `stockByCategory`'s chart always computing zero. All fixed by switching to `categoryId` +
   `leftJoin(categories)` throughout; verified `store/categories.ts`'s `getOrCreateCategoryByName`
   has real NFC-normalization + case-insensitive matching, backed by a DB-level unique index
   (`categories_name_case_insensitive_unique` on `lower(name)`) added specifically to close a
   race-condition gap the app-only version had.
4. **Still open, not yet fixed**: `getSalesReportForPeriod`'s `sum(quantity)::integer` cast
   truncates fractional liters in the one report an n8n workflow actually consumes — flagged
   twice, not yet addressed in any paste.

## Reconciliation endpoint

Built `GET /api/inventory/reconcile` (at `api/inventory/reconcile/route.ts`, sibling to existing
`api/inventory/transactions/route.ts`) — compares `products.stock` against
`SUM(inventory_transactions.quantity)` per product, read-only, `EPSILON = 0.001` tolerance for
numeric(14,3) rounding. Verified against live `schema.ts`/`client.ts` (Neon `neon-serverless` pool
driver, `getSessionUser()` returns `User | undefined`).

First real run against a fresh Neon account's `dev` branch returned `mismatchCount: 5` on 5 products
— traced to `seed.ts`'s **demo data** (industrial parts — rollers, bearings, aluminum sheet — clearly
leftover scaffold data, unrelated to Hoàng Phát's actual oil business), not a real bug. Root cause:
`SEED_PRODUCTS.stock` and `SEED_IMPORTS.quantity` were always two independent, never-reconciled
arrays (predates the reconciliation invariant existing at all).

## Separate bug found while investigating the above: seeding never ran

`instrumentation.ts` calls `seedInitialData()`, whose only idempotency guard checks `products`
table emptiness — but `seedInitialData()` was later modified (`new_seed.ts`) to also call
`seedCategories()` as an internal first step. Once `products` had rows from an earlier run (before
categories existed as a seed concept), the guard short-circuits and **`seedCategories()` never
executes**, even after `categories` support was added. Result: 5 products, 0 categories, on a
freshly truncated `dev` branch.

**Fix discussed, not yet implemented**: pull `seedCategories()` (and other steps) out to their own
directly-called, self-guarded functions orchestrated by one `runStartupSeed()`, rather than nesting
a new resource's seeding inside an existing function's stale precondition.

**Flagged, not yet resolved — production seeding safety**: `instrumentation.ts` has no environment
gate at all; `register()` runs on every cold start including production. Demo admin credentials
(`seedDemoUser`) could be a standing backdoor in production depending on how they're generated —
**`store/users.ts` was requested but never provided**, so this is unresolved. Recommended shape:
gate behind an explicit opt-in env flag (not `NODE_ENV`, since some staging/preview environments
also report `production`).

## Real business data — 4 Excel files analyzed, import script written

Files: `Danh_sach_hang_hoa_dich_vu.xlsx` (161-product catalog + current stock, no price column),
`Danh_sach_khach_hang.xlsx` (108 customers, has `Công nợ`/receivable), `Danh_sach_nha_cung_cap.xlsx`
(46 suppliers, has `Công nợ`/payable, 2 rows with anomalous `KH*`-prefixed codes instead of `NCC*`),
`Tong_hop_ton_kho-37.xlsx` (121-row N-X-T report, `KHO HÀNG HÓA`, ends 11/08/2026),
`Tong_hop_ton_kho-Hoàng-Phát-Kho-KM-24-07.xlsx` (38-row N-X-T report, `KHO KHUYẾN MẠI`, ends
24/07/2026).

**Verified via pandas**: all N-X-T rows arithmetically consistent (`opening + import - export =
closing`, zero exceptions). **Corrected an earlier fabricated claim**: real negative-stock SKUs are
**VT00039 (−108)**, **VT00042 (−16)**, **KM00034 (−115.2)** — I had previously guessed "VT00059"
without checking real data; that was wrong. **New finding**: catalog stock disagrees with N-X-T
closing balance for exactly 3 products (KM00008, KM00017, KM00034) — most likely genuine untracked
activity between the two reports' different, unstated export dates, not a transcription error.

Wrote `scripts/import-real-data.ts` (TypeScript, using the project's own `db`/`schema`/
`getOrCreateCategoryByName`, not a standalone Python script) — loads warehouses, 3 coarse
placeholder categories (HH/DV/CP, since real categories aren't derivable from the source data),
products (price defaults to 0 — no source file has a selling price), and reconstructs
`inventory_transactions` per product from each N-X-T row (opening/import/export as 3 transactions,
`sourceType`/`sourceId` left null since there's no real originating document, only aggregated
summaries) plus one bridging `adjustment` transaction for the 3 mismatched products. **Deliberately
skips** both `Công nợ` columns — importing them as synthetic invoices would have silently inflated
`reports.ts`'s revenue totals, which sum `salesInvoices.total` unconditionally. Script has not been
executed against the real Neon branch yet (no network access from this environment) — validated only
via local pandas parsing checks on the actual files.

## Open items — not yet resolved, roughly in priority order

1. **3-product catalog/N-X-T mismatch** (KM00008, KM00017, KM00034) — needs the business owner to
   confirm whether real activity happened between the two export dates.
2. **3 negative-stock rows** (VT00039, VT00042, KM00034) — root cause unknown (missing purchase
   doc vs. period cutoff), needs owner input, not yet reported to the client per ERD_CHUAN.
3. **No selling price in any source file** — needs to be sourced separately before real invoicing
   works.
4. **Customer/supplier debt has no schema home** — needs a scope decision: does ANSER need
   receivables/payables tracking at all, or does that stay in the owner's existing accounting
   software permanently?
5. **`getSalesReportForPeriod`'s `::integer` cast** truncating fractional quantities — flagged
   twice, unfixed.
6. **Seed orchestration bug** (categories never seed on a `dev` branch with pre-existing products)
   — diagnosed, fix agreed in shape, not implemented.
7. **Production demo-admin seeding safety** — blocked on seeing `store/users.ts` (`seedDemoUser`),
   never provided.
8. **Real category taxonomy** — placeholder HH/DV/CP buckets in the import script need owner input
   to replace with meaningful oil-product categories.
9. **Unit-factor conversions** — several product names encode pack-size conversions
   (e.g. `(0.8L×24)` = 19.2L) that were not auto-parsed; needs manual review.
10. **`linked_product_id` pairs** — only 2 known so far (found by manual inspection in
    ERD_CHUAN), no systematic way to find more from this data.
11. **M2 (workflow execution history)** and **the transport/vận tải module** — both explicitly
    out of scope for this round, need a separate conversation with the business owner.

## Artifacts produced this conversation (all in outputs, presented via present_files)

- `ERD_Merge_Finalization_Strategy.md`
- `inventory-reconcile-route.ts`
- `import-real-data.ts`

---

## Session update (18/09/2026) — playbook, meeting-note reconciliation, pricing-tier proposal

New ask this pass: build a **project playbook** for a coworker taking over parts of this
work (not a dev-team request — the Database Engineer's own initiative). Produced
`5. Project_Playbook.md` and `5. Project_Playbook_VI.md` (moved 01/11/2026 to
`docs/playbook/`, numbers dropped; Vietnamese
duplicate, same §0–§9 numbering, kept in sync by hand — no tooling enforces it). The
playbook's §2 is a doc map that now indexes this file; read the playbook first for
orientation, come back here for depth. Everything below supersedes/extends specific
points above rather than editing them in place — same convention this file already uses.

**Open item #4 above ("Customer/supplier debt has no schema home") is resolved** —
quietly, sometime between 23/08 and now, outside this file's own knowledge. Migration
`0014_youthful_red_wolf.sql` added `opening_debt numeric(18,2)` to both `suppliers` and
`customers`, plus `code` (nullable, case-insensitive-unique) to both, and
`products.is_reduced_vat` (nullable boolean — Nghị định 174/2025 VAT-reduction flag).
**`import-real-data.ts`'s own header comments still claim no such column exists** — the
script predates `0014` and needs a pass before anyone runs it (it currently skips both
`Công nợ` columns entirely, correct when written, not correct anymore).

**Open item #3 above ("No selling price in any source file") now has an owner
explanation and a concrete feature request**, from a client meeting with chú Quyết
(owner of Hoàng Phát — notes live outside the repo, in the team's shared meeting notes,
`Meeting chú Quyết.md`, since amended with an 18/09 clarification pass done together
with a second meeting attendee):

- Price is deliberately excluded from every export — varies per customer and multiple
  factors, confirmed intentional, not an oversight.
- Feature request: a "Giá áp dụng" selector on sales transactions. Originally noted as 5
  tiers (Bán lẻ / Đại lý cấp 1/2/3 / online) — **tightened on the 18/09 re-check**: only
  **Bán lẻ, Đại lý cấp 1, Đại lý cấp 2** are confirmed live at Hoàng Phát. Cấp 3 and
  online came from a *different* company's ERP demo (`erp.eteksofts.com`, "Tân Phát" —
  where the owner is an employee, not the owner) and may not apply to Hoàng Phát at all.
- **Second correction from the same pass**: the note's "cần có bên đứng trên để duyệt
  giá" (approval-workflow) answer also describes Tân Phát's process, not Hoàng Phát's —
  at Hoàng Phát the owner has no one above him, the accountant enters prices, he just
  monitors. No approval-state schema needed; one open item removed rather than added,
  for once.
- Proposed (explicitly an open proposal, not implemented, pending sign-off): a
  `price_tiers` lookup table + `product_prices(product_id, tier_id, price)`, instead of
  a hardcoded tier enum — specifically because the tier count is now known to be
  uncertain (3 confirmed, 2 speculative) and adding a tier later needs to be a data
  insert, not a migration. Remaining open questions (does `products.price` stay as a
  fallback, effective-dating for "sửa liên tục" prices, purchase-side lẻ/sỉ tiers, and
  whether "khách ruột vs khách lạ" is the same axis as the 5 tiers or something else the
  AI team's long-term-vs-walk-in idea is meant to cover — genuinely unresolved on both
  sides) are written up in the playbook §6, not duplicated here.

**New footgun found, unrelated to schema**: this checkout's working tree accumulates
CRLF/LF line-ending noise on any file touched by the editor. Spot-checked ~10 files
`git status` reported modified (`schema.ts`, `package.json`, migrations,
`import-real-data.ts` itself) — every one was byte-identical to `HEAD` once line endings
were stripped. **Don't trust `git status`'s modified count as a signal of real change on
this checkout without checking.** A `.gitattributes` fix is proposed but not yet added
(playbook §5 item 8, §9 item 5) — the Brain team hit the identical problem independently.

**Addendum, same day**: asked whether `import-real-data.ts` can just be deleted now that
the new "Nhap Excel" feature exists. Checked — it's a partial supersede, not a full one.
The new feature (`src/server/import/doc-excel.ts` + `ap-dung.ts`) replaces the
products/customers/suppliers catalog-loading part of this script, and does it better
(handles `openingDebt`/`isReducedVat` correctly, preview-then-confirm UX). It explicitly
does **not** touch the `Tổng hợp tồn kho` (N-X-T) report — own comment says that's left to
Brain's `inventory_import.py` on purpose, to avoid a second copy of "the hardest logic"
drifting apart. `import-real-data.ts` remains the only code here that reconstructs
`inventory_transactions` from N-X-T data, links `linked_product_id` pairs, and flags
`allows_zero_value`. Asked whether Brain now also *writes* that reconciled data into this
app's Postgres DB somewhere — **team wasn't sure, still needs checking**. Verdict: **don't
delete yet**; and since the file is untracked, deleting it wouldn't be git-reversible —
commit it first if it does get deleted, so it's at least recoverable from history.