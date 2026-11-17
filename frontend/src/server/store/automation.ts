import { desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/server/db/client";
import { automationRules } from "@/server/db/schema";
import { listProducts, LOW_STOCK_THRESHOLD } from "@/server/store/products";

export type AutomationRule = typeof automationRules.$inferSelect;

export async function listRules(warehouseIds?: string[]) {
  return db
    .select()
    .from(automationRules)
    .where(
      warehouseIds
        ? or(isNull(automationRules.warehouseId), inArray(automationRules.warehouseId, warehouseIds))
        : undefined,
    )
    .orderBy(desc(automationRules.createdAt));
}

export async function createRule(input: {
  name: string;
  type?: string;
  thresholdQty?: number;
  categoryId?: string | null;
  warehouseId?: string;
  enabled?: boolean;
  n8nWorkflowId?: string;
}) {
  const type = input.type ?? "low_stock_alert";
  const rows = await db
    .insert(automationRules)
    .values({
      name: input.name,
      type,
      // Ngưỡng/danh mục chỉ có ý nghĩa với rule tồn kho — các loại khác (báo cáo doanh số,
      // chào khách hàng mới) chỉ là dòng đánh dấu "đã triển khai qua n8n", không dùng threshold.
      thresholdQty: type === "low_stock_alert" ? (input.thresholdQty ?? LOW_STOCK_THRESHOLD) : null,
      categoryId: input.categoryId ?? null,
      warehouseId: input.warehouseId,
      enabled: input.enabled ?? true,
      n8nWorkflowId: input.n8nWorkflowId,
    })
    .returning();
  return rows[0];
}

export async function updateRule(
  id: string,
  patch: Partial<{
    name: string;
    thresholdQty: number;
    categoryId: string | null;
    warehouseId: string | null;
    enabled: boolean;
    n8nWorkflowId: string | null;
  }>,
) {
  const rows = await db.update(automationRules).set(patch).where(eq(automationRules.id, id)).returning();
  return rows[0];
}

export async function getRule(id: string) {
  const rows = await db.select().from(automationRules).where(eq(automationRules.id, id));
  return rows[0];
}

export async function deleteRule(id: string) {
  await db.delete(automationRules).where(eq(automationRules.id, id));
}

export type AutomationAlert = {
  ruleId: string;
  ruleName: string;
  productId: string;
  productCode: string;
  productName: string;
  stock: number;
  thresholdQty: number;
};

export async function evaluateAlerts(warehouseIds?: string[]): Promise<AutomationAlert[]> {
  const rules = (await listRules(warehouseIds)).filter((rule) => rule.enabled && rule.type === "low_stock_alert");
  if (rules.length === 0) return [];

  const products = await listProducts({ warehouseIds });
  const alerts: AutomationAlert[] = [];

  for (const rule of rules) {
    const threshold = rule.thresholdQty ?? LOW_STOCK_THRESHOLD;
    const matching = products.filter(
      (product) =>
        product.stock < threshold &&
        (!rule.categoryId || product.categoryId === rule.categoryId) &&
        (!rule.warehouseId || product.warehouseId === rule.warehouseId),
    );
    for (const product of matching) {
      alerts.push({
        ruleId: rule.id,
        ruleName: rule.name,
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        stock: product.stock,
        thresholdQty: threshold,
      });
    }
  }

  return alerts;
}
