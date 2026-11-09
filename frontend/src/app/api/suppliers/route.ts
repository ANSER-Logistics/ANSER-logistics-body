import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/session";
import {
  SupplierCodeTakenError,
  createSupplier,
  listSuppliers,
  parseSupplierInput,
  type SupplierInput,
} from "@/server/store/suppliers";

// Quyền theo mẫu `api/customers` (bảng gần giống): xem/tạo = đã đăng nhập, sửa/xoá = admin.
export async function GET(request: Request) {
  const { response } = await requireSessionUser();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || undefined;
  const suppliers = await listSuppliers(search);
  return NextResponse.json({ suppliers });
}

export async function POST(request: Request) {
  const { response } = await requireSessionUser();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const parsed = parseSupplierInput(body ?? {}, false);
  if (parsed.message !== undefined) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }

  try {
    // partial = false nên mọi trường đều đã được điền.
    const supplier = await createSupplier(parsed.data as SupplierInput);
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (err) {
    if (err instanceof SupplierCodeTakenError) {
      return NextResponse.json({ message: err.message }, { status: 409 });
    }
    throw err;
  }
}
