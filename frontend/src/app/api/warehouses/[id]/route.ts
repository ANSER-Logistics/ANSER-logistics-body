import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireAdminUser } from "@/server/session";
import { updateWarehouse } from "@/server/store/warehouses";
import { nullableEmail, parseJsonBody } from "@/server/validation";

const patchWarehouseSchema = z.object({
  notificationEmail: nullableEmail(),
});

export const PATCH = withErrorHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  const { data: body, response: invalid } = await parseJsonBody(request, patchWarehouseSchema);
  if (invalid) return invalid;

  const patch: Partial<{ notificationEmail: string | null }> = {};
  if (body.notificationEmail !== undefined) patch.notificationEmail = body.notificationEmail;

  const warehouse = await updateWarehouse(id, patch);
  if (!warehouse) {
    return jsonError("Không tìm thấy kho.", 404);
  }
  return NextResponse.json({ warehouse });
});
