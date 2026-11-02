import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/session";
import { createTransaction, InsufficientStockError, listTransactions, TransactionType } from "@/server/store/inventory";

export async function GET(request: Request) {
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
}

export async function POST(request: Request) {
  const { response } = await requireSessionUser();
  if (response) return response;

  const { productId, type, quantity, unitCost, counterparty, note } = await request
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
    });
    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    // Trước đây MỌI lỗi đều bị gán "Không tìm thấy sản phẩm" + 404 — kể cả lỗi
    // DB hay lỗi xác thực. Người dùng đi sửa sai chỗ, còn lỗi thật thì mất dấu.
    const message = error instanceof Error ? error.message : "Lỗi không xác định.";
    const notFound = message.includes("Không tìm thấy sản phẩm");
    return NextResponse.json({ message }, { status: notFound ? 404 : 400 });
  }
}
