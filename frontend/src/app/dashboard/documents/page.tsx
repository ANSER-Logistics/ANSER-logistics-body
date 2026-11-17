"use client";

import { useCallback, useEffect, useState } from "react";
import type { BrainDocument, BrainFreightInvoice, BrainIngestResult } from "@/server/brain";

/**
 * Nơi đổ dữ liệu khách gửi về: tài liệu nội bộ (cho hỏi đáp) và ảnh hoá đơn
 * nhà xe (cho đọc tự động).
 *
 * Hai điều bắt buộc phải đúng, vì sai thì người dùng tin vào thứ không có thật:
 *
 *  1. **Cảnh báo lúc nạp phải hiện ra.** Một PDF scan bị từ chối, một bảng Word
 *     mất cấu trúc cột — hai chuyện đó quyết định tài liệu có dùng được không.
 *     Nuốt cảnh báo là để người dùng tưởng hệ thống đã đọc hợp đồng của họ.
 *  2. **Hoá đơn đọc xong phải hiện rõ có kiểm được không.** "Không kiểm được"
 *     và "đã kiểm và đúng" là hai trạng thái khác nhau.
 */

const vnd = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toLocaleString("vi-VN")} ₫`);

type Tab = "tai-lieu" | "hoa-don";

export default function DocumentsPage() {
  const [tab, setTab] = useState<Tab>("tai-lieu");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Tài liệu &amp; hoá đơn</h1>
        <p className="mt-1 text-sm text-zinc-400">Nạp tài liệu nội bộ để hỏi đáp, và đọc hoá đơn nhà xe từ ảnh chụp.</p>
      </div>

      <div className="flex gap-2 border-b border-white/[0.08]">
        {(
          [
            ["tai-lieu", "Tài liệu nội bộ"],
            ["hoa-don", "Hoá đơn nhà xe"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === k ? "border-b-2 border-sky-500 text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "tai-lieu" ? <KhoTaiLieu /> : <DocHoaDon />}
    </div>
  );
}

/* ========================================================================== */
/*  Tài liệu nội bộ                                                            */
/* ========================================================================== */

function KhoTaiLieu() {
  const [docs, setDocs] = useState<BrainDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BrainIngestResult | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/ai/documents", { cache: "no-store" });
      const d = await r.json();
      if (r.ok) setDocs(d.documents ?? []);
      else setError(d.detail ?? d.error ?? `Lỗi ${r.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Hoãn một nhịp rồi mới nạp: `fetch` có thể ném ĐỒNG BỘ (URL hỏng), và khi đó
  // `setError` chạy ngay trong thân effect — React cảnh báo vì nó kéo theo một
  // vòng render nữa. Cùng lối với trang Kho, và có dọn dẹp khi rời trang.
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("file", file);
    if (from) form.append("effective_from", from);
    if (to) form.append("effective_to", to);

    try {
      const r = await fetch("/api/ai/documents", { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) {
        setError(d.detail ?? d.error ?? `Lỗi ${r.status}`);
        return;
      }
      setResult(d as BrainIngestResult);
      setFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function xoa(source: string) {
    setError(null);
    const r = await fetch(`/api/ai/documents?source=${encodeURIComponent(source)}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.detail ?? d.error ?? `Không xoá được (${r.status})`);
      return;
    }
    await load();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <h3 className="text-sm font-bold">Nạp tài liệu</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Hợp đồng, bảng giá cước, quy định giao nhận, chính sách công nợ. Nhận{" "}
          <span className="text-zinc-300">.pdf, .docx, .txt, .md</span>.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError(null);
            }}
            className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-white/[0.12]"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-zinc-400">Hiệu lực từ (tuỳ chọn)</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-zinc-400">Hết hiệu lực (tuỳ chọn)</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
              />
            </label>
          </div>

          <p className="text-xs text-zinc-500">
            Điền ngày hiệu lực thì bảng giá cũ tự động không được dùng để trả lời câu hỏi hôm nay — nhưng vẫn tra cứu
            lại được khi cần xem quá khứ.
          </p>

          <button
            type="button"
            onClick={upload}
            disabled={!file || busy}
            className="self-start rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {busy ? "Đang đọc và nạp..." : "Nạp tài liệu"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
          <p className="text-sm font-semibold text-red-400">Không nạp được</p>
          <p className="mt-1 text-sm whitespace-pre-line text-red-300/90">{error}</p>
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
          <p className="text-sm text-emerald-300">
            {result.skipped_unchanged
              ? `${result.source} — nội dung không đổi, bỏ qua.`
              : `Đã nạp ${result.source}: ${result.chunks} đoạn` +
                (result.replaced ? " (thay bản cũ)" : "") +
                (result.pages ? ` · ${result.pages} trang` : "")}
          </p>
          {/* Cảnh báo lúc nạp quyết định tài liệu có dùng được không — nuốt nó
              là để người dùng tưởng hệ thống đã đọc hợp đồng của họ. */}
          {result.warnings.length > 0 && (
            <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm text-amber-300">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
        <div className="border-b border-white/[0.08] p-5">
          <h3 className="text-sm font-semibold text-zinc-200">Đang có trong kho ({docs.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-xs text-zinc-500 uppercase">
                <th className="px-5 py-3 font-medium">Tài liệu</th>
                <th className="px-5 py-3 font-medium">Đoạn</th>
                <th className="px-5 py-3 font-medium">Hiệu lực</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-zinc-500">
                    Chưa nạp tài liệu nào.
                  </td>
                </tr>
              )}
              {docs.map((d) => (
                <tr key={d.source} className="border-b border-white/[0.05] last:border-0">
                  <td className="px-5 py-3 font-medium">{d.source}</td>
                  <td className="px-5 py-3 text-zinc-400">{d.chunks}</td>
                  <td className="px-5 py-3 text-zinc-400">
                    {d.effective_from || d.effective_to ? (
                      `${d.effective_from ?? "…"} → ${d.effective_to ?? "nay"}`
                    ) : (
                      <span className="text-zinc-600">không ghi</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void xoa(d.source)}
                      className="rounded-lg px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/10"
                    >
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Hoá đơn nhà xe                                                             */
/* ========================================================================== */

function DocHoaDon() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kq, setKq] = useState<BrainFreightInvoice | null>(null);

  async function doc() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setKq(null);

    const form = new FormData();
    form.append("file", file);
    try {
      const r = await fetch("/api/ai/freight-invoice", { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) {
        setError(d.detail ?? d.error ?? `Lỗi ${r.status}`);
        return;
      }
      setKq(d as BrainFreightInvoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const inv = kq?.invoice;
  const v = kq?.validation;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <h3 className="text-sm font-bold">Đọc hoá đơn từ ảnh</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Chụp bằng điện thoại cũng được. Máy đọc xong sẽ{" "}
          <span className="text-zinc-300">tính lại toàn bộ số tiền</span> và đối chiếu với con số in trên tờ giấy.
        </p>
        <p className="mt-2 text-xs text-zinc-500">Ảnh chỉ đi qua để đọc, không lưu lại.</p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setKq(null);
              setError(null);
            }}
            className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-white/[0.12]"
          />
          <button
            type="button"
            onClick={doc}
            disabled={!file || busy}
            className="shrink-0 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {busy ? "Đang đọc..." : "Đọc hoá đơn"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
          <p className="text-sm font-semibold text-red-400">Không đọc được</p>
          <p className="mt-1 text-sm whitespace-pre-line text-red-300/90">{error}</p>
        </div>
      )}

      {kq && !kq.success && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-300">{kq.error}</div>
      )}

      {kq?.success && inv && v && (
        <>
          {/* "Không kiểm được" và "đã kiểm và đúng" là hai trạng thái khác nhau
              và phải trông khác nhau. */}
          <div
            className={`rounded-2xl border p-5 ${
              kq.needs_manual_review ? "border-amber-500/25 bg-amber-500/10" : "border-emerald-500/20 bg-emerald-500/10"
            }`}
          >
            <p className={`text-sm font-bold ${kq.needs_manual_review ? "text-amber-400" : "text-emerald-400"}`}>
              {kq.needs_manual_review ? "Cần người xem lại" : "Số liệu khớp — dùng được"}
            </p>
            {v.issues.length > 0 && (
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-amber-200/90">
                {v.issues.map((i, k) => (
                  <li key={k}>{i}</li>
                ))}
              </ul>
            )}
            {v.missing_required.length > 0 && (
              <p className="mt-2 text-sm text-amber-200/80">Thiếu trường bắt buộc: {v.missing_required.join(", ")}</p>
            )}
            {v.checks_performed.length > 0 && (
              <p className="mt-2 text-xs text-zinc-500">Đã kiểm: {v.checks_performed.join(" · ")}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
              <h3 className="mb-4 text-sm font-semibold text-zinc-200">Đọc được</h3>
              <dl className="flex flex-col gap-2 text-sm">
                {(
                  [
                    ["Nhà xe", inv.carrier_name],
                    ["Số hoá đơn", inv.invoice_no],
                    ["Ngày", inv.invoice_date],
                    ["Tuyến", inv.origin && inv.destination ? `${inv.origin} → ${inv.destination}` : null],
                    ["Loại xe", inv.vehicle_type],
                    ["Biển số", inv.plate_number],
                  ] as const
                ).map(([k, val]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-zinc-500">{k}</dt>
                    <dd className={val ? "text-right" : "text-right text-amber-500/80"}>{val || "chưa đọc được"}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
              <h3 className="mb-4 text-sm font-semibold text-zinc-200">Số trên hoá đơn vs tính lại</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-xs text-zinc-500 uppercase">
                      <th className="py-2 pr-3 font-medium"></th>
                      <th className="py-2 pr-3 font-medium">Trên tờ</th>
                      <th className="py-2 font-medium">Tính lại</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["Cộng tiền hàng", v.stated.subtotal, v.computed.subtotal],
                        ["Tiền thuế", v.stated.vat_amount, v.computed.vat_amount],
                        ["Tổng cộng", v.stated.total, v.computed.total],
                      ] as const
                    ).map(([k, a, b]) => (
                      <tr key={k} className="border-b border-white/[0.05] last:border-0">
                        <td className="py-2 pr-3 text-zinc-400">{k}</td>
                        <td className="py-2 pr-3">{vnd(a)}</td>
                        <td
                          className={`py-2 ${a !== null && b !== null && Math.abs(a - b) > 1000 ? "text-amber-400" : "text-emerald-400"}`}
                        >
                          {vnd(b)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {inv.charges.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
              <div className="border-b border-white/[0.08] p-5">
                <h3 className="text-sm font-semibold text-zinc-200">Các khoản</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-xs text-zinc-500 uppercase">
                      <th className="px-5 py-3 font-medium">Loại</th>
                      <th className="px-5 py-3 font-medium">Diễn giải</th>
                      <th className="px-5 py-3 font-medium">SL</th>
                      <th className="px-5 py-3 font-medium">Đơn giá</th>
                      <th className="px-5 py-3 font-medium">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.charges.map((c, i) => (
                      <tr key={i} className="border-b border-white/[0.05] last:border-0">
                        <td className="px-5 py-3">{c.kind}</td>
                        <td className="px-5 py-3 text-zinc-400">{c.description || "—"}</td>
                        <td className="px-5 py-3 text-zinc-400">{c.quantity}</td>
                        <td className="px-5 py-3 text-zinc-400">{vnd(c.unit_price)}</td>
                        <td className="px-5 py-3">{vnd(c.quantity * c.unit_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
