import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireAdminUser, requireSessionUser } from "@/server/session";
import { createWarehouse, listWarehouses, WarehouseNameTakenError } from "@/server/store/warehouses";
import { parseJsonBody, requiredText } from "@/server/validation";

const createWarehouseSchema = z.object({
  name: requiredText("Thiếu tên kho."),
});

export const GET = withErrorHandler(async () => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const warehouses = await listWarehouses();
  return NextResponse.json({ warehouses });
});

export const POST = withErrorHandler(async (request: Request) => {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { data, response: invalid } = await parseJsonBody(request, createWarehouseSchema);
  if (invalid) return invalid;

  try {
    const warehouse = await createWarehouse(data.name);
    return NextResponse.json({ warehouse }, { status: 201 });
  } catch (error) {
    if (error instanceof WarehouseNameTakenError) {
      return jsonError("Tên kho đã tồn tại.", 409);
    }
    throw error;
  }
});
