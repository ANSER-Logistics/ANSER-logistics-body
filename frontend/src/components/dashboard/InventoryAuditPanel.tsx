"use client";

import { useState } from "react";
import type { BrainInventoryImport } from "@/server/brain";
// Trỏ thẳng vào module THUẦN, không qua `inventoryCostImport` — file đó kéo
// theo DB client, và một lỡ tay bỏ chữ `type` là lôi cả driver Postgres vào
// bundle trình duyệt.
import type { CostImportPreview } from "@/server/store/inventoryCostMatch";

/**
 * Kiểm sổ kho từ file Excel khách xuất ra (MISA / Fast / Bravo).
 *
 * Hai điều màn hình này BẮT BUỘC phải làm đúng, vì làm sai thì người dùng tin
 * vào một kết luận không có thật:
 *
 *  1. Brain có thể TỪ CHỐI kiểm khi không đọc chắc được bảng. Lúc đó phải hiện
 *     rõ lý do — tuyệt đối không được hiển thị như "không phát hiện lỗi nào".
 *  2. "Không có phát hiện" và "chưa kiểm" là hai trạng thái khác nhau và phải
 *     trông khác nhau.
 */

const SEVERITY_STYLES: Record<string, string> = {
  cao: "bg-red-500/15 text-red-400 border-red-500/20",
  "trung bình": "bg-amber-500/15 text-amber-400 border-amber-500/20",
  thấp: "bg-sky-500/15 text-sky-400 border-sky-500/20",
};

const vnd = (n: number) => n.toLocaleString("vi-VN");

/**
 * Một ô CSV. Excel bản tiếng Việt dùng dấu phẩy làm ngăn cách thập phân nên
 * ta xuất bằng dấu CHẤM PHẨY — dùng dấu phẩy thì "1,5" bị tách làm hai cột và
 * cả bảng lệch từ đó trở đi.
 */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const body = rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
  // BOM UTF-8: thiếu nó thì Excel đọc tiếng Việt ra ký tự rác.
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-black/30 px-4 py-3">
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
    </div>
  );
}

