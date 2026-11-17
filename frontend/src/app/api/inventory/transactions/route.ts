import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireSessionUser } from "@/server/session";
import {
  createTransaction,
  InsufficientStockError,
  InvalidTransactionError,
  listTransactions,
  ProductNotFoundError,
  SupplierNotFoundError,
  TransactionType,
} from "@/server/store/inventory";
import { numberLike, optionalText, parseJsonBody, requiredText } from "@/server/validation";

const createTransactionSchema = z.object({
  productId: requiredText("Thiếu sản phẩm hoặc loại phiếu không hợp lệ."),
  type: z.enum(["import", "export"], { error: "Thiếu sản phẩm hoặc loại phiếu không hợp lệ." }),
  quantity: numberLike("Số lượng phải lớn hơn 0.").pipe(z.number().gt(0, "Số lượng phải lớn hơn 0.")),
  unitCost: z
    .union([
      z.string().trim().length(0).transform(() => null),
      numberLike("Đơn giá phải là số không âm.").pipe(z.number().min(0, "Đơn giá phải là số không âm.")),
    ], { error: "Đơn giá phải là số không âm." })
    .nullish(),
  counterparty: optionalText("Đối tác"),
  note: optionalText("Ghi chú"),
  supplierId: optionalText("Nhà cung cấp"),
});

export const GET = withErrorHandler(async (request: Request) => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as TransactionType | null;
  const limitParam = searchParams.get("limit");
  const warehouseIdsParam = searchParams.get("warehouseIds");
  const warehouseIds = warehouseIdsParam ? warehouseIdsParam.split(",").filter(Boolean) : undefined;

  const transactions = await listTransactions({
    type: type === "import" || type === "export" ? type : undefined,
    limit: limitParam ? Number(limitParam) : undefined,
    warehouseIds,
  });
  return NextResponse.json({ transactions });
});

export const POST = withErrorHandler(async (request: Request) => {
  const { user, response } = await requireSessionUser();
  if (response) return response;

  const { data, response: invalid } = await parseJsonBody(request, createTransactionSchema);
  if (invalid) return invalid;

  try {
    const transaction = await createTransaction({
      ...data,
      unitCost: data.unitCost ?? null,
      // Lấy từ session, không nhận từ client — tránh client tự xưng là người khác.
      employeeId: user.employeeId ?? undefined,
    });
    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return jsonError(error.message, 409);
    }
    if (error instanceof ProductNotFoundError || error instanceof SupplierNotFoundError) {
      return jsonError(error.message, 404);
    }
    if (error instanceof InvalidTransactionError) {
      return jsonError(error.message, 400);
    }
    throw error;
  }
});
