import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireSessionUser } from "@/server/session";
import { parseJsonBody } from "@/server/validation";
import {
  applyCostImport,
  previewCostImport,
  type UnitCostRow,
} from "@/server/store/inventoryCostImport";

/**
 * Nạp giá vốn từ bảng Tổng hợp N-X-T vào cột `products.cost`.
 *
 * `dryRun: true` (mặc định) chỉ xem trước, không ghi gì. Phải gửi rõ
 * `dryRun: false` mới ghi — mặc định an toàn, vì ghi đè giá vốn hàng loạt là
 * việc khó lùi và sai thì không lộ ra ngay.
 */

const costImportSchema = z.object({
  unit_costs: z.array(
    z.record(z.string(), z.unknown(), { error: "Mỗi dòng trong 'unit_costs' phải là một đối tượng." }),
    { error: "Thiếu mảng 'unit_costs'" },
  ),
  // Sai kiểu → 400 thay vì đoán: `"false"` (chuỗi) mà hiểu thành "xem trước" hay "ghi thật"
  // đều là đoán, và đoán sai ở đây là ghi đè giá vốn hàng loạt.
  dryRun: z.boolean({ error: "'dryRun' phải là true/false." }).optional(),
  overwrite: z.boolean({ error: "'overwrite' phải là true/false." }).optional(),
  productIds: z.array(z.string(), { error: "'productIds' phải là mảng mã sản phẩm." }).optional(),
});

function toUnitCostRows(raw: Record<string, unknown>[]): UnitCostRow[] {
  const rows: UnitCostRow[] = [];
  for (const r of raw) {
    const cost = Number(r.unit_cost);
    // Giá vốn <= 0 bị loại ở đây chứ không được ghi thành 0: 0 nghĩa là "hàng
    // không tốn đồng nào", một khẳng định mạnh, không phải chỗ để nhét dữ liệu
    // rác vào cho đủ dòng.
    if (!Number.isFinite(cost) || cost <= 0) continue;
    rows.push({
      code: String(r.code ?? ""),
      name: String(r.name ?? ""),
      unit: String(r.unit ?? ""),
      unit_cost: Math.round(cost),
      source: String(r.source ?? ""),
    });
  }
  return rows;
}

export const POST = withErrorHandler(async (request: Request) => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const { data: body, response: invalid } = await parseJsonBody(request, costImportSchema);
  if (invalid) return invalid;

  const rows = toUnitCostRows(body.unit_costs);
  if (rows.length === 0) {
    return jsonError("Không có dòng giá vốn nào dùng được trong dữ liệu gửi lên", 400);
  }

  const dryRun = body.dryRun !== false;
  const overwrite = body.overwrite === true;
  const productIds = body.productIds;

  if (dryRun) {
    return NextResponse.json({ dryRun: true, preview: await previewCostImport(rows) });
  }

  const result = await applyCostImport(rows, { overwrite, productIds });
  return NextResponse.json({ dryRun: false, ...result });
});
