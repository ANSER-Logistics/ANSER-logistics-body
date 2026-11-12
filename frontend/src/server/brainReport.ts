// Chuyển dữ liệu bán hàng trong DB thành đúng hình dạng Brain cần.
//
// Vì sao có file riêng: Brain KHÔNG được nối thẳng vào Postgres. Nó tính toán
// trên dữ liệu Body đưa sang, và chỉ đưa đúng phần cần cho báo cáo. Hai lý do:
//
//  1. Chủ quyền dữ liệu — Brain không cần biết mật khẩu, email khách, hay bất
//     kỳ cột nào ngoài dòng bán. Cho ít quyền hơn thì rò ít hơn.
//  2. Brain tính bằng CODE, không phải model sinh SQL. Một con số tài chính sai
//     mà nghe xuôi tai là loại lỗi không ai phát hiện tới lúc quyết toán.

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { BrainSaleLine } from "@/server/brain";
import { db } from "@/server/db/client";
import { products, salesInvoiceItems, salesInvoices } from "@/server/db/schema";

// Ngày bán là ngày theo GIỜ VIỆT NAM (UTC+7, không có giờ mùa hè), không phải
// ngày UTC và cũng không phải múi giờ của máy chủ. Brain nhận chuỗi
// `YYYY-MM-DD` không kèm múi giờ và tin nó như được gửi, nên đơn bán lúc 06:30
// sáng 01/04 giờ VN (= 23:30Z 31/03) mà ghi "2026-03-31" là rơi sang tháng/quý
// trước mà không ai phát hiện được.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function toIsoDate(value: Date): string {
  return new Date(value.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** 00:00 giờ VN của ngày (theo giờ VN) cách hôm nay `months` tháng. */
function startOfVnDayMonthsAgo(now: Date, months: number): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() - months, vn.getUTCDate()) - VN_OFFSET_MS);
}

/**
 * Lấy các dòng bán trong `months` tháng gần nhất, kèm giá vốn NẾU CÓ.
 *
 * Thứ tự ưu tiên giá vốn, từ đáng tin nhất xuống:
 *   1. `salesInvoiceItems.unitCost` — snapshot đúng lúc bán
 *   2. `products.cost` — giá vốn hiện hành, chỉ là ước lượng cho hoá đơn cũ
 *   3. `null` — CHƯA BIẾT
 *
 * Bước 3 mới là bước quan trọng. Điền 0 vào chỗ chưa biết sẽ khiến Brain báo
 * lãi gộp bằng 100% doanh thu. Trả `null` thì Brain hạ độ tin cậy và nói thẳng
 * "chỉ X% doanh thu có giá vốn" — thà biết mình chưa biết.
 */
export async function collectSaleLines(opts: {
  warehouseIds: string[];
  months?: number;
}): Promise<{ lines: BrainSaleLine[]; withCost: number; total: number }> {
  const since = startOfVnDayMonthsAgo(new Date(), opts.months ?? 12);

  if (opts.warehouseIds.length === 0) return { lines: [], withCost: 0, total: 0 };

  // Kho của dòng bán là kho GHI TRÊN HOÁ ĐƠN lúc bán. Chỉ hoá đơn cũ (trước B6,
  // chưa có `warehouse_id`) mới phải đoán theo kho hiện tại của sản phẩm.
  // LEFT JOIN vì `sales_invoice_items.product_id` là ON DELETE SET NULL: xoá
  // sản phẩm không được xoá luôn doanh thu cũ của nó khỏi báo cáo.
  const warehouseId = sql<string | null>`coalesce(${salesInvoices.warehouseId}, ${products.warehouseId})`;

  const rows = await db
    .select({
      createdAt: salesInvoices.createdAt,
      productName: salesInvoiceItems.productName,
      quantity: salesInvoiceItems.quantity,
      lineTotal: salesInvoiceItems.lineTotal,
      unitCost: salesInvoiceItems.unitCost,
      productCost: products.cost,
    })
    .from(salesInvoiceItems)
    .innerJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
    .leftJoin(products, eq(salesInvoiceItems.productId, products.id))
    .where(and(gte(salesInvoices.createdAt, since), inArray(warehouseId, opts.warehouseIds)));

  let withCost = 0;
  const lines: BrainSaleLine[] = rows.map((row) => {
    const unitCost = row.unitCost ?? row.productCost ?? null;
    if (unitCost !== null) withCost += 1;
    return {
      date: toIsoDate(row.createdAt),
      revenue: row.lineTotal,
      product: row.productName,
      quantity: row.quantity,
      cogs: unitCost === null ? null : unitCost * row.quantity,
    };
  });

  return { lines, withCost, total: lines.length };
}
