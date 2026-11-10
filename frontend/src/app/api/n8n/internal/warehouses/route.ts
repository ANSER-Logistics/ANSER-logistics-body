import { NextResponse } from "next/server";
import { requireInternalToken } from "@/server/internalAuth";
import { listWarehouses } from "@/server/store/warehouses";

// Dùng bởi workflow n8n (Cảnh báo tồn kho thấp, Báo cáo doanh số định kỳ) để biết
// gửi email cho địa chỉ nào ứng với từng kho.
export async function GET(request: Request) {
  const unauthorized = requireInternalToken(request);
  if (unauthorized) return unauthorized;

  const warehouses = await listWarehouses();
  return NextResponse.json({
    warehouses: warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      notification_email: w.notificationEmail,
    })),
  });
}
