import { NextResponse } from "next/server";
import { deleteProduct, getProductById, updateProduct } from "@/server/store/products";
import { listWarehouses } from "@/server/store/warehouses";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) {
    return NextResponse.json({ message: "Không tìm thấy sản phẩm." }, { status: 404 });
  }
  return NextResponse.json({ product });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (body.warehouseId !== undefined) {
    const validWarehouses = await listWarehouses();
    if (!validWarehouses.some((w) => w.id === body.warehouseId)) {
      return NextResponse.json({ message: "Kho không hợp lệ." }, { status: 400 });
    }
  }

  // Tồn kho KHÔNG sửa được qua route này — chỉ thay đổi qua phiếu nhập/xuất ở Quản lý kho
  // (createTransaction() dùng db.transaction() để đồng bộ với inventoryTransactions), tránh
  // sửa tay làm tồn kho lệch khỏi lịch sử giao dịch thật.
  const patch: Partial<{
    name: string;
    categoryId: string | null;
    category: string;
    unit: string;
    price: number;
    cost: number | null;
    warehouseId: string;
  }> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.categoryId !== undefined) patch.categoryId = body.categoryId;
  if (body.category !== undefined) patch.category = body.category;
  if (body.unit !== undefined) patch.unit = body.unit;
  if (body.warehouseId !== undefined) patch.warehouseId = body.warehouseId;
  if (body.price !== undefined) {
    const priceNum = Number(body.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      return NextResponse.json({ message: "Giá bán không hợp lệ." }, { status: 400 });
    }
    patch.price = priceNum;
  }
  // Giá vốn có thể bị XOÁ về "chưa biết" một cách chủ động: gửi `null` hoặc
  // chuỗi rỗng. Đây là thao tác hợp lệ — nhận ra một giá vốn đang sai thì xoá
  // đi tốt hơn là để nguyên, vì báo cáo sẽ tự hạ độ tin cậy thay vì tính lãi
  // trên một con số không đúng.
  if (body.cost !== undefined) {
    if (body.cost === null || String(body.cost).trim() === "") {
      patch.cost = null;
    } else {
      const costNum = Number(body.cost);
      if (!Number.isFinite(costNum) || costNum < 0) {
        return NextResponse.json({ message: "Giá vốn không hợp lệ." }, { status: 400 });
      }
      patch.cost = costNum;
    }
  }

  const existing = await getProductById(id);
  if (!existing) {
    return NextResponse.json({ message: "Không tìm thấy sản phẩm." }, { status: 404 });
  }

  const product = await updateProduct(id, patch);
  return NextResponse.json({ product });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await getProductById(id);
  if (!existing) {
    return NextResponse.json({ message: "Không tìm thấy sản phẩm." }, { status: 404 });
  }
  await deleteProduct(id);
  return new NextResponse(null, { status: 204 });
}
