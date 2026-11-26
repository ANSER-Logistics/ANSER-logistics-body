"use client";

import { useState } from "react";
import type { BrainFinding, BrainPeriodDiff, BrainProductImport } from "@/server/brain";
import FindingList, { KhungTaiFile, O, TuChoiKiem, vnd } from "./FindingList";

/**
 * Cảnh báo sổ sách — hai phép kiểm mà phần mềm kế toán không có.
 *
 * 1. ĐỐI CHIẾU HAI KỲ. Mọi phép kiểm trên MỘT bản báo cáo chỉ bắt được sổ tự
 *    mâu thuẫn với chính nó. Chúng mù trước loại lỗi khác: sổ hôm nay hợp lệ,
 *    sổ tháng trước cũng hợp lệ, nhưng hai bản kể hai câu chuyện khác nhau về
 *    cùng một quãng thời gian. Kỳ dài hơn mà số xuất luỹ kế GIẢM là điều thời
 *    gian không cho phép — một chứng từ đã bị sửa sau khi báo cáo.
 *
 * 2. THUẾ SUẤT DANH MỤC. Nghị định 174/2025 đưa dầu mỡ bôi trơn vào diện được
 *    giảm còn 8% từ 01/7/2025, ngược với thói quen nhiều năm. Cờ thuế để trống
 *    thì phần mềm không tự áp, thuế suất do người nhập chọn tay từng hoá đơn.
 */

type KetQuaDiff = BrainPeriodDiff & {
  imports?: { truoc?: { file_name?: string | null }; sau?: { file_name?: string | null } };
};

