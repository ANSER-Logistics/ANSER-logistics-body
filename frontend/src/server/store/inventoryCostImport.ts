import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { products } from "@/server/db/schema";
import {
  matchCosts,
  type CostImportPreview,
  type CostMatch,
  type UnitCostRow,
} from "@/server/store/inventoryCostMatch";

// Nạp giá vốn từ bảng Tổng hợp Nhập–Xuất–Tồn (Brain đã đọc và suy ra) vào cột
// `products.cost`.
//
// Đây là đường điền nhanh cột giá vốn đang rỗng hoàn toàn — thứ đang chặn báo
// cáo lãi lỗ. Ba nguyên tắc, mỗi cái đều có lý do đắt:
//
//  1. LUÔN xem trước rồi mới ghi. Ghi đè giá vốn hàng loạt là việc khó lùi, và
//     sai thì không lộ ra ngay mà âm thầm chảy vào mọi báo cáo lãi lỗ sau này.
//  2. Mặc định CHỈ điền chỗ đang trống. Giá vốn dựng dần từ phiếu nhập thật là
//     giá theo từng lô; giá suy từ bảng tổng hợp là bình quân cả kỳ. Đè cái sau
//     lên cái trước là đánh đổi số chính xác lấy số ước lượng.
//  3. Khớp theo mã, KHÔNG khớp mờ (xem `inventoryCostMatch.ts`).

export { matchCosts } from "@/server/store/inventoryCostMatch";
export type { CostImportPreview, CostMatch, MatchableProduct, UnitCostRow } from "@/server/store/inventoryCostMatch";

/**
 * Đối chiếu bảng giá vốn từ file với danh mục hàng trong ANSER.
 *
 * Không ghi gì cả — chỉ nói sẽ xảy ra chuyện gì.
 */
export async function previewCostImport(rows: UnitCostRow[]): Promise<CostImportPreview> {
  const all = await db.select().from(products);
  return matchCosts(rows, all);
}

/**
 * Ghi giá vốn thật.
 *
 * `overwrite = false` (mặc định) chỉ điền vào chỗ đang trống. `productIds` cho
 * phép người dùng chọn riêng một số dòng sau khi xem trước — không truyền thì
 * áp dụng cho toàn bộ dòng khớp được.
 */
export async function applyCostImport(
  rows: UnitCostRow[],
  opts: { overwrite?: boolean; productIds?: string[] } = {},
): Promise<{ updated: number; skipped: number; applied: CostMatch[] }> {
  const preview = await previewCostImport(rows);
  const allow = opts.productIds ? new Set(opts.productIds) : null;

  const target = preview.matches.filter((m) => {
    if (allow && !allow.has(m.productId)) return false;
    return opts.overwrite ? true : !m.wouldOverwrite;
  });

  if (target.length === 0) {
    return { updated: 0, skipped: preview.matches.length, applied: [] };
  }

  // Một transaction cho cả lô: nửa chừng hỏng mà nửa số hàng đã đổi giá vốn thì
  // không ai biết bảng giá đang ở trạng thái nào.
  await db.transaction(async (tx) => {
    for (const m of target) {
      await tx.update(products).set({ cost: m.newCost, updatedAt: new Date() }).where(eq(products.id, m.productId));
    }
  });

  return {
    updated: target.length,
    skipped: preview.matches.length - target.length,
    applied: target,
  };
}

/** Đếm nhanh cho thanh trạng thái: bao nhiêu mặt hàng đã có giá vốn. */
export async function costCoverage(warehouseIds?: string[]) {
  const rows = warehouseIds?.length
    ? await db.select().from(products).where(inArray(products.warehouseId, warehouseIds))
    : await db.select().from(products);
  const withCost = rows.filter((p) => p.cost !== null && p.cost !== undefined).length;
  return { total: rows.length, withCost, pct: rows.length ? (withCost / rows.length) * 100 : 0 };
}
