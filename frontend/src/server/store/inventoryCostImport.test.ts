import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", () => import("@/test/db"));

import { eq } from "drizzle-orm";
import { db, resetDb } from "@/test/db";
import { products, warehouses } from "@/server/db/schema";
import { applyCostImport, costCoverage, previewCostImport, type UnitCostRow } from "./inventoryCostImport";

beforeEach(resetDb);

const row = (code: string, unit_cost: number): UnitCostRow => ({
  code,
  name: "",
  unit: "Lít",
  unit_cost,
  source: "tồn cuối",
});

async function addWarehouse(name: string) {
  const [w] = await db.insert(warehouses).values({ name }).returning();
  return w.id;
}

async function addProduct(warehouseId: string, code: string, cost: number | null, updatedAt?: Date) {
  const [p] = await db
    .insert(products)
    .values({ code, name: `Hàng ${code}`, warehouseId, cost, ...(updatedAt && { updatedAt }) })
    .returning();
  return p;
}

const costOf = async (id: string) =>
  (await db.select({ cost: products.cost }).from(products).where(eq(products.id, id)))[0].cost;

describe("previewCostImport", () => {
  it("đối chiếu với danh mục trong DB mà không ghi gì", async () => {
    const wh = await addWarehouse("Kho chính");
    const a = await addProduct(wh, "KM01", null);
    const b = await addProduct(wh, "KM02", 9_000);
    await addProduct(wh, "KM03", null);

    const preview = await previewCostImport([row("KM01", 10_000), row("KM02", 12_000), row("XX", 1)]);

    expect(preview.matches.map((m) => [m.productId, m.newCost, m.wouldOverwrite])).toEqual([
      [a.id, 10_000, false],
      [b.id, 12_000, true],
    ]);
    expect(preview.stillMissing).toEqual([{ code: "KM03", name: "Hàng KM03" }]);
    expect(preview.counts.unmatched).toBe(1);
    expect(await costOf(a.id)).toBeNull();
    expect(await costOf(b.id)).toBe(9_000);
  });
});

