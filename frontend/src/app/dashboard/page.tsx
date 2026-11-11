import Link from "next/link";
import BarChartCard from "@/components/dashboard/BarChartCard";
import StatCard from "@/components/dashboard/StatCard";
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BoxIcon,
  PlusIcon,
  TruckIcon,
} from "@/components/dashboard/icons";
import { getReportSummary } from "@/server/reports";
import { productStatus } from "@/server/store/products";

const statusStyles: Record<string, string> = {
  "Còn hàng": "bg-emerald-500/15 text-emerald-400",
  "Sắp hết": "bg-amber-500/15 text-amber-400",
  "Hết hàng": "bg-red-500/15 text-red-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[status] ?? "bg-white/10 text-zinc-300"}`}
    >
      {status}
    </span>
  );
}

function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN")}₫`;
}

export default async function DashboardPage() {
  const { totalProducts, dailyFlow, stockByCategory, recentImports, products, alerts, lowStockCount } =
    await getReportSummary();

  const importedThisMonth = dailyFlow.reduce((s, d) => s + d.a, 0);
  const exportedThisMonth = dailyFlow.reduce((s, d) => s + d.b, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-violet-600/10 to-sky-500/5 p-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">Xin chào 👋</h1>
          <p className="mt-1 text-sm text-zinc-400">Tổng quan vận hành kho hàng</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/products"
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition-transform hover:-translate-y-0.5"
          >
            <PlusIcon className="h-4 w-4" />
            Thêm sản phẩm
          </Link>
          <Link
            href="/dashboard/inventory"
            className="flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-white/[0.09]"
          >
            <PlusIcon className="h-4 w-4" />
            Tạo phiếu nhập kho
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tổng sản phẩm" value={String(totalProducts)} accent="sky" icon={BoxIcon} />
        <StatCard label="Nhập kho 7 ngày qua" value={String(importedThisMonth)} accent="emerald" icon={ArrowDownIcon} />
        <StatCard label="Xuất kho 7 ngày qua" value={String(exportedThisMonth)} accent="violet" icon={ArrowUpIcon} />
        <StatCard
          label="Cảnh báo tồn kho"
          value={String(lowStockCount)}
          accent="red"
          icon={AlertTriangleIcon}
          note="Sản phẩm sắp/đã hết hàng"
        />
      </div>

      <BarChartCard
        title="Nhập / Xuất kho 7 ngày qua"
        data={dailyFlow}
        legendA="Nhập"
        legendB="Xuất"
        colorA="bg-sky-500"
        colorB="bg-violet-600"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h3 className="mb-5 text-sm font-semibold text-zinc-200">Tồn kho theo danh mục</h3>
          <div className="flex flex-col gap-4">
            {stockByCategory.map((c) => (
              <div key={c.label}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-zinc-300">{c.label}</span>
                  <span className="text-zinc-500">{c.pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 to-sky-500"
                    style={{ width: `${c.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-semibold text-zinc-200">Nhập kho gần đây</h3>
          <div className="flex flex-col gap-3">
            {recentImports.length === 0 && <p className="text-sm text-zinc-500">Chưa có phiếu nhập nào.</p>}
            {recentImports.map((r, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-black/30 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
                  <TruckIcon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{r.supplier}</p>
                  <p className="text-xs text-zinc-500">
                    {r.quantity} đơn vị · {r.date}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] lg:col-span-2">
          <div className="border-b border-white/[0.08] p-5">
            <h3 className="text-sm font-semibold text-zinc-200">Sản phẩm tồn kho</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs text-zinc-500 uppercase">
                  <th className="px-5 py-3 font-medium">Mã SP</th>
                  <th className="px-5 py-3 font-medium">Tên sản phẩm</th>
                  <th className="px-5 py-3 font-medium">Danh mục</th>
                  <th className="px-5 py-3 font-medium">Tồn kho</th>
                  <th className="px-5 py-3 font-medium">Giá bán</th>
                  <th className="px-5 py-3 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {products.slice(0, 5).map((p) => (
                  <tr key={p.code} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-5 py-3 font-mono text-xs text-zinc-400">{p.code}</td>
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-5 py-3 text-zinc-400">{p.category}</td>
                    <td className="px-5 py-3 text-zinc-400">{p.stock}</td>
                    <td className="px-5 py-3 text-zinc-400">{formatVnd(p.price)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={productStatus(p.stock)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-semibold text-zinc-200">Thông báo</h3>
          <div className="flex flex-col gap-4">
            {alerts.length === 0 && <p className="text-sm text-zinc-500">Không có cảnh báo nào.</p>}
            {alerts.slice(0, 5).map((a) => (
              <div key={`${a.ruleId}-${a.productId}`} className="flex gap-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-400" />
                <div>
                  <p className="text-sm font-medium">{a.productCode} sắp/đã hết hàng</p>
                  <p className="text-xs text-zinc-500">
                    Tồn {a.stock}, dưới ngưỡng {a.thresholdQty}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
