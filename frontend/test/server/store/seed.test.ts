import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", () => import("@test/db"));

import { db, resetDb } from "@test/db";
import {
  automationRules,
  categories,
  companySettings,
  inventoryTransactions,
  products,
  users,
  warehouses,
} from "@/server/db/schema";
import { DEFAULT_CATEGORIES, seedCategories } from "@/server/store/categories";
import { listProducts, LOW_STOCK_THRESHOLD } from "@/server/store/products";
import { DEMO_ACCOUNT } from "@/server/store/users";
import { ensureDefaultWarehouseAndBackfill, runStartupSeed, seedInitialData } from "@/server/store/seed";

beforeEach(resetDb);

async function tableCounts() {
  return {
    users: await db.$count(users),
    warehouses: await db.$count(warehouses),
    categories: await db.$count(categories),
    products: await db.$count(products),
    inventoryTransactions: await db.$count(inventoryTransactions),
    automationRules: await db.$count(automationRules),
    companySettings: await db.$count(companySettings),
  };
}

/** Một DB "thật" đã có hàng từ trước — chưa có danh mục, chưa có rule. */
async function existingRealData() {
  const [w] = await db.insert(warehouses).values({ name: "Kho Hoàng Phát" }).returning();
  await db.insert(products).values({ code: "VT00001", name: "Dầu nhớt 10W-40", stock: 12, warehouseId: w.id });
  return w;
}

describe("ensureDefaultWarehouseAndBackfill", () => {
  it("DB trống: tạo đúng một kho 'Kho 1' và trả id của nó; gọi lại không tạo thêm", async () => {
    const id = await ensureDefaultWarehouseAndBackfill();

    const all = await db.select().from(warehouses);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id, name: "Kho 1" });

    expect(await ensureDefaultWarehouseAndBackfill()).toBe(id);
    expect(await db.$count(warehouses)).toBe(1);
  });

  it("đã có kho: không tạo kho mới, trả kho đứng đầu theo tên", async () => {
    await db.insert(warehouses).values([{ name: "Kho Sài Gòn" }, { name: "Kho Hà Nội" }]);

    const id = await ensureDefaultWarehouseAndBackfill();

    const all = await db.select().from(warehouses);
    expect(all).toHaveLength(2);
    // "đứng đầu" theo thứ tự ORDER BY name của listWarehouses (warehouses.ts)
    expect(all.find((w) => w.id === id)?.name).toBe("Kho Hà Nội");
  });
});

describe("seedInitialData", () => {
  it("DB trống: tạo hàng mẫu trong kho mặc định, gắn đúng danh mục, phiếu nhập số dương và một rule cảnh báo chung", async () => {
    await seedCategories();

    await seedInitialData();

    const [onlyWarehouse, ...extra] = await db.select().from(warehouses);
    expect(extra).toEqual([]);

    const seeded = await listProducts();
    expect(Object.fromEntries(seeded.map((p) => [p.code, p.category]))).toEqual({
      "SP-001": "Thành phẩm",
      "SP-014": "Bán thành phẩm",
      "SP-027": "Nguyên vật liệu",
      "SP-033": "Phụ liệu",
      "SP-041": "Thành phẩm",
    });
    expect(seeded.every((p) => p.warehouseId === onlyWarehouse.id)).toBe(true);
    expect(seeded.find((p) => p.code === "SP-027")).toMatchObject({ name: "Tấm nhôm 5mm", unit: "Tấm", price: 620000 });

    const codeById = new Map(seeded.map((p) => [p.id, p.code]));
    const txs = await db.select().from(inventoryTransactions);
    expect(txs.map((t) => codeById.get(t.productId)).sort()).toEqual(["SP-014", "SP-027", "SP-033", "SP-041"]);
    for (const tx of txs) {
      expect(tx.type).toBe("import");
      expect(tx.quantity).toBeGreaterThan(0);
      expect(tx.counterparty).toBeTruthy();
    }

    const rules = await db.select().from(automationRules);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      name: "Cảnh báo tồn kho thấp",
      type: "low_stock_alert",
      thresholdQty: LOW_STOCK_THRESHOLD,
      enabled: true,
      warehouseId: null,
      categoryId: null,
    });
  });

  it.todo(
    "BUG: hàng mẫu có products.stock lệch SUM(inventory_transactions.quantity) — SP-027 tồn 0 nhưng có phiếu nhập +45, SP-001 tồn 320 mà không có phiếu nào",
  );

  it("chạy lần hai không thay đổi gì", async () => {
    await seedCategories();
    await seedInitialData();
    const before = await tableCounts();
    const productIds = (await db.select({ id: products.id }).from(products)).map((p) => p.id).sort();

    await seedInitialData();

    expect(await tableCounts()).toEqual(before);
    expect((await db.select({ id: products.id }).from(products)).map((p) => p.id).sort()).toEqual(productIds);
  });

  it("chưa có danh mục: hàng mẫu để trống danh mục (null), không tự tạo danh mục", async () => {
    await seedInitialData();

    const rows = await db.select().from(products);
    expect(rows).toHaveLength(5);
    expect(rows.every((p) => p.categoryId === null)).toBe(true);
    expect(await db.$count(categories)).toBe(0);
  });

  it("DB đã có hàng: không thêm hàng mẫu, phiếu kho hay rule", async () => {
    await existingRealData();

    await seedInitialData();

    expect(await tableCounts()).toMatchObject({ products: 1, inventoryTransactions: 0, automationRules: 0 });
  });
});

describe("runStartupSeed", () => {
  it("DB trống: dựng đủ admin demo, kho, danh mục, hàng mẫu, rule, cài đặt công ty — chạy lại không đổi gì", async () => {
    await runStartupSeed();

    const after = await tableCounts();
    expect(after).toEqual({
      users: 1,
      warehouses: 1,
      categories: DEFAULT_CATEGORIES.length,
      products: 5,
      inventoryTransactions: 4,
      automationRules: 1,
      companySettings: 1,
    });
    // danh mục phải có TRƯỚC khi seed hàng mẫu, nếu không hàng mẫu mất danh mục
    expect(Object.fromEntries((await listProducts()).map((p) => [p.code, p.category]))).toEqual({
      "SP-001": "Thành phẩm",
      "SP-014": "Bán thành phẩm",
      "SP-027": "Nguyên vật liệu",
      "SP-033": "Phụ liệu",
      "SP-041": "Thành phẩm",
    });
    const [demo] = await db.select().from(users);
    expect(demo).toMatchObject({ email: DEMO_ACCOUNT.email, role: "admin" });
    const [settings] = await db.select().from(companySettings);

    await runStartupSeed();

    expect(await tableCounts()).toEqual(after);
    expect((await db.select().from(users))[0].passwordHash).toBe(demo.passwordHash);
    expect((await db.select().from(companySettings))[0].id).toBe(settings.id);
  });

  it("DB đã có hàng nhưng chưa có danh mục vẫn được seed danh mục, không thêm hàng mẫu", async () => {
    await existingRealData();

    await runStartupSeed();

    expect(await tableCounts()).toMatchObject({
      warehouses: 1,
      categories: DEFAULT_CATEGORIES.length,
      products: 1,
      inventoryTransactions: 0,
      automationRules: 0,
    });
  });
});
