import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireAdminUser } from "@/server/session";
import { activateN8nWorkflow, deactivateN8nWorkflow } from "@/server/n8nApi";
import { deleteRule, getRule, updateRule } from "@/server/store/automation";
import { listWarehouses } from "@/server/store/warehouses";
import { nullableText, numberLike, parseJsonBody, requiredText } from "@/server/validation";

const patchRuleSchema = z.object({
  name: requiredText("Tên quy tắc không được để trống.").optional(),
  thresholdQty: numberLike("Ngưỡng tồn kho không hợp lệ.")
    .pipe(z.number().min(0, "Ngưỡng tồn kho không hợp lệ."))
    .optional(),
  categoryId: nullableText("Danh mục"),
  warehouseId: nullableText("Kho"),
  enabled: z.boolean({ error: "Trạng thái quy tắc không hợp lệ." }).optional(),
  n8nWorkflowId: nullableText("Workflow n8n"),
});

export const PATCH = withErrorHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  const { data: body, response: invalid } = await parseJsonBody(request, patchRuleSchema);
  if (invalid) return invalid;

  if (body.warehouseId) {
    const validWarehouses = await listWarehouses();
    if (!validWarehouses.some((w) => w.id === body.warehouseId)) {
      return jsonError("Kho không hợp lệ.", 400);
    }
  }

  const existing = await getRule(id);
  if (!existing) {
    return jsonError("Không tìm thấy quy tắc.", 404);
  }

  // Rule đang liên kết với 1 workflow n8n thật (n8nWorkflowId đã được dán vào) — bật/tắt ở đây
  // phải gọi n8n API để bật/tắt workflow THẬT, không chỉ đổi cờ trong DB của app. Nếu gọi n8n
  // lỗi, dừng lại luôn — không cập nhật DB — để tránh 2 nơi lệch trạng thái nhau.
  const linkedWorkflowId = body.n8nWorkflowId !== undefined ? body.n8nWorkflowId || null : existing.n8nWorkflowId;
  if (body.enabled !== undefined && linkedWorkflowId) {
    try {
      if (body.enabled) await activateN8nWorkflow(linkedWorkflowId);
      else await deactivateN8nWorkflow(linkedWorkflowId);
    } catch (error) {
      console.error("[api] Không thể cập nhật trạng thái workflow n8n:", error);
      return jsonError("Không thể cập nhật trạng thái workflow n8n. Vui lòng kiểm tra cấu hình.", 502);
    }
  }

  const patch: Partial<{
    name: string;
    thresholdQty: number;
    categoryId: string | null;
    warehouseId: string | null;
    enabled: boolean;
    n8nWorkflowId: string | null;
  }> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.thresholdQty !== undefined) patch.thresholdQty = body.thresholdQty;
  if (body.categoryId !== undefined) patch.categoryId = body.categoryId;
  if (body.warehouseId !== undefined) patch.warehouseId = body.warehouseId;
  if (body.enabled !== undefined) patch.enabled = body.enabled;
  if (body.n8nWorkflowId !== undefined) patch.n8nWorkflowId = body.n8nWorkflowId;

  const rule = await updateRule(id, patch);
  if (!rule) {
    return jsonError("Không tìm thấy quy tắc.", 404);
  }
  return NextResponse.json({ rule });
});

export const DELETE = withErrorHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  await deleteRule(id);
  return new NextResponse(null, { status: 204 });
});