describe("applyCostImport", () => {
  it("mặc định chỉ điền chỗ trống, không đè giá vốn đã có", async () => {
    const wh = await addWarehouse("Kho chính");
    const empty = await addProduct(wh, "KM01", null);
    const known = await addProduct(wh, "KM02", 9_000);

    // "XX" không khớp: skipped chỉ đếm dòng khớp mà không ghi, không đếm dòng lạ.
    const result = await applyCostImport([row("KM01", 10_000), row("KM02", 12_000), row("XX", 1)]);

    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.applied.map((m) => [m.productId, m.newCost])).toEqual([[empty.id, 10_000]]);
    expect(await costOf(empty.id)).toBe(10_000);
    expect(await costOf(known.id)).toBe(9_000);
  });

  it("overwrite: true thì ghi đè cả giá vốn đã có", async () => {
    const wh = await addWarehouse("Kho chính");
    const empty = await addProduct(wh, "KM01", null);
    const known = await addProduct(wh, "KM02", 9_000);

    const result = await applyCostImport([row("KM01", 10_000), row("KM02", 12_000)], { overwrite: true });

    expect(result).toMatchObject({ updated: 2, skipped: 0 });
    expect(await costOf(empty.id)).toBe(10_000);
    expect(await costOf(known.id)).toBe(12_000);
  });

  it("productIds chỉ áp dụng cho các dòng người dùng chọn", async () => {
    const wh = await addWarehouse("Kho chính");
    const a = await addProduct(wh, "KM01", null);
    const b = await addProduct(wh, "KM02", null);
    const c = await addProduct(wh, "KM03", 5_000);

    const result = await applyCostImport([row("KM01", 1_000), row("KM02", 2_000), row("KM03", 3_000)], {
      productIds: [b.id, c.id],
    });

    // c được chọn nhưng đã có giá vốn và không bật overwrite → vẫn bỏ qua.
    expect(result).toMatchObject({ updated: 1, skipped: 2 });
    expect(result.applied.map((m) => m.productId)).toEqual([b.id]);
    expect(await costOf(a.id)).toBeNull();
    expect(await costOf(b.id)).toBe(2_000);
    expect(await costOf(c.id)).toBe(5_000);
  });

  it("overwrite kèm productIds chỉ ghi đè mặt hàng được chọn", async () => {
    const wh = await addWarehouse("Kho chính");
    const a = await addProduct(wh, "KM01", 1_000);
    const b = await addProduct(wh, "KM02", 2_000);

    const result = await applyCostImport([row("KM01", 5_000), row("KM02", 6_000)], {
      overwrite: true,
      productIds: [a.id],
    });

    expect(result).toMatchObject({ updated: 1, skipped: 1 });
    expect(await costOf(a.id)).toBe(5_000);
    expect(await costOf(b.id)).toBe(2_000);
  });

  it("productIds rỗng (người dùng không chọn dòng nào) thì không ghi gì", async () => {
    const wh = await addWarehouse("Kho chính");
    const a = await addProduct(wh, "KM01", null);

    expect(await applyCostImport([row("KM01", 1_000)], { productIds: [] })).toEqual({
      updated: 0,
      skipped: 1,
      applied: [],
    });
    expect(await costOf(a.id)).toBeNull();
  });

  it("không có gì để ghi thì trả về 0 và để nguyên DB", async () => {
    const wh = await addWarehouse("Kho chính");
    const known = await addProduct(wh, "KM01", 9_000);

    expect(await applyCostImport([row("KM01", 12_000), row("XX", 1)])).toEqual({
      updated: 0,
      skipped: 1,
      applied: [],
    });
    expect(await costOf(known.id)).toBe(9_000);
  });

  it("cập nhật updatedAt của mặt hàng được ghi, không đụng mặt hàng khác", async () => {
    const wh = await addWarehouse("Kho chính");
    const old = new Date("2020-01-01T00:00:00Z");
    const touched = await addProduct(wh, "KM01", null, old);
    const untouched = await addProduct(wh, "KM02", null, old);

    await applyCostImport([row("KM01", 1_000)]);

    const rows = await db.select().from(products);
    const byId = Object.fromEntries(rows.map((p) => [p.id, p]));
    expect(byId[touched.id].updatedAt.getTime()).toBeGreaterThan(old.getTime());
    expect(byId[untouched.id].updatedAt.getTime()).toBe(old.getTime());
  });

  it("một dòng hỏng thì cả lô không ghi gì (một transaction)", async () => {
    const wh = await addWarehouse("Kho chính");
    const a = await addProduct(wh, "KM01", null);
    await addProduct(wh, "KM02", null);

    // 3 tỷ vượt kiểu integer của cột cost → lệnh UPDATE thứ hai (KM02) lỗi, sau khi KM01 đã ghi.
    // 22003 = numeric_value_out_of_range của Postgres.
    await expect(applyCostImport([row("KM01", 1_000), row("KM02", 3_000_000_000)])).rejects.toMatchObject({
      cause: { code: "22003" },
    });
    expect(await costOf(a.id)).toBeNull();
  });
});

describe("costCoverage", () => {
  it("không có mặt hàng nào thì 0%, không chia cho 0", async () => {
    expect(await costCoverage()).toEqual({ total: 0, withCost: 0, pct: 0 });
  });

  it("đếm giá vốn 0 là đã có, null là chưa có", async () => {
    const wh = await addWarehouse("Kho chính");
    await addProduct(wh, "KM01", 0);
    await addProduct(wh, "KM02", 12_000);
    await addProduct(wh, "KM03", null);
    await addProduct(wh, "KM04", null);

    expect(await costCoverage()).toEqual({ total: 4, withCost: 2, pct: 50 });
  });

  it("lọc theo kho khi truyền warehouseIds", async () => {
    const main = await addWarehouse("Kho chính");
    const promo = await addWarehouse("Kho khuyến mại");
    const other = await addWarehouse("Kho phụ");
    await addProduct(main, "KM01", 1_000);
    await addProduct(main, "KM02", null);
    await addProduct(main, "KM03", null);
    await addProduct(promo, "VT01", null);
    await addProduct(other, "PH01", 7);

    const onlyMain = await costCoverage([main]);
    expect(onlyMain).toMatchObject({ total: 3, withCost: 1 });
    expect(onlyMain.pct).toBeCloseTo(100 / 3);
    expect(await costCoverage([main, promo])).toEqual({ total: 4, withCost: 1, pct: 25 });
    expect(await costCoverage()).toMatchObject({ total: 5, withCost: 2 });
  });
});
