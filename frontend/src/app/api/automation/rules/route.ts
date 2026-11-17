import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireAdminUser, requireSessionUser } from "@/server/session";
import { createRule, listRules } from "@/server/store/automation";
import { listWarehouses } from "@/server/store/warehouses";
import { numberLike, optionalText, parseJsonBody, requiredText } from "@/server/validation";

const RULE_TYPES = ["low_stock_alert", "sales_report", "customer_welcome"] as const;
const createRuleSchema = z.object({
  name: requiredText("Thiếu tên quy tắc."),
  type: z.enum(RULE_TYPES, { error: "Loại quy tắc không hợp lệ." }).optional(),
  thresholdQty: numberLike("Ngưỡng tồn kho không hợp lệ.")
    .pipe(z.number().min(0, "Ngưỡng tồn kho không hợp lệ."))
    .optional(),
  categoryId: optionalText("Danh mục"),
  warehouseId: optionalText("Kho"),
  enabled: z.boolean({ error: "Trạng thái quy tắc không hợp lệ." }).optional(),
});

export const GET = withErrorHandler(async () => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const rules = await listRules();
  return NextResponse.json({ rules });
});

export const POST = withErrorHandler(async (request: Request) => {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { data, response: invalid } = await parseJsonBody(request, createRuleSchema);
  if (invalid) return invalid;
  const { name, type, thresholdQty, categoryId, warehouseId, enabled } = data;
  if (warehouseId) {
    const validWarehouses = await listWarehouses();
    if (!validWarehouses.some((w) => w.id === warehouseId)) {
      return jsonError("Kho không hợp lệ.", 400);
    }
  }
  const rule = await createRule({
    name,
    type,
    thresholdQty,
    categoryId: categoryId || undefined,
    warehouseId: warehouseId || undefined,
    enabled: enabled ?? true,
  });
  return NextResponse.json({ rule }, { status: 201 });
});