export default function InventoryAuditPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BrainInventoryImport | null>(null);

  // Nạp giá vốn — luôn xem trước rồi mới ghi.
  const [preview, setPreview] = useState<CostImportPreview | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [costBusy, setCostBusy] = useState(false);
  const [costError, setCostError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ updated: number; skipped: number } | null>(null);

  async function handleUpload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setPreview(null);
    setApplied(null);
    setCostError(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/ai/inventory-audit", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail ?? data.error ?? `Lỗi ${res.status}`);
        return;
      }
      setResult(data as BrainInventoryImport);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function callCost(body: Record<string, unknown>) {
    setCostBusy(true);
    setCostError(null);
    try {
      const res = await fetch("/api/ai/inventory-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit_costs: result?.unit_costs ?? [], ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCostError(data.detail ?? data.error ?? `Lỗi ${res.status}`);
        return null;
      }
      return data;
    } catch (e) {
      setCostError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setCostBusy(false);
    }
  }

  async function handlePreviewCost() {
    setApplied(null);
    const data = await callCost({ dryRun: true });
    if (data) setPreview(data.preview as CostImportPreview);
  }

  async function handleApplyCost() {
    const data = await callCost({ dryRun: false, overwrite });
    if (data) {
      setApplied({ updated: data.updated as number, skipped: data.skipped as number });
      // Xem lại ngay sau khi ghi: con số trên màn hình phải là trạng thái THẬT
      // của cơ sở dữ liệu, không phải thứ ta đoán là đã xảy ra.
      const fresh = await callCost({ dryRun: true });
      if (fresh) setPreview(fresh.preview as CostImportPreview);
    }
  }

  const imp = result?.import;
  const audit = result?.audit;
  const unitCosts = result?.unit_costs ?? [];

  return (
    <div className="flex flex-col gap-5">
      {/* --- chọn file ------------------------------------------------------ */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <h3 className="text-sm font-bold">Kiểm sổ từ file kế toán</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Tải lên bảng <span className="text-zinc-300">Tổng hợp Nhập – Xuất – Tồn</span> xuất từ MISA / Fast / Bravo
          (.xlsx). Xin file Excel gốc, đừng dùng bản in ra PDF — đọc Excel thì chính xác tuyệt đối, còn đọc ảnh bảng số
          tiền thì có lúc nhầm 5 thành 6 ở đúng cột giá vốn.
        </p>
        <p className="mt-2 text-xs text-zinc-500">File chỉ đi qua để đọc, không được lưu lại ở đâu cả.</p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError(null);
            }}
            className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-white/[0.12]"
          />
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || busy}
            className="shrink-0 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {busy ? "Đang đọc và kiểm..." : "Kiểm sổ"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
          <p className="text-sm font-semibold text-red-400">Không kiểm được</p>
          <p className="mt-1 text-sm whitespace-pre-line text-red-300/90">{error}</p>
        </div>
      )}

      {/* --- kết quả đọc file ---------------------------------------------- */}
      {imp && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-zinc-400">
              Kho: <span className="text-white">{imp.warehouse || "—"}</span>
            </span>
            <span className="text-zinc-400">
              Kỳ:{" "}
              <span className="text-white">
                {imp.period_start && imp.period_end ? `${imp.period_start} → ${imp.period_end}` : "—"}
              </span>
            </span>
            <span className="text-zinc-400">
              Đọc được: <span className="text-white">{imp.rows_parsed}</span> mặt hàng
            </span>
          </div>

          {imp.warnings.length > 0 && (
            <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-sm text-amber-400/90">
              {imp.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* --- Brain TỪ CHỐI kiểm --------------------------------------------- */}
      {result?.audit_skipped_reason && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5">
          <p className="text-sm font-bold text-amber-400">Chưa kiểm — không phải &ldquo;sổ sạch&rdquo;</p>
          <p className="mt-1.5 text-sm text-amber-200/90">{result.audit_skipped_reason}</p>

          {imp?.checks?.missing_columns && imp.checks.missing_columns.length > 0 && (
            <p className="mt-3 text-sm text-amber-200/80">
              Thiếu cột: <span className="font-mono">{imp.checks.missing_columns.join(", ")}</span>
            </p>
          )}

          {imp?.checks?.mismatches && imp.checks.mismatches.length > 0 && (
            <div className="mt-3">
              <p className="text-sm text-amber-200/80">
                {imp.checks.mismatches.length} điểm không khớp khi tự kiểm (dấu hiệu bảng bị lệch cột lúc đọc):
              </p>
              <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-amber-100/80">
                {JSON.stringify(imp.checks.mismatches.slice(0, 10), null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* --- nạp giá vốn ----------------------------------------------------- */}
      {unitCosts.length > 0 && (
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] p-5">
          <h3 className="text-sm font-bold">Lấy giá vốn từ file này</h3>
          <p className="mt-1 text-sm text-zinc-400">
            File có giá vốn suy được cho <span className="text-white">{unitCosts.length}</span> mặt hàng. Điền vào cột
            giá vốn đang trống để báo cáo lãi lỗ tính được — hiện phần chưa có giá vốn bị loại khỏi phép tính lãi.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePreviewCost}
              disabled={costBusy}
              className="rounded-xl bg-white/[0.08] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.14] disabled:opacity-50"
            >
              {costBusy && !preview ? "Đang đối chiếu..." : "Xem trước sẽ ghi gì"}
            </button>
          </div>

          {costError && <p className="mt-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{costError}</p>}

          {preview && (
            <div className="mt-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Khớp được" value={preview.counts.matched} tone="text-white" />
                <Stat label="Sẽ điền vào ô trống" value={preview.counts.wouldFill} tone="text-emerald-400" />
                <Stat label="Đã có giá vốn" value={preview.counts.wouldOverwrite} tone="text-amber-400" />
                <Stat label="Không tìm thấy" value={preview.counts.unmatched} tone="text-zinc-400" />
              </div>

              {preview.counts.matched === 0 ? (
                <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                  Không mã nào trong file khớp với danh mục hàng trong ANSER. Nhiều khả năng mã hàng bên phần mềm kế
                  toán khác mã bên ANSER — cần đối chiếu mã trước.
                </p>
              ) : (
                <>
                  <div className="max-h-72 overflow-auto rounded-xl border border-white/[0.08]">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-zinc-950">
                        <tr className="border-b border-white/[0.08] text-xs text-zinc-500 uppercase">
                          <th className="px-4 py-2.5 font-medium">Mã</th>
                          <th className="px-4 py-2.5 font-medium">Tên</th>
                          <th className="px-4 py-2.5 font-medium">Đang có</th>
                          <th className="px-4 py-2.5 font-medium">Sẽ thành</th>
                          <th className="px-4 py-2.5 font-medium">Nguồn</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.matches.map((m) => (
                          <tr key={m.productId} className="border-b border-white/[0.05] last:border-0">
                            <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{m.code}</td>
                            <td className="px-4 py-2.5">
                              {m.name}
                              {m.matchedBy === "name" && (
                                <span
                                  className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-400"
                                  title="Khớp bằng TÊN vì không tìm thấy mã — kém chắc hơn, kiểm lại dòng này"
                                >
                                  khớp theo tên
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-zinc-500">
                              {m.currentCost === null ? "chưa có" : `${vnd(m.currentCost)} ₫`}
                            </td>
                            <td
                              className={`px-4 py-2.5 font-medium ${
                                m.wouldOverwrite && !overwrite ? "text-zinc-600 line-through" : "text-emerald-400"
                              }`}
                            >
                              {vnd(m.newCost)} ₫
                            </td>
                            <td className="px-4 py-2.5 text-xs text-zinc-500">{m.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={overwrite}
                      onChange={(e) => setOverwrite(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-sky-500"
                    />
                    <span className="text-zinc-400">
                      Ghi đè cả những mặt hàng <span className="text-zinc-200">đã có</span> giá vốn
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        Thường KHÔNG nên. Giá vốn dựng dần từ phiếu nhập là giá theo từng lô; giá trong file này là bình
                        quân cả kỳ. Bật ô này là đánh đổi số chính xác lấy số ước lượng.
                      </span>
                    </span>
                  </label>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleApplyCost}
                      disabled={costBusy || (!overwrite && preview.counts.wouldFill === 0)}
                      className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                      {costBusy
                        ? "Đang ghi..."
                        : overwrite
                          ? `Ghi ${preview.counts.matched} mặt hàng`
                          : `Điền ${preview.counts.wouldFill} ô đang trống`}
                    </button>
                    {!overwrite && preview.counts.wouldFill === 0 && (
                      <span className="text-sm text-zinc-500">
                        Mọi mặt hàng khớp được đều đã có giá vốn — không có gì để điền.
                      </span>
                    )}
                  </div>
                </>
              )}

              {applied && (
                <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                  Đã ghi giá vốn cho {applied.updated} mặt hàng
                  {applied.skipped > 0 && `, bỏ qua ${applied.skipped}`}.
                  {preview.counts.stillMissing > 0 && (
                    <span className="mt-1 block text-emerald-300/70">
                      Còn {preview.counts.stillMissing} mặt hàng trong ANSER chưa có giá vốn và cũng không có trong file
                      này.
                    </span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- phát hiện ------------------------------------------------------ */}
      {audit && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h3 className="text-sm font-bold">Phát hiện</h3>
              <span className="text-sm text-zinc-500">
                {audit.findings.length} điểm · kỳ {audit.period.days} ngày
              </span>
            </div>
            {audit.findings.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  downloadCsv(`kiem-so-kho_${imp?.period_end ?? "ket-qua"}.csv`, [
                    ["Kho", imp?.warehouse ?? ""],
                    ["Kỳ", `${imp?.period_start ?? ""} - ${imp?.period_end ?? ""}`],
                    ["Số mặt hàng đã kiểm", imp?.rows_parsed ?? 0],
                    [],
                    ["Mức", "Loại", "Mã", "Tên hàng", "Vấn đề", "Số tiền liên quan", "Đề nghị", "Bằng chứng"],
                    ...audit.findings.map((f) => [
                      f.severity,
                      f.kind,
                      f.code ?? "",
                      f.product ?? "",
                      f.title,
                      f.money_impact ?? "",
                      f.suggestion,
                      JSON.stringify(f.evidence),
                    ]),
                  ])
                }
                className="rounded-xl bg-white/[0.08] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/[0.14]"
              >
                Tải về (.csv)
              </button>
            )}
          </div>

          {audit.warnings.length > 0 && (
            <ul className="flex list-disc flex-col gap-1.5 rounded-xl bg-white/[0.03] p-4 pl-8 text-sm text-zinc-400">
              {audit.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          {audit.findings.length === 0 ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-sm text-emerald-300">
              Đã kiểm hết {imp?.rows_parsed ?? 0} mặt hàng, không thấy điểm nào bất thường.
            </div>
          ) : (
            audit.findings.map((f, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES["thấp"]
                      }`}
                    >
                      {f.severity}
                    </span>
                    <span className="font-mono text-xs text-zinc-500">{f.kind}</span>
                    {f.code && (
                      <span className="font-mono text-xs text-zinc-400">
                        {f.code}
                        {f.product ? ` · ${f.product}` : ""}
                      </span>
                    )}
                  </div>
                  {f.money_impact !== null && (
                    <span className="text-sm font-bold text-white">{vnd(f.money_impact)} ₫</span>
                  )}
                </div>

                <p className="mt-3 text-sm font-medium">{f.title}</p>
                <p className="mt-1.5 text-sm text-zinc-400">{f.suggestion}</p>

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-zinc-500 hover:text-zinc-300">
                    Bằng chứng số
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-xl bg-black/40 p-3 text-xs text-zinc-400">
                    {JSON.stringify(f.evidence, null, 2)}
                  </pre>
                </details>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
