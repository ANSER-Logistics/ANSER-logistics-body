// Chuyển dữ liệu bán hàng trong DB thành đúng hình dạng Brain cần.
//
// Vì sao có file riêng: Brain KHÔNG được nối thẳng vào Postgres. Nó tính toán
// trên dữ liệu Body đưa sang, và chỉ đưa đúng phần cần cho báo cáo. Hai lý do:
//
//  1. Chủ quyền dữ liệu — Brain không cần biết mật khẩu, email khách, hay bất
//     kỳ cột nào ngoài dòng bán. Cho ít quyền hơn thì rò ít hơn.
//  2. Brain tính bằng CODE, không phải model sinh SQL. Một con số tài chính sai
//     mà nghe xuôi tai là loại lỗi không ai phát hiện tới lúc quyết toán.

import { and, eq, gte, inArray } from "drizzle-orm";
import type { BrainSaleLine } from "@/server/brain";
import { db } from "@/server/db/client";
import { products, salesInvoiceItems, salesInvoices } from "@/server/db/schema";

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
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
  const since = new Date();
  since.setMonth(since.getMonth() - (opts.months ?? 12));
  since.setHours(0, 0, 0, 0);

  if (opts.warehouseIds.length === 0) return { lines: [], withCost: 0, total: 0 };

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
    .innerJoin(products, eq(salesInvoiceItems.productId, products.id))
    .where(and(gte(salesInvoices.createdAt, since), inArray(products.warehouseId, opts.warehouseIds)));

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
