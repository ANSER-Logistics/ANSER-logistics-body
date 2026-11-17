import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", () => import("@test/db"));

import { db, resetDb } from "@test/db";
import { automationRules, categories, products, warehouses } from "@/server/db/schema";
import { LOW_STOCK_THRESHOLD } from "@/server/store/products";
import { createRule, deleteRule, evaluateAlerts, getRule, listRules, updateRule } from "@/server/store/automation";

beforeEach(resetDb);

async function warehouse(name: string) {
  const [w] = await db.insert(warehouses).values({ name }).returning();
  return w;
}

async function category(name: string) {
  const [c] = await db.insert(categories).values({ name }).returning();
  return c;
}

async function product(code: string, stock: number, warehouseId: string, categoryId: string | null = null) {
  const [p] = await db
    .insert(products)
    .values({ code, name: `Hàng ${code}`, stock, warehouseId, categoryId })
    .returning();
  return p;
}

describe("createRule", () => {
  it("mặc định là rule tồn kho thấp, ngưỡng LOW_STOCK_THRESHOLD, đang bật, áp cho mọi kho", async () => {
    const rule = await createRule({ name: "Cảnh báo chung" });

    expect(rule).toMatchObject({
      name: "Cảnh báo chung",
      type: "low_stock_alert",
      thresholdQty: LOW_STOCK_THRESHOLD,
      enabled: true,
      categoryId: null,
      warehouseId: null,
      n8nWorkflowId: null,
    });
    expect(await getRule(rule.id)).toEqual(rule);
  });

  it("giữ nguyên ngưỡng 0 và ngưỡng lẻ, không thay bằng mặc định", async () => {
    expect((await createRule({ name: "Ngưỡng 0", thresholdQty: 0 })).thresholdQty).toBe(0);
    expect((await createRule({ name: "Ngưỡng lẻ", thresholdQty: 12.5 })).thresholdQty).toBe(12.5);
  });

  it("rule không phải tồn kho thì bỏ ngưỡng (null) dù có truyền vào", async () => {
    const rule = await createRule({
      name: "Báo cáo doanh số",
      type: "sales_report",
      thresholdQty: 5,
      enabled: false,
      n8nWorkflowId: "wf-123",
    });

    expect(rule).toMatchObject({ type: "sales_report", thresholdQty: null, enabled: false, n8nWorkflowId: "wf-123" });
  });

  it("lưu kho và danh mục được chọn", async () => {
    const w = await warehouse("Kho Hà Nội");
    const c = await category("Dầu nhớt");

    const rule = await createRule({ name: "Dầu nhớt HN", warehouseId: w.id, categoryId: c.id });

    expect(rule).toMatchObject({ warehouseId: w.id, categoryId: c.id });
  });
});

describe("updateRule / getRule / deleteRule", () => {
  it("chỉ đổi các trường có trong patch, có thể xoá kho/danh mục về null", async () => {
    const w = await warehouse("Kho 1");
    const c = await category("Phụ liệu");
    const rule = await createRule({ name: "Phụ liệu kho 1", thresholdQty: 8, warehouseId: w.id, categoryId: c.id });

    const disabled = await updateRule(rule.id, { enabled: false });
    expect(disabled).toMatchObject({
      enabled: false,
      name: "Phụ liệu kho 1",
      thresholdQty: 8,
      warehouseId: w.id,
      categoryId: c.id,
    });

    const cleared = await updateRule(rule.id, {
      name: "Toàn bộ",
      thresholdQty: 3,
      warehouseId: null,
      categoryId: null,
      n8nWorkflowId: "wf-9",
    });
    expect(cleared).toMatchObject({
      name: "Toàn bộ",
      thresholdQty: 3,
      warehouseId: null,
      categoryId: null,
      n8nWorkflowId: "wf-9",
      enabled: false,
    });
    expect(await getRule(rule.id)).toEqual(cleared);
  });

  it("id không tồn tại: getRule và updateRule trả undefined", async () => {
    const missing = randomUUID();
    expect(await getRule(missing)).toBeUndefined();
    expect(await updateRule(missing, { enabled: false })).toBeUndefined();
  });

  it.todo(
    "BUG: updateRule(id, {}) ném 'No values to set' (drizzle .set({})) thay vì trả rule không đổi — PATCH /api/automation/rules/[id] với body {} trả 500",
  );

  it("deleteRule chỉ xoá đúng rule đó", async () => {
    const keep = await createRule({ name: "Giữ lại" });
    const drop = await createRule({ name: "Xoá đi" });

    await deleteRule(drop.id);

    expect(await getRule(drop.id)).toBeUndefined();
    expect((await listRules()).map((r) => r.id)).toEqual([keep.id]);
  });
});

