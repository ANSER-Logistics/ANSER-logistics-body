import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireAdmin } from "@/server/session";
import { createEmployee, listEmployees } from "@/server/store/employees";
import { listWarehouses } from "@/server/store/warehouses";
import { optionalEmail, optionalPhone, optionalText, parseJsonBody, requiredText } from "@/server/validation";

const createEmployeeSchema = z.object({
  name: requiredText("Thiếu tên nhân viên."),
  position: optionalText("Chức vụ"),
  phone: optionalPhone(),
  email: optionalEmail(),
  hireDate: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.date({ error: "Ngày vào làm không hợp lệ." }).optional(),
  ),
  warehouseId: optionalText("Kho"),
  note: optionalText("Ghi chú"),
});

export const GET = withErrorHandler(async () => {
  const admin = await requireAdmin();
  if (!admin) {
    return jsonError("Không có quyền truy cập.", 403);
  }
  const employees = await listEmployees();
  return NextResponse.json({ employees });
});

export const POST = withErrorHandler(async (request: Request) => {
  const admin = await requireAdmin();
  if (!admin) {
    return jsonError("Không có quyền truy cập.", 403);
  }

  const { data: body, response: invalid } = await parseJsonBody(request, createEmployeeSchema);
  if (invalid) return invalid;
  if (body.warehouseId) {
    const validWarehouses = await listWarehouses();
    if (!validWarehouses.some((w) => w.id === body.warehouseId)) {
      return jsonError("Kho không hợp lệ.", 400);
    }
  }

  const employee = await createEmployee({
    ...body,
  });
  return NextResponse.json({ employee }, { status: 201 });
});
