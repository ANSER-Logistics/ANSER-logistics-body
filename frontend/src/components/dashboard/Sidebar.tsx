"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangleIcon,
  BoltIcon,
  BoxIcon,
  ChartIcon,
  HomeIcon,
  ReceiptIcon,
  SettingsIcon,
  StaffIcon,
  UsersIcon,
  WarehouseIcon,
} from "@/components/dashboard/icons";

const navItems = [
  { label: "Trang chủ", icon: HomeIcon, href: "/dashboard" },
  { label: "Sản phẩm", icon: BoxIcon, href: "/dashboard/products" },
  { label: "Quản lý kho", icon: WarehouseIcon, href: "/dashboard/inventory" },
  { label: "Bán hàng", icon: ReceiptIcon, href: "/dashboard/sales" },
  { label: "Khách hàng", icon: UsersIcon, href: "/dashboard/customers" },
  // Đặt ngay dưới Khách hàng: cả hai nói về cùng một nhóm người, chỉ khác câu
  // hỏi — "họ là ai" và "họ đang giữ bao nhiêu tiền của mình".
  { label: "Dòng tiền", icon: ChartIcon, href: "/dashboard/cashflow" },
  { label: "Cảnh báo sổ sách", icon: AlertTriangleIcon, href: "/dashboard/audit" },
  { label: "Tài liệu", icon: ReceiptIcon, href: "/dashboard/documents" },
  { label: "Báo cáo", icon: ChartIcon, href: "/dashboard/reports" },
  { label: "Tự động hoá", icon: BoltIcon, href: "/dashboard/automation" },
  { label: "Nhân sự", icon: StaffIcon, href: "/dashboard/staff" },
  { label: "Cài đặt", icon: SettingsIcon, href: "/dashboard/settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/[0.08] bg-white/[0.02] p-4 sm:flex">
      <Link href="/" className="mb-8 flex items-center gap-2 px-2 text-lg font-extrabold tracking-tight">
        <span className="bg-gradient-to-br from-emerald-400 to-teal-300 bg-clip-text text-transparent">
          ▲
        </span>
        ANSER
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const content = (
            <>
              <Icon className="h-[18px] w-[18px]" />
              {item.label}
            </>
          );
          const active = item.href
            ? item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(`${item.href}/`)
            : false;

          return item.href ? (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-gradient-to-r from-violet-600/20 to-sky-500/10 text-white"
                  : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              {content}
            </Link>
          ) : (
            <button
              key={item.label}
              type="button"
              disabled
              className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-500"
              title="Sắp ra mắt"
            >
              {content}
            </button>
          );
        })}
      </nav>

      <div className="rounded-xl border border-white/[0.08] bg-black/30 p-4">
        <p className="text-xs font-semibold text-zinc-300">ANSER Engine v2.0</p>
        <p className="mt-1 text-[11px] text-zinc-500">Bản demo — dữ liệu mẫu</p>
      </div>
    </aside>
  );
}
