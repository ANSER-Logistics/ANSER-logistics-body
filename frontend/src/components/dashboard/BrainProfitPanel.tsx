"use client";

import { useState } from "react";
import type { BrainReport } from "@/server/brain";

/**
 * Lãi gộp / lãi ròng theo kỳ — Brain tính, tính bằng code thuần chứ không phải
 * model sinh ra số.
 *
 * CỐ Ý là client component nạp theo yêu cầu, không phải server component:
 * trang báo cáo được render ở server, nên gọi Brain lúc render đồng nghĩa với
 * việc Brain chết là cả trang trắng. Doanh thu vẫn phải xem được kể cả khi phần
 * AI không nối được.
 *
 * Điểm phải làm đúng: `cogs_coverage_pct` KHÔNG được giấu đi. Một tỷ suất lãi
 * dựa trên 40% dữ liệu và một tỷ suất dựa trên 100% trông giống hệt nhau trên
 * màn hình, nhưng chỉ một cái dùng để ra quyết định được.
 */

type ReportResponse = {
  report: BrainReport;
  source: { sale_lines: number; lines_with_cost: number; cost_coverage_pct: number };
};

const GRANULARITIES = [
  { value: "month", label: "Tháng" },
  { value: "quarter", label: "Quý" },
  { value: "half", label: "Nửa năm" },
  { value: "year", label: "Năm" },
] as const;

const CONFIDENCE_STYLES: Record<string, string> = {
  cao: "bg-emerald-500/15 text-emerald-400",
  "trung bình": "bg-amber-500/15 text-amber-400",
  thấp: "bg-red-500/15 text-red-400",
};

function vnd(value: unknown) {
  return typeof value === "number" ? `${value.toLocaleString("vi-VN")}₫` : "—";
}

export default function BrainProfitPanel() {
  const [granularity, setGranularity] = useState<string>("quarter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportResponse | null>(null);

  async function load(g: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/report?granularity=${g}&months=12`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.detail ?? body.error ?? `Lỗi ${res.status}`);
        setData(null);
        return;
      }
      setData(body as ReportResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  const explain = data?.report.explain;
  const coverage = explain?.cogs_coverage_pct ?? 0;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-5">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Lãi gộp theo kỳ</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Tính từ giá vốn đã ghi nhận. Phần chưa có giá vốn bị loại khỏi phép tính lãi, không bị coi là lãi 100%.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={granularity}
            onChange={(e) => {
              setGranularity(e.target.value);
              if (data || error) void load(e.target.value);
            }}
            className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm outline-none focus:border-sky-500"
          >
            {GRANULARITIES.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load(granularity)}
            disabled={busy}
            className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {busy ? "Đang tính..." : data ? "Tính lại" : "Tính lãi gộp"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-5">
          <p className="text-sm font-semibold text-red-400">Không lấy được báo cáo</p>
          <p className="mt-1 text-sm whitespace-pre-line text-red-300/80">{error}</p>
        </div>
      )}

      {data && explain && (
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                CONFIDENCE_STYLES[explain.confidence] ?? CONFIDENCE_STYLES["thấp"]
              }`}
            >
              độ tin cậy: {explain.confidence}
            </span>
            <span className="text-zinc-400">
              Có giá vốn: <span className="text-white">{coverage}%</span> doanh thu
            </span>
            <span className="text-zinc-500">
              {data.source.lines_with_cost}/{data.source.sale_lines} dòng bán
            </span>
          </div>

          {coverage < 100 && (
            <p className="mt-3 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300/90">
              Còn {(100 - coverage).toFixed(1)}% doanh thu chưa có giá vốn nên chưa tính được lãi. Ghi đơn giá khi tạo
              phiếu nhập kho để phần này thu hẹp dần.
            </p>
          )}

          {data.report.warnings.length > 0 && (
            <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm text-zinc-400">
              {data.report.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs text-zinc-500 uppercase">
                  <th className="px-3 py-3 font-medium">Kỳ</th>
                  <th className="px-3 py-3 font-medium">Doanh thu</th>
                  <th className="px-3 py-3 font-medium">Giá vốn</th>
                  <th className="px-3 py-3 font-medium">Lãi gộp</th>
                </tr>
              </thead>
              <tbody>
                {data.report.periods.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-zinc-500">
                      Chưa có dòng bán nào trong 12 tháng gần đây.
                    </td>
                  </tr>
                )}
                {data.report.periods.map((p, i) => (
                  <tr key={i} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-3 py-3 font-medium">{String(p.label ?? p.period ?? "—")}</td>
                    <td className="px-3 py-3 text-zinc-400">{vnd(p.revenue)}</td>
                    <td className="px-3 py-3 text-zinc-400">{vnd(p.cogs)}</td>
                    <td className="px-3 py-3 font-semibold text-emerald-400">{vnd(p.gross_profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-zinc-600">{explain.formula}</p>
        </div>
      )}
    </div>
  );
}
