// Chuyển dữ liệu bán hàng trong DB thành đúng hình dạng Brain cần.
//
// Vì sao có file riêng: Brain KHÔNG được nối thẳng vào Postgres. Nó tính toán
// trên dữ liệu Body đưa sang, và chỉ đưa đúng phần cần cho báo cáo. Hai lý do:
//
//  1. Chủ quyền dữ liệu — Brain không cần biết mật khẩu, email khách, hay bất
//     kỳ cột nào ngoài dòng bán. Cho ít quyền hơn thì rò ít hơn.
//  2. Brain tính bằng CODE, không phải model sinh SQL. Một con số tài chính sai
//     mà nghe xuôi tai là loại lỗi không ai phát hiện tới lúc quyết toán.

import { and, eq, gte } from "drizzle-orm";
import type { BrainSaleLine } from "@/server/brain";
import { db } from "@/server/db/client";
import { products, salesInvoiceItems, salesInvoices } from "@/server/db/schema";
import { invoiceInWarehouses } from "@/server/store/sales";
import { vnIsoDate, vnStartOfDayMonthsAgo } from "@/server/vnTime";

/**
 * Lấy các dòng bán trong `months` tháng gần nhất, kèm giá vốn NẾU CÓ.
 *
 * Ngày (`date`) và mép cửa sổ đều theo giờ VN — Brain gom theo ngày/tháng/quý
 * từ chuỗi `date`, nên đơn 06:30 sáng 01/04 giờ VN phải ra `2026-04-01`, không
 * phải ngày UTC `2026-03-31`.
 *
 * Kho lọc theo kho LÚC BÁN (xem `invoiceInWarehouses`), và `products` là LEFT
 * JOIN: xoá hay chuyển kho sản phẩm không được làm mất / kéo theo doanh thu cũ.
 *
 * Thứ tự ưu tiên giá vốn, từ đáng tin nhất xuống:
 *   1. `salesInvoiceItems.unitCost` — snapshot đúng lúc bán
 *   2. `products.cost` — giá vốn hiện hành, chỉ là ước lượng cho hoá đơn cũ
 *      (sản phẩm đã xoá thì không còn, rơi xuống bước 3)
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
  if (opts.warehouseIds.length === 0) return { lines: [], withCost: 0, total: 0 };

  const since = vnStartOfDayMonthsAgo(new Date(), opts.months ?? 12);

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
    .where(and(gte(salesInvoices.createdAt, since), invoiceInWarehouses(opts.warehouseIds)));

  let withCost = 0;
  const lines: BrainSaleLine[] = rows.map((row) => {
    const unitCost = row.unitCost ?? row.productCost ?? null;
    if (unitCost !== null) withCost += 1;
    return {
      date: vnIsoDate(row.createdAt),
      revenue: row.lineTotal,
      product: row.productName,
      quantity: row.quantity,
      cogs: unitCost === null ? null : unitCost * row.quantity,
    };
  });

  return { lines, withCost, total: lines.length };
}
