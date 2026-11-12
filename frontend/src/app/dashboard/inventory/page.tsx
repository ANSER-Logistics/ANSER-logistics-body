"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "@/components/dashboard/icons";
import InventoryAuditPanel from "@/components/dashboard/InventoryAuditPanel";
import WarehouseSwitcher from "@/components/dashboard/WarehouseSwitcher";
import type { InventoryTransactionWithProduct, TransactionType } from "@/server/store/inventory";
import type { Product } from "@/server/store/products";
import type { Warehouse } from "@/server/store/warehouses";

type FormState = {
  type: TransactionType;
  productId: string;
  quantity: string;
  /** Chuỗi rỗng = CHƯA BIẾT giá vốn. Không được biến thành 0 khi gửi đi. */
  unitCost: string;
  counterparty: string;
  note: string;
};

const emptyForm: FormState = {
  type: "import",
  productId: "",
  quantity: "1",
  unitCost: "",
  counterparty: "",
  note: "",
};

const vnd = (n: number) => n.toLocaleString("vi-VN");

function productStatus(stock: number) {
  if (stock <= 0) return "Hết hàng";
  if (stock < 20) return "Sắp hết";
  return "Còn hàng";
}

const statusStyles: Record<string, string> = {
  "Còn hàng": "bg-emerald-500/15 text-emerald-400",
  "Sắp hết": "bg-amber-500/15 text-amber-400",
  "Hết hàng": "bg-red-500/15 text-red-400",
};

type Tab = "stock" | "history" | "audit";

