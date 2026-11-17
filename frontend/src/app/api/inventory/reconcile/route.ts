import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { getSessionUser } from "@/server/session";
import { inventoryTransactions, products } from "@/server/db/schema";

/**
 * Đối chiếu `products.stock` (số dư chạy) với tổng `inventory_transactions.quantity`
 * (sổ cái) cho từng sản phẩm.
 *
 * Đây là hai nguồn số dư lẽ ra phải luôn khớp nhau: `products.stock` được cập nhật
 * trực tiếp mỗi lần bán/nhập/điều chỉnh, còn `inventory_transactions` là nhật ký
 * từng dòng ghi lại chính các thay đổi đó. Nếu hai bên lệch, một trong hai đường ghi
 * dữ liệu đang có lỗi — đây là kiểu lỗi mà `store/sales.ts` từng gặp (dấu `+`/`-`
 * lệch nhau giữa cập nhật số dư và dòng sổ cái tương ứng).
 *
 * Chỉ ĐỌC — endpoint này không tự sửa gì. Quyết định sửa `products.stock` hay
 * chèn một dòng `adjustment` vào sổ cái cần một người xem qua từng trường hợp,
 * không nên đoán tự động — sai lệch có nhiều nguyên nhân khác nhau (bug ghi sổ,
 * đơn hàng bị huỷ giữa chừng, sản phẩm nhập tay ngoài luồng...).
 *
 * GET /api/inventory/reconcile
 * GET /api/inventory/reconcile?warehouseId=...
 * GET /api/inventory/reconcile?productId=...
 */

// Dung sai làm tròn cho numeric(14,3) — dưới ngưỡng này coi là bằng nhau, không
// phải sai lệch thật. Không dùng so sánh `!==` trực tiếp trên số thực.
const EPSILON = 0.001;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const warehouseId = searchParams.get("warehouseId") ?? undefined;
  const productId = searchParams.get("productId") ?? undefined;

  const conditions = [];
  if (warehouseId) conditions.push(eq(products.warehouseId, warehouseId));
  if (productId) conditions.push(eq(products.id, productId));

  // Group theo products.id là đủ để select thêm code/name/stock của cùng bảng
  // (Postgres cho phép nhờ functional dependency qua primary key) — không cần
  // liệt kê hết vào GROUP BY.
  const rows = await db
    .select({
      productId: products.id,
      code: products.code,
      name: products.name,
      productStock: products.stock,
      ledgerBalance: sql<string>`coalesce(sum(${inventoryTransactions.quantity}), 0)`,
    })
    .from(products)
    .leftJoin(inventoryTransactions, eq(inventoryTransactions.productId, products.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(products.id)
    .orderBy(products.code);

  const mismatches = rows
    .map((r) => {
      const productStock = Number(r.productStock);
      const ledgerBalance = Number(r.ledgerBalance);
      return {
        productId: r.productId,
        code: r.code,
        name: r.name,
        productStock,
        ledgerBalance,
        diff: productStock - ledgerBalance,
      };
    })
    .filter((r) => Math.abs(r.diff) > EPSILON);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    totalProductsChecked: rows.length,
    mismatchCount: mismatches.length,
    mismatches,
  });
}
