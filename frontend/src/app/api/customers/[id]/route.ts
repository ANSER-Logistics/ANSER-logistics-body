import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireAdminUser, requireSessionUser } from "@/server/session";
import { deleteCustomer, getCustomerById, updateCustomer } from "@/server/store/customers";
import { nullableEmail, nullablePhone, nullableText, parseJsonBody, requiredText } from "@/server/validation";

const patchCustomerSchema = z.object({
  name: requiredText("Tên khách hàng không được để trống.").optional(),
  phone: nullablePhone(),
  email: nullableEmail(),
  address: nullableText("Địa chỉ"),
  note: nullableText("Ghi chú"),
});

export const GET = withErrorHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) {
    return jsonError("Không tìm thấy khách hàng.", 404);
  }
  return NextResponse.json({ customer });
});

export const PATCH = withErrorHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  const { data: body, response: invalid } = await parseJsonBody(request, patchCustomerSchema);
  if (invalid) return invalid;

  const existing = await getCustomerById(id);
  if (!existing) {
    return jsonError("Không tìm thấy khách hàng.", 404);
  }

  const patch: Partial<{
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    note: string | null;
  }> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.phone !== undefined) patch.phone = body.phone || null;
  if (body.email !== undefined) patch.email = body.email || null;
  if (body.address !== undefined) patch.address = body.address || null;
  if (body.note !== undefined) patch.note = body.note || null;

  const customer = await updateCustomer(id, patch);
  return NextResponse.json({ customer });
});

export const DELETE = withErrorHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  await deleteCustomer(id);
  return new NextResponse(null, { status: 204 });
});
