import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/session";
import { updateWarehouse } from "@/server/store/warehouses";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const patch: Partial<{ notificationEmail: string | null }> = {};
  if (body.notificationEmail !== undefined) patch.notificationEmail = body.notificationEmail || null;

  const warehouse = await updateWarehouse(id, patch);
  if (!warehouse) {
    return NextResponse.json({ message: "Không tìm thấy kho." }, { status: 404 });
  }
  return NextResponse.json({ warehouse });
}
