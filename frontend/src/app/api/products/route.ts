import { NextResponse } from "next/server";
import { createProduct, listProducts } from "@/server/store/products";
import { listWarehouses } from "@/server/store/warehouses";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const categoryId = searchParams.get("categoryId") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  // Chỉ lọc theo kho khi có truyền `warehouseIds` (trang Quản lý kho) — mặc định
  // trả về sản phẩm của mọi kho, vì lọc theo kho là tính năng riêng của trang đó.
  const warehouseIdsParam = searchParams.get("warehouseIds");
  const warehouseIds = warehouseIdsParam ? warehouseIdsParam.split(",").filter(Boolean) : undefined;

  const products = await listProducts({ search, categoryId, category, warehouseIds });
  return NextResponse.json({ products });
}

/**
 * Đọc giá vốn từ body.
 *
 * Trả `undefined` = không nhắc tới (giữ nguyên), `null` = CHƯA BIẾT, số = giá.
 * Chuỗi rỗng từ form phải ra `null` chứ không phải 0 — `Number("")` bằng 0 sẽ
 * ghi nhận "hàng không tốn đồng nào" và đẩy lãi gộp lên 100%.
 */
function parseCost(raw: unknown): number | null | "invalid" {
  if (raw === undefined) return null;
  if (raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

export async function POST(request: Request) {
  const { name, category, categoryId, unit, stock, price, cost, warehouseId } = await request
    .json()
    .catch(() => ({}));

  if (!name || (!category && !categoryId) || !unit || !warehouseId) {
    return NextResponse.json({ message: "Thiếu tên, danh mục, đơn vị hoặc kho của sản phẩm." }, { status: 400 });
  }

  const validWarehouses = await listWarehouses();
  if (!validWarehouses.some((w) => w.id === warehouseId)) {
    return NextResponse.json({ message: "Kho không hợp lệ." }, { status: 400 });
  }
  const stockNum = Number(stock);
  const priceNum = Number(price);
  if (!Number.isFinite(stockNum) || stockNum < 0 || !Number.isFinite(priceNum) || priceNum < 0) {
    return NextResponse.json({ message: "Tồn kho/giá bán không hợp lệ." }, { status: 400 });
  }

  const costValue = parseCost(cost);
  if (costValue === "invalid") {
    return NextResponse.json({ message: "Giá vốn phải là số không âm." }, { status: 400 });
  }

  const product = await createProduct({
    name,
    category,
    categoryId,
    unit,
    stock: stockNum,
    price: priceNum,
    cost: costValue,
    warehouseId,
  });
  return NextResponse.json({ product }, { status: 201 });
}
