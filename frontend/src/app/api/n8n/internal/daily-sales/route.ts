import { NextResponse } from "next/server";
import { getSalesReportForPeriod, SalesReportPeriod } from "@/server/reports";

// Dùng bởi 3 workflow n8n "Báo cáo doanh số" (ngày/tuần/tháng).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period");
  const period: SalesReportPeriod = periodParam === "week" || periodParam === "month" ? periodParam : "day";

  const report = await getSalesReportForPeriod(period);

  return NextResponse.json({
    period: report.periodLabel,
    summary: {
      total_orders: report.totalOrders,
      total_revenue: report.totalRevenue,
    },
    top_products: report.topProducts.map((p) => ({
      product_name: p.productName,
      qty_sold: p.qtySold,
      revenue: p.revenue,
    })),
  });
}
