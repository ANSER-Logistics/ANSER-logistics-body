import { NextResponse } from "next/server";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireInternalToken } from "@/server/internalAuth";
import { evaluateAlerts } from "@/server/store/automation";
import { listWarehouses } from "@/server/store/warehouses";

// Dùng bởi workflow n8n "Cảnh báo tồn kho thấp" — tái dùng nguyên vẹn evaluateAlerts()
// (cùng logic với trang Tự động hoá), chỉ lọc theo 1 kho cụ thể trong vòng lặp của n8n.
export const GET = withErrorHandler(async (request: Request) => {
  const unauthorized = requireInternalToken(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const warehouseId = searchParams.get("warehouseId");

  if (!warehouseId) {
    return jsonError("Thiếu warehouseId.", 400);
  }

  const warehouses = await listWarehouses();
  const warehouse = warehouses.find((w) => w.id === warehouseId);
  if (!warehouse) {
    return jsonError("Không tìm thấy kho.", 404);
  }

  const alerts = await evaluateAlerts([warehouseId]);

  return NextResponse.json({
    warehouseId,
    warehouseName: warehouse.name,
    count: alerts.length,
    items: alerts.map((a) => ({
      name: a.productName,
      code: a.productCode,
      stock_quantity: a.stock,
      threshold: a.thresholdQty,
    })),
  });
});