export default function BookAuditPanel() {
  const [tab, setTab] = useState<"ky" | "thue">("ky");

  // --- đối chiếu hai kỳ ---
  const [fTruoc, setFTruoc] = useState<File | null>(null);
  const [fSau, setFSau] = useState<File | null>(null);
  const [diff, setDiff] = useState<KetQuaDiff | null>(null);

  // --- thuế suất ---
  const [fThue, setFThue] = useState<File | null>(null);
  const [thue, setThue] = useState<BrainProductImport | null>(null);

  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  async function soHaiKy() {
    if (!fTruoc || !fSau) return;
    setBusy(true);
    setLoi(null);
    setDiff(null);
    const form = new FormData();
    form.append("truoc", fTruoc);
    form.append("sau", fSau);
    try {
      const res = await fetch("/api/ai/period-diff", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoi(data.detail ?? data.error ?? `Lỗi ${res.status}`);
        return;
      }
      setDiff(data as KetQuaDiff);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function soatThue() {
    if (!fThue) return;
    setBusy(true);
    setLoi(null);
    setThue(null);
    const form = new FormData();
    form.append("file", fThue);
    try {
      const res = await fetch("/api/ai/vat-catalog", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoi(data.detail ?? data.error ?? `Lỗi ${res.status}`);
        return;
      }
      setThue(data as BrainProductImport);
      setFThue(null);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const s = thue?.audit?.summary;

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(
          [
            ["ky", "Sổ có bị sửa hồi tố không"],
            ["thue", "Thuế suất từng mã hàng"],
          ] as const
        ).map(([id, nhan]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              tab === id ? "bg-white/[0.10] text-white" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
            }`}
          >
            {nhan}
          </button>
        ))}
      </div>

      {loi ? (
        <p className="rounded-xl border border-red-500/25 bg-red-500/[0.07] p-4 text-sm text-red-300">{loi}</p>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {tab === "ky" ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <p className="text-sm font-semibold text-zinc-200">Hai bản xuất của CÙNG một kỳ</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Cùng ngày bắt đầu, khác ngày kết thúc. Ví dụ bản xuất tháng trước và bản xuất hôm nay, cùng bắt đầu từ
              01/01. Thứ tự quan trọng — bản cũ vào ô bên trái.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["Bản xuất CŨ hơn", fTruoc, setFTruoc],
                  ["Bản xuất MỚI hơn", fSau, setFSau],
                ] as const
              ).map(([nhan, f, set]) => (
                <label key={nhan} className="block">
                  <span className="text-xs font-medium text-zinc-400">{nhan}</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => set(e.target.files?.[0] ?? null)}
                    className="mt-1.5 block w-full text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-zinc-200 hover:file:bg-white/[0.12]"
                  />
                  {f ? <span className="mt-1 block truncate text-[11px] text-zinc-600">{f.name}</span> : null}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={soHaiKy}
              disabled={!fTruoc || !fSau || busy}
              className="mt-4 rounded-lg bg-gradient-to-r from-violet-600 to-sky-500 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Đang so…" : "So hai bản"}
            </button>
          </div>

          {diff?.warnings?.length ? <TuChoiKiem lyDo={diff.warnings.join(" ")} /> : null}

          {diff && diff.summary.so_sánh_được ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <O
                  nhan="Kỳ bắt đầu"
                  gia_tri={diff.summary.kỳ_bắt_đầu ?? "—"}
                  phu={`${diff.summary.bản_trước_đến ?? "?"} → ${diff.summary.bản_sau_đến ?? "?"}`}
                />
                <O nhan="Mã so được" gia_tri={String(diff.summary.số_mã_so_được ?? 0)} />
                <O
                  nhan="Dấu hiệu sửa hồi tố"
                  gia_tri={diff.summary.có_sửa_hồi_tố ? "CÓ" : "Không"}
                  tone={diff.summary.có_sửa_hồi_tố ? "text-red-400" : "text-emerald-400"}
                />
                <O nhan="Tiền liên quan" gia_tri={`${vnd(diff.summary.tổng_tiền_ảnh_hưởng ?? 0)}đ`} />
              </div>

              {diff.findings.length ? (
                <section>
                  <h2 className="mb-3 text-sm font-semibold text-zinc-200">
                    {diff.findings.length} chỗ số liệu đã đổi
                  </h2>
                  <FindingList findings={diff.findings} />
                  <p className="mt-3 rounded-xl bg-white/[0.03] p-3 text-xs leading-relaxed text-zinc-500">
                    Đây là chênh lệch giữa hai lần xuất, không phải kết luận ai làm gì. Cách chặn tận gốc là khoá sổ
                    theo tháng: chốt xong thì không sửa được chứng từ của kỳ đã báo cáo nữa.
                  </p>
                </section>
              ) : (
                <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 text-sm text-emerald-300">
                  Hai bản khớp nhau hoàn toàn ở phần chung — không có chứng từ nào bị sửa sau khi đã báo cáo.
                </p>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {tab === "thue" ? (
        <div className="space-y-5">
          <KhungTaiFile
            nhan="Danh sách hàng hóa, dịch vụ"
            goiY="Xuất từ MISA: Danh mục → Vật tư hàng hóa → Xuất khẩu Excel. Cần có cột 'Giảm 2% thuế suất thuế GTGT'."
            file={fThue}
            onChon={setFThue}
            onChay={soatThue}
            busy={busy}
            nhanNut="Soát thuế suất"
          />

          {thue && !thue.import.ok && thue.audit_skipped_reason ? (
            <TuChoiKiem lyDo={thue.audit_skipped_reason} />
          ) : null}

          {s ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <O nhan="Mã trong danh mục" gia_tri={String(s.số_mã)} />
                <O
                  nhan="Chưa gắn cờ thuế"
                  gia_tri={String(s.chưa_gắn_cờ)}
                  tone={s.chưa_gắn_cờ ? "text-amber-300" : "text-emerald-300"}
                />
                <O nhan="Tra ra diện 8%" gia_tri={String(s["tra_ra_8%"])} tone="text-emerald-300" />
                <O
                  nhan="Cần kế toán xác nhận"
                  gia_tri={String(s.không_tra_được + s["tra_ra_10%"])}
                  tone="text-sky-300"
                />
              </div>

              <p className="rounded-xl border border-white/[0.08] bg-black/20 p-4 text-xs leading-relaxed text-zinc-400">
                Căn cứ: {s.căn_cứ}. Hiệu lực {s.hiệu_lực_từ} → {s.hiệu_lực_đến}.
                <br />
                <span className="text-zinc-500">{s.lưu_ý}</span>
              </p>

              {thue?.audit?.findings.length ? (
                <FindingList findings={thue.audit.findings as BrainFinding[]} />
              ) : (
                <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 text-sm text-emerald-300">
                  Cờ thuế của danh mục khớp với quy định hiện hành.
                </p>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
