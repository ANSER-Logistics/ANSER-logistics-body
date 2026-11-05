import { NextResponse } from "next/server";
import { requireAdminUser, requireSessionUser } from "@/server/session";
import { deleteCustomer, getCustomerById, updateCustomer } from "@/server/store/customers";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireSessionUser();
  if (response) return response;

  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) {
    return NextResponse.json({ message: "Không tìm thấy khách hàng." }, { status: 404 });
  }
  return NextResponse.json({ customer });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const existing = await getCustomerById(id);
  if (!existing) {
    return NextResponse.json({ message: "Không tìm thấy khách hàng." }, { status: 404 });
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
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  await deleteCustomer(id);
  return new NextResponse(null, { status: 204 });
}
