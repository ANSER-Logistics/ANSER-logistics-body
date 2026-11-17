import { NextResponse } from "next/server";
import { jsonError, withErrorHandler } from "@/server/http";
import { buildReport } from "@/server/brain";
import { collectSaleLines } from "@/server/brainReport";
import { brainErrorResponse } from "@/server/brainHttp";
import { requireSessionUser } from "@/server/session";
import { listWarehouses } from "@/server/store/warehouses";

const GRANULARITIES = ["month", "quarter", "half", "year"] as const;
type Granularity = (typeof GRANULARITIES)[number];

function parseGranularity(value: string | null): Granularity {
  return (GRANULARITIES as readonly string[]).includes(value ?? "")
    ? (value as Granularity)
    : "quarter";
}

/**
 * Báo cáo doanh thu / giá vốn / lãi theo kỳ.
 *
 * Body chỉ LẤY dữ liệu và chuyển sang; toàn bộ phép tính nằm ở Brain và làm
 * bằng code thuần, không phải model sinh SQL — con số tài chính sai mà nghe
 * xuôi tai là loại lỗi không ai phát hiện tới lúc quyết toán.
 */
export const GET = withErrorHandler(async (request: Request) => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const granularity = parseGranularity(searchParams.get("granularity"));
  const months = Number(searchParams.get("months")) || 12;

  const warehouses = await listWarehouses();
  const { lines, withCost, total } = await collectSaleLines({
    warehouseIds: warehouses.map((w) => w.id),
    months,
  });

  if (lines.length === 0) {
    return jsonError("Chưa có dòng bán nào trong khoảng thời gian này", 409, { extra: { months } });
  }

  try {
    const report = await buildReport({ granularity, sales: lines, periods_back: 4, top_n: 10 });
    return NextResponse.json({
      report,
      source: {
        sale_lines: total,
        // Phơi rõ ra ngoài: người đọc phải biết báo cáo dựa trên bao nhiêu phần
        // dữ liệu có giá vốn. Brain cũng tự hạ độ tin cậy, nhưng nói hai lần
        // vẫn hơn để lọt một con số lãi trông rất chắc chắn.
        lines_with_cost: withCost,
        cost_coverage_pct: total ? Math.round((withCost / total) * 1000) / 10 : 0,
      },
    });
  } catch (error) {
    return brainErrorResponse(error);
  }
});
