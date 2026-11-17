import BarChartCard from "@/components/dashboard/BarChartCard";
import BrainProfitPanel from "@/components/dashboard/BrainProfitPanel";
import StatCard from "@/components/dashboard/StatCard";
import { BoltIcon, BoxIcon, ChartIcon, TruckIcon } from "@/components/dashboard/icons";
import { getReportSummary } from "@/server/reports";

function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN")}₫`;
}

export default async function ReportsPage() {
  const {
    totalRevenue,
    revenue7Days,
    invoiceCount7Days,
    dailyRevenue,
    revenueByCategory,
    recentInvoices,
    byWarehouse,
  } = await getReportSummary();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Báo cáo doanh thu</h1>
        <p className="mt-1 text-sm text-zinc-400">Tổng hợp doanh thu từ hoá đơn bán hàng.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tổng doanh thu" value={formatVnd(totalRevenue)} accent="emerald" icon={TruckIcon} />
        <StatCard label="Doanh thu 7 ngày qua" value={formatVnd(revenue7Days)} accent="sky" icon={ChartIcon} />
        <StatCard label="Hoá đơn 7 ngày qua" value={String(invoiceCount7Days)} accent="violet" icon={BoxIcon} />
        <StatCard
          label="Doanh thu TB/hoá đơn"
          value={invoiceCount7Days > 0 ? formatVnd(Math.round(revenue7Days / invoiceCount7Days)) : formatVnd(0)}
          accent="red"
          icon={BoltIcon}
        />
      </div>

      <BarChartCard title="Doanh thu 7 ngày qua" data={dailyRevenue} legendA="Doanh thu" colorA="bg-emerald-500" />

      <BrainProfitPanel />

      {byWarehouse.length > 1 && (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          <div className="border-b border-white/[0.08] p-5">
            <h3 className="text-sm font-semibold text-zinc-200">So sánh theo kho</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs text-zinc-500 uppercase">
                  <th className="px-5 py-3 font-medium">Kho</th>
                  <th className="px-5 py-3 font-medium">Sản phẩm</th>
                  <th className="px-5 py-3 font-medium">Doanh thu 7 ngày qua</th>
                  <th className="px-5 py-3 font-medium">Tổng doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {byWarehouse.map((w) => (
                  <tr key={w.warehouseId} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-5 py-3 font-medium">{w.warehouseName}</td>
                    <td className="px-5 py-3 text-zinc-400">{w.totalProducts}</td>
                    <td className="px-5 py-3 text-zinc-400">{formatVnd(w.revenue7Days)}</td>
                    <td className="px-5 py-3 font-semibold text-emerald-400">{formatVnd(w.totalRevenue)}</td>
                  </tr>
                ))}
                <tr className="bg-white/[0.03]">
                  <td className="px-5 py-3 font-semibold">Tổng</td>
                  <td className="px-5 py-3 font-semibold">{byWarehouse.reduce((s, w) => s + w.totalProducts, 0)}</td>
                  <td className="px-5 py-3 font-semibold">
                    {formatVnd(byWarehouse.reduce((s, w) => s + w.revenue7Days, 0))}
                  </td>
                  <td className="px-5 py-3 font-semibold text-emerald-400">
                    {formatVnd(byWarehouse.reduce((s, w) => s + w.totalRevenue, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h3 className="mb-5 text-sm font-semibold text-zinc-200">Doanh thu theo danh mục</h3>
          <div className="flex flex-col gap-4">
            {revenueByCategory.map((c) => (
              <div key={c.label}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-zinc-300">{c.label}</span>
                  <span className="text-zinc-500">{formatVnd(c.revenue)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500"
                    style={{ width: `${c.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-semibold text-zinc-200">Hoá đơn gần đây</h3>
          <div className="flex flex-col gap-3">
            {recentInvoices.length === 0 && <p className="text-sm text-zinc-500">Chưa có hoá đơn nào.</p>}
            {recentInvoices.map((inv, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-black/30 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <TruckIcon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{inv.customerName}</p>
                  <p className="text-xs text-zinc-500">{inv.date}</p>
                </div>
                <p className="text-sm font-semibold text-emerald-400">{formatVnd(inv.total)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
