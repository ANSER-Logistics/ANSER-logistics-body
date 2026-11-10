import { NextResponse } from "next/server";
import { requireAdminUser, requireSessionUser } from "@/server/session";
import { createWarehouse, listWarehouses } from "@/server/store/warehouses";

export async function GET() {
  const { response } = await requireSessionUser();
  if (response) return response;

  const warehouses = await listWarehouses();
  return NextResponse.json({ warehouses });
}

export async function POST(request: Request) {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { name } = await request.json().catch(() => ({}));

  if (!name) {
    return NextResponse.json({ message: "Thiếu tên kho." }, { status: 400 });
  }

  try {
    const warehouse = await createWarehouse(name);
    return NextResponse.json({ warehouse }, { status: 201 });
  } catch {
    return NextResponse.json({ message: "Tên kho đã tồn tại." }, { status: 409 });
  }
}
