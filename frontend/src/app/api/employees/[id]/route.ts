import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireAdmin } from "@/server/session";
import { deleteEmployee, updateEmployee } from "@/server/store/employees";
import { listWarehouses } from "@/server/store/warehouses";
import { nullableDate, nullableEmail, nullablePhone, nullableText, parseJsonBody, requiredText } from "@/server/validation";

const patchEmployeeSchema = z.object({
  name: requiredText("Tên nhân viên không được để trống.").optional(),
  position: nullableText("Chức vụ"),
  phone: nullablePhone(),
  email: nullableEmail(),
  hireDate: nullableDate("Ngày vào làm không hợp lệ."),
  warehouseId: nullableText("Kho"),
  note: nullableText("Ghi chú"),
});

export const PATCH = withErrorHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  if (!admin) {
    return jsonError("Không có quyền truy cập.", 403);
  }

  const { id } = await params;
  const { data: body, response: invalid } = await parseJsonBody(request, patchEmployeeSchema);
  if (invalid) return invalid;
  if (body.warehouseId) {
    const validWarehouses = await listWarehouses();
    if (!validWarehouses.some((w) => w.id === body.warehouseId)) {
      return jsonError("Kho không hợp lệ.", 400);
    }
  }

  const patch: Partial<{
    name: string;
    position: string | null;
    phone: string | null;
    email: string | null;
    hireDate: Date | null;
    warehouseId: string | null;
    note: string | null;
  }> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.position !== undefined) patch.position = body.position || null;
  if (body.phone !== undefined) patch.phone = body.phone || null;
  if (body.email !== undefined) patch.email = body.email || null;
  if (body.hireDate !== undefined) patch.hireDate = body.hireDate ? new Date(body.hireDate) : null;
  if (body.warehouseId !== undefined) patch.warehouseId = body.warehouseId || null;
  if (body.note !== undefined) patch.note = body.note || null;

  const employee = await updateEmployee(id, patch);
  if (!employee) {
    return jsonError("Không tìm thấy nhân viên.", 404);
  }
  return NextResponse.json({ employee });
});

export const DELETE = withErrorHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  if (!admin) {
    return jsonError("Không có quyền truy cập.", 403);
  }
  const { id } = await params;
  await deleteEmployee(id);
  return new NextResponse(null, { status: 204 });
});