describe("listRules", () => {
  it("xếp rule mới tạo lên trước", async () => {
    await db.insert(automationRules).values([
      { name: "Cũ nhất", createdAt: new Date("2026-01-01T00:00:00Z") },
      { name: "Mới nhất", createdAt: new Date("2026-03-01T00:00:00Z") },
      { name: "Giữa", createdAt: new Date("2026-02-01T00:00:00Z") },
    ]);

    expect((await listRules()).map((r) => r.name)).toEqual(["Mới nhất", "Giữa", "Cũ nhất"]);
  });

  it("lọc theo kho: giữ rule chung (không gắn kho) và rule của các kho được chọn", async () => {
    const w1 = await warehouse("Kho 1");
    const w2 = await warehouse("Kho 2");
    const w3 = await warehouse("Kho 3");
    await createRule({ name: "Chung" });
    await createRule({ name: "Kho 1", warehouseId: w1.id });
    await createRule({ name: "Kho 2", warehouseId: w2.id });
    await createRule({ name: "Kho 3", warehouseId: w3.id });

    const names = async (ids?: string[]) => (await listRules(ids)).map((r) => r.name).sort();

    expect(await names()).toEqual(["Chung", "Kho 1", "Kho 2", "Kho 3"]);
    expect(await names([w1.id, w3.id])).toEqual(["Chung", "Kho 1", "Kho 3"]);
    expect(await names([])).toEqual(["Chung"]);
  });
});

