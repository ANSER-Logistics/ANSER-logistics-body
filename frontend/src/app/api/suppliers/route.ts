import { NextResponse } from "next/server";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireSessionUser } from "@/server/session";
import {
  SupplierCodeTakenError,
  createSupplier,
  createSupplierSchema,
  listSuppliers,
} from "@/server/store/suppliers";
import { parseJsonBody } from "@/server/validation";

// Quyền theo mẫu `api/customers` (bảng gần giống): xem/tạo = đã đăng nhập, sửa/xoá = admin.
export const GET = withErrorHandler(async (request: Request) => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || undefined;
  const suppliers = await listSuppliers(search);
  return NextResponse.json({ suppliers });
});

export const POST = withErrorHandler(async (request: Request) => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const { data, response: invalid } = await parseJsonBody(request, createSupplierSchema);
  if (invalid) return invalid;

  try {
    const supplier = await createSupplier(data);
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (err) {
    if (err instanceof SupplierCodeTakenError) return jsonError(err.message, 409);
    throw err;
  }
});
