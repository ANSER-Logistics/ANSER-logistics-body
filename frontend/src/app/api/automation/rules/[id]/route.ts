import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/session";
import { activateN8nWorkflow, deactivateN8nWorkflow } from "@/server/n8nApi";
import { deleteRule, getRule, updateRule } from "@/server/store/automation";
import { listWarehouses } from "@/server/store/warehouses";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (body.warehouseId) {
    const validWarehouses = await listWarehouses();
    if (!validWarehouses.some((w) => w.id === body.warehouseId)) {
      return NextResponse.json({ message: "Kho không hợp lệ." }, { status: 400 });
    }
  }

  const existing = await getRule(id);
  if (!existing) {
    return NextResponse.json({ message: "Không tìm thấy quy tắc." }, { status: 404 });
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
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "Không gọi được n8n." },
        { status: 502 },
      );
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
  if (body.thresholdQty !== undefined) patch.thresholdQty = Number(body.thresholdQty);
  if (body.categoryId !== undefined) patch.categoryId = body.categoryId || null;
  if (body.warehouseId !== undefined) patch.warehouseId = body.warehouseId || null;
  if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
  if (body.n8nWorkflowId !== undefined) patch.n8nWorkflowId = body.n8nWorkflowId || null;

  const rule = await updateRule(id, patch);
  if (!rule) {
    return NextResponse.json({ message: "Không tìm thấy quy tắc." }, { status: 404 });
  }
  return NextResponse.json({ rule });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  await deleteRule(id);
  return new NextResponse(null, { status: 204 });
}