describe("evaluateAlerts", () => {
  it("chỉ cảnh báo hàng tồn DƯỚI ngưỡng (bằng ngưỡng thì không), kể cả tồn lẻ và tồn âm", async () => {
    const w = await warehouse("Kho 1");
    const rule = await createRule({ name: "Ngưỡng 10", thresholdQty: 10 });
    const low = await product("SP-001", 9.5, w.id);
    await product("SP-002", 10, w.id);
    await product("SP-003", 0, w.id);
    await product("SP-004", -2, w.id);
    await product("SP-005", 500, w.id);

    const alerts = await evaluateAlerts();

    expect(alerts.map((a) => a.productCode)).toEqual(["SP-001", "SP-003", "SP-004"]);
    expect(alerts[0]).toEqual({
      ruleId: rule.id,
      ruleName: "Ngưỡng 10",
      productId: low.id,
      productCode: "SP-001",
      productName: "Hàng SP-001",
      stock: 9.5,
      thresholdQty: 10,
    });
  });

  it("bỏ qua rule đang tắt và rule không phải low_stock_alert", async () => {
    const w = await warehouse("Kho 1");
    await product("SP-001", 0, w.id);
    await createRule({ name: "Đang tắt", enabled: false });
    await createRule({ name: "Báo cáo", type: "sales_report" });

    expect(await evaluateAlerts()).toEqual([]);
  });

  it("rule có ngưỡng NULL dùng LOW_STOCK_THRESHOLD", async () => {
    const w = await warehouse("Kho 1");
    await db.insert(automationRules).values({ name: "Không ngưỡng", type: "low_stock_alert", thresholdQty: null });
    await product("SP-001", LOW_STOCK_THRESHOLD - 1, w.id);
    await product("SP-002", LOW_STOCK_THRESHOLD, w.id);

    const alerts = await evaluateAlerts();

    expect(alerts.map((a) => [a.productCode, a.thresholdQty])).toEqual([["SP-001", LOW_STOCK_THRESHOLD]]);
  });

  it("rule có ngưỡng 0 không cảnh báo hàng tồn 0", async () => {
    const w = await warehouse("Kho 1");
    await createRule({ name: "Ngưỡng 0", thresholdQty: 0 });
    await product("SP-001", 0, w.id);
    await product("SP-002", -1, w.id);

    expect((await evaluateAlerts()).map((a) => a.productCode)).toEqual(["SP-002"]);
  });

  it("rule theo danh mục chỉ khớp hàng thuộc đúng danh mục đó; rule không gắn danh mục khớp mọi danh mục", async () => {
    const w = await warehouse("Kho 1");
    const oil = await category("Dầu nhớt");
    const parts = await category("Phụ tùng");
    const oilRule = await createRule({ name: "Dầu nhớt", categoryId: oil.id });
    const general = await createRule({ name: "Chung" });
    await product("SP-001", 1, w.id, oil.id);
    await product("SP-002", 1, w.id, parts.id);
    await product("SP-003", 1, w.id, null);

    const pairs = (await evaluateAlerts()).map((a) => [a.ruleId, a.productCode]);

    expect(pairs).toHaveLength(4);
    expect(pairs).toEqual(
      expect.arrayContaining([
        [oilRule.id, "SP-001"],
        [general.id, "SP-001"],
        [general.id, "SP-002"],
        [general.id, "SP-003"],
      ]),
    );
  });

  it("rule gắn cả kho lẫn danh mục chỉ khớp hàng thoả cả hai", async () => {
    const w1 = await warehouse("Kho 1");
    const w2 = await warehouse("Kho 2");
    const oil = await category("Dầu nhớt");
    const parts = await category("Phụ tùng");
    await createRule({ name: "Dầu nhớt kho 1", warehouseId: w1.id, categoryId: oil.id });
    await product("SP-001", 1, w1.id, oil.id);
    await product("SP-002", 1, w2.id, oil.id);
    await product("SP-003", 1, w1.id, parts.id);

    expect((await evaluateAlerts()).map((a) => a.productCode)).toEqual(["SP-001"]);
  });

  it("rule gắn kho chỉ khớp hàng trong kho đó", async () => {
    const w1 = await warehouse("Kho 1");
    const w2 = await warehouse("Kho 2");
    await createRule({ name: "Riêng kho 1", warehouseId: w1.id });
    await product("SP-001", 1, w1.id);
    await product("SP-002", 1, w2.id);

    expect((await evaluateAlerts()).map((a) => a.productCode)).toEqual(["SP-001"]);
  });

  it("lọc warehouseIds: chỉ xét hàng trong các kho được chọn", async () => {
    const w1 = await warehouse("Kho 1");
    const w2 = await warehouse("Kho 2");
    await createRule({ name: "Chung" });
    await product("SP-001", 1, w1.id);
    await product("SP-002", 1, w2.id);

    expect((await evaluateAlerts([w1.id])).map((a) => a.productCode)).toEqual(["SP-001"]);
    expect(await evaluateAlerts([])).toEqual([]);
  });

  it("mỗi rule khớp sinh một cảnh báo riêng, mang ngưỡng của chính rule đó", async () => {
    const w = await warehouse("Kho 1");
    const strict = await createRule({ name: "Ngưỡng 10", thresholdQty: 10 });
    const loose = await createRule({ name: "Ngưỡng 50", thresholdQty: 50 });
    await product("SP-001", 5, w.id);
    await product("SP-002", 30, w.id);

    const alerts = (await evaluateAlerts()).map((a) => [a.ruleId, a.productCode, a.thresholdQty]);

    expect(alerts).toHaveLength(3);
    expect(alerts).toEqual(
      expect.arrayContaining([
        [strict.id, "SP-001", 10],
        [loose.id, "SP-001", 50],
        [loose.id, "SP-002", 50],
      ]),
    );
  });
});