export default function InventoryPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransactionWithProduct[]>([]);
  const [tab, setTab] = useState<Tab>("stock");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Bộ chọn kho là tính năng riêng của trang này — lấy danh sách kho + mặc định chọn tất cả.
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/warehouses");
      const data = await res.json();
      const list: Warehouse[] = data.warehouses ?? [];
      setWarehouses(list);
      setSelectedWarehouseIds(list.map((w) => w.id));
    })();
  }, []);

  const load = useCallback(async () => {
    if (selectedWarehouseIds.length === 0) return;
    const warehouseQuery = `warehouseIds=${selectedWarehouseIds.join(",")}`;
    const [productsRes, txRes] = await Promise.all([
      fetch(`/api/products?${warehouseQuery}`),
      fetch(`/api/inventory/transactions?${warehouseQuery}`),
    ]);
    const productsData = await productsRes.json();
    const txData = await txRes.json();
    const nextProducts: Product[] = productsData.products ?? [];
    setProducts(nextProducts);
    setTransactions(txData.transactions ?? []);
    setForm((f) =>
      nextProducts.some((p) => p.id === f.productId) ? f : { ...f, productId: nextProducts[0]?.id ?? "" },
    );
  }, [selectedWarehouseIds]);

  useEffect(() => {
    const timeout = setTimeout(load, 0);
    return () => clearTimeout(timeout);
  }, [load]);

  function handleWarehouseCreated(warehouse: Warehouse) {
    setWarehouses((prev) => [...prev, warehouse]);
  }

  function handleWarehouseUpdated(warehouse: Warehouse) {
    setWarehouses((prev) => prev.map((w) => (w.id === warehouse.id ? warehouse : w)));
  }

  function warehouseName(id: string) {
    return warehouses.find((w) => w.id === id)?.name ?? "—";
  }

  function openCreate() {
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/inventory/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type,
        productId: form.productId,
        quantity: Number(form.quantity),
        // Chỉ phiếu nhập mới mang giá vốn. Bỏ trống -> null (chưa biết), KHÔNG
        // phải 0 — 0 nghĩa là hàng không tốn đồng nào, đẩy lãi gộp lên 100%.
        unitCost: form.type === "import" && form.unitCost.trim() !== "" ? Number(form.unitCost) : null,
        counterparty: form.counterparty || undefined,
        note: form.note || undefined,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message ?? "Có lỗi xảy ra.");
      return;
    }

    setForm((f) => ({ ...f, quantity: "1", unitCost: "", counterparty: "", note: "" }));
    setModalOpen(false);
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">Quản lý kho</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Tồn kho chỉ đổi qua phiếu nhập/xuất bên dưới — không sửa tay được, luôn khớp với lịch sử giao dịch.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <WarehouseSwitcher
            warehouses={warehouses}
            selectedIds={selectedWarehouseIds}
            onChange={setSelectedWarehouseIds}
            onWarehouseCreated={handleWarehouseCreated}
            onWarehouseUpdated={handleWarehouseUpdated}
          />
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition-transform hover:-translate-y-0.5"
          >
            <PlusIcon className="h-4 w-4" />
            Tạo phiếu
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-white/[0.08]">
        <button
          type="button"
          onClick={() => setTab("stock")}
          className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab === "stock" ? "border-b-2 border-sky-500 text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Tồn kho hiện tại
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab === "history" ? "border-b-2 border-sky-500 text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Lịch sử giao dịch
        </button>
        <button
          type="button"
          onClick={() => setTab("audit")}
          className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab === "audit" ? "border-b-2 border-sky-500 text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Kiểm sổ từ Excel
        </button>
      </div>

      {tab === "audit" ? (
        <InventoryAuditPanel />
      ) : tab === "stock" ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-zinc-500">
            Số liệu tự tính từ lịch sử phiếu — chỉ xem, không sửa trực tiếp được ở bảng này.
          </p>
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-xs text-zinc-500 uppercase">
                    <th className="px-5 py-3 font-medium">Mã SP</th>
                    <th className="px-5 py-3 font-medium">Tên sản phẩm</th>
                    <th className="px-5 py-3 font-medium">Kho</th>
                    <th className="px-5 py-3 font-medium">Tồn kho</th>
                    <th className="px-5 py-3 font-medium">Giá vốn</th>
                    <th className="px-5 py-3 font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-zinc-500">
                        Chưa có sản phẩm nào trong (các) kho đang chọn.
                      </td>
                    </tr>
                  )}
                  {products.map((p) => {
                    const status = productStatus(p.stock);
                    return (
                      <tr key={p.id} className="border-b border-white/[0.05] last:border-0">
                        <td className="px-5 py-3 font-mono text-xs text-zinc-400">{p.code}</td>
                        <td className="px-5 py-3 font-medium">{p.name}</td>
                        <td className="px-5 py-3 text-zinc-400">{warehouseName(p.warehouseId)}</td>
                        <td className="px-5 py-3 text-zinc-400">
                          {p.stock} {p.unit}
                        </td>
                        {/* "Chưa có" phải trông KHÁC HẲN số 0 — nhìn nhầm hai thứ
                          này là hiểu sai toàn bộ báo cáo lãi lỗ. */}
                        <td className="px-5 py-3 text-zinc-400">
                          {p.cost === null || p.cost === undefined ? (
                            <span className="text-amber-500/80" title="Chưa nhập giá vốn — khác với giá vốn bằng 0">
                              chưa có
                            </span>
                          ) : (
                            `${vnd(p.cost)} ₫`
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[status]}`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs text-zinc-500 uppercase">
                  <th className="px-5 py-3 font-medium">Loại</th>
                  <th className="px-5 py-3 font-medium">Sản phẩm</th>
                  <th className="px-5 py-3 font-medium">Kho</th>
                  <th className="px-5 py-3 font-medium">Số lượng</th>
                  <th className="px-5 py-3 font-medium">Đơn giá vốn</th>
                  <th className="px-5 py-3 font-medium">Đối tác</th>
                  <th className="px-5 py-3 font-medium">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-zinc-500">
                      Chưa có giao dịch nào.
                    </td>
                  </tr>
                )}
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          t.type === "import" ? "bg-sky-500/15 text-sky-400" : "bg-violet-500/15 text-violet-400"
                        }`}
                      >
                        {t.type === "import" ? "Nhập" : "Xuất"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-zinc-500">{t.productCode}</span> {t.productName}
                    </td>
                    <td className="px-5 py-3 text-zinc-400">{t.warehouseName}</td>
                    <td className="px-5 py-3 text-zinc-400">{t.quantity}</td>
                    <td className="px-5 py-3 text-zinc-400">
                      {t.unitCost === null || t.unitCost === undefined ? (
                        <span className="text-zinc-600">—</span>
                      ) : (
                        `${vnd(t.unitCost)} ₫`
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-400">{t.counterparty || "—"}</td>
                    <td className="px-5 py-3 text-zinc-500">{new Date(t.createdAt).toLocaleString("vi-VN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-950 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold">Tạo phiếu</h2>
              <button onClick={() => setModalOpen(false)} className="rounded-lg p-1 text-zinc-400 hover:text-white">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: "import" }))}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                    form.type === "import" ? "bg-sky-500/20 text-sky-400" : "bg-white/[0.05] text-zinc-400"
                  }`}
                >
                  <ArrowDownIcon className="h-4 w-4" />
                  Nhập kho
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: "export" }))}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                    form.type === "export" ? "bg-violet-600/20 text-violet-400" : "bg-white/[0.05] text-zinc-400"
                  }`}
                >
                  <ArrowUpIcon className="h-4 w-4" />
                  Xuất kho
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Sản phẩm</label>
                <select
                  required
                  value={form.productId}
                  onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
                  className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name} (tồn: {p.stock} {p.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Số lượng</label>
                <input
                  required
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                />
              </div>

              {form.type === "import" && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
                    Đơn giá nhập (VND/đơn vị) — tuỳ chọn
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Bỏ trống nếu chưa biết"
                    value={form.unitCost}
                    onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))}
                    className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                  />
                  <p className="mt-1.5 text-xs text-zinc-500">
                    Đây là giá vốn. Ghi càng đủ thì báo cáo lãi lỗ càng đáng tin — bỏ trống thì phần doanh thu của mặt
                    hàng này bị loại khỏi phép tính lãi thay vì bị coi là lãi 100%.
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
                  {form.type === "import" ? "Nhà cung cấp" : "Khách hàng"} (tuỳ chọn)
                </label>
                <input
                  value={form.counterparty}
                  onChange={(e) => setForm((f) => ({ ...f, counterparty: e.target.value }))}
                  className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Ghi chú (tuỳ chọn)</label>
                <input
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !form.productId}
                className="mt-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                {submitting ? "Đang xử lý..." : "Tạo phiếu"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
