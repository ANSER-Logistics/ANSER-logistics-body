import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import {
  createTransaction,
  InsufficientStockError,
  InvalidTransactionError,
  listTransactions,
  ProductNotFoundError,
  SupplierNotFoundError,
  TransactionType,
} from "@/server/store/inventory";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Chưa đăng nhập." }, { status: 401 });
  }

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
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Chưa đăng nhập." }, { status: 401 });
  }

  const { productId, type, quantity, unitCost, counterparty, note, supplierId } = await request
    .json()
    .catch(() => ({}));

  if (!productId || (type !== "import" && type !== "export")) {
    return NextResponse.json({ message: "Thiếu sản phẩm hoặc loại phiếu không hợp lệ." }, { status: 400 });
  }
  const quantityNum = Number(quantity);
  if (!Number.isFinite(quantityNum) || quantityNum <= 0) {
    return NextResponse.json({ message: "Số lượng phải lớn hơn 0." }, { status: 400 });
  }

  // Bỏ trống đơn giá = CHƯA BIẾT giá vốn, không phải 0. Chuỗi rỗng từ form phải
  // ra `null`, chứ Number("") = 0 sẽ ghi nhận "hàng không tốn đồng nào" và đẩy
  // lãi gộp lên 100%.
  let unitCostNum: number | null = null;
  if (unitCost !== undefined && unitCost !== null && String(unitCost).trim() !== "") {
    unitCostNum = Number(unitCost);
    if (!Number.isFinite(unitCostNum) || unitCostNum < 0) {
      return NextResponse.json({ message: "Đơn giá phải là số không âm." }, { status: 400 });
    }
  }

  try {
    const transaction = await createTransaction({
      productId,
      type,
      quantity: quantityNum,
      unitCost: unitCostNum,
      counterparty,
      note,
      supplierId: supplierId || undefined,
      // Lấy từ session, không nhận từ client — tránh client tự xưng là người khác.
      employeeId: user.employeeId ?? undefined,
    });
    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof ProductNotFoundError || error instanceof SupplierNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    if (error instanceof InvalidTransactionError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: "Lỗi hệ thống." }, { status: 500 });
  }
}
