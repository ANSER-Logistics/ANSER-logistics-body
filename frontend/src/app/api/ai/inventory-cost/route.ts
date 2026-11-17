import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { applyCostImport, previewCostImport, type UnitCostRow } from "@/server/store/inventoryCostImport";

/**
 * Nạp giá vốn từ bảng Tổng hợp N-X-T vào cột `products.cost`.
 *
 * `dryRun: true` (mặc định) chỉ xem trước, không ghi gì. Phải gửi rõ
 * `dryRun: false` mới ghi — mặc định an toàn, vì ghi đè giá vốn hàng loạt là
 * việc khó lùi và sai thì không lộ ra ngay.
 */

function parseRows(raw: unknown): UnitCostRow[] | null {
  if (!Array.isArray(raw)) return null;
  const rows: UnitCostRow[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const r = item as Record<string, unknown>;
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

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body phải là JSON" }, { status: 400 });
  }

  const rows = parseRows(body.unit_costs);
  if (rows === null) {
    return NextResponse.json({ error: "Thiếu mảng 'unit_costs'" }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "Không có dòng giá vốn nào dùng được trong dữ liệu gửi lên" }, { status: 400 });
  }

  const dryRun = body.dryRun !== false;
  const overwrite = body.overwrite === true;
  const productIds = Array.isArray(body.productIds)
    ? body.productIds.filter((x): x is string => typeof x === "string")
    : undefined;

  if (dryRun) {
    return NextResponse.json({ dryRun: true, preview: await previewCostImport(rows) });
  }

  const result = await applyCostImport(rows, { overwrite, productIds });
  return NextResponse.json({ dryRun: false, ...result });
}
