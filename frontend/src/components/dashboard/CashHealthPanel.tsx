"use client";

import { useMemo, useState } from "react";
import type { BrainInventoryImport, BrainPartnerImport } from "@/server/brain";
import FindingList, { KhungTaiFile, O, TuChoiKiem, vnd } from "./FindingList";

/**
 * Sức khoẻ dòng tiền — tiền của mình đang nằm ở đâu.
 *
 * VÌ SAO MÀN HÌNH NÀY TỒN TẠI
 * ---------------------------
 * Với một nhà phân phối, tiền nằm ở KHÁCH thường nhiều hơn tiền nằm ở KHO. Số
 * thật của khách đầu tiên: phải thu 3,96 tỷ so với tồn kho 2,87 tỷ, và hai
 * khách lớn nhất giữ 56% phần chưa về. Phần mềm kế toán trình bày công nợ dưới
 * dạng danh sách — danh sách không làm ai giật mình, một tỷ lệ phần trăm thì có.
 *
 * Ba con số tuyệt đối (phải thu, tồn kho, phải trả) khó cảm nhận. Quy về SỐ
 * NGÀY thì đọc được ngay: "tiền bán hàng phải chờ 113 ngày mới về" là câu mà
 * chủ doanh nghiệp hiểu không cần giải thích.
 */

const NGAY_MOT_KY = 365;

export default function CashHealthPanel() {
  const [fileDoiTac, setFileDoiTac] = useState<File | null>(null);
  const [fileKho, setFileKho] = useState<File | null>(null);
  const [busy, setBusy] = useState<"" | "doi_tac" | "kho">("");
  const [loi, setLoi] = useState<string | null>(null);

  const [khach, setKhach] = useState<BrainPartnerImport | null>(null);
  const [ncc, setNcc] = useState<BrainPartnerImport | null>(null);
  const [kho, setKho] = useState<BrainInventoryImport | null>(null);

  async function taiDoiTac() {
    if (!fileDoiTac) return;
    setBusy("doi_tac");
    setLoi(null);
    const form = new FormData();
    form.append("file", fileDoiTac);
    try {
      const res = await fetch("/api/ai/partner-audit", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoi(data.detail ?? data.error ?? `Lỗi ${res.status}`);
        return;
      }
      const kq = data as BrainPartnerImport;
      // Brain tự nhận ra file là khách hàng hay nhà cung cấp từ tiêu đề — người
      // dùng không phải chọn, và cũng không chọn nhầm được.
      if (kq.import.role === "nhà cung cấp") setNcc(kq);
      else setKhach(kq);
      setFileDoiTac(null);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function taiKho() {
    if (!fileKho) return;
    setBusy("kho");
    setLoi(null);
    const form = new FormData();
    form.append("file", fileKho);
    try {
      const res = await fetch("/api/ai/inventory-audit", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoi(data.detail ?? data.error ?? `Lỗi ${res.status}`);
        return;
      }
      setKho(data as BrainInventoryImport);
      setFileKho(null);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  /**
   * Giá vốn mỗi ngày, suy từ tổng giá trị XUẤT KHO chia số ngày của kỳ.
   *
   * Đây là mẫu số để quy mọi thứ ra "số ngày". Không có bảng tồn kho thì trả
   * `null` và mọi con số ngày biến mất khỏi giao diện — thà thiếu còn hơn chia
   * cho một số tự bịa.
   */
  const giaVonNgay = useMemo(() => {
    if (!kho?.import.ok) return null;
    const tongXuat = kho.import.lines.reduce((s, l) => s + (l.out_value ?? 0), 0);
    const { period_start: t, period_end: d } = kho.import;
    if (!t || !d || tongXuat <= 0) return null;
    const ngay = Math.round((Date.parse(d) - Date.parse(t)) / 86_400_000);
    if (!Number.isFinite(ngay) || ngay <= 0 || ngay > NGAY_MOT_KY * 3) return null;
    return tongXuat / ngay;
  }, [kho]);

  const tonKho = useMemo(
    () => (kho?.import.ok ? kho.import.lines.reduce((s, l) => s + (l.closing_value ?? 0), 0) : null),
    [kho],
  );

  const phaiThu = khach?.audit?.summary.tổng_phải_thu ?? null;
  const phaiTra = ncc?.audit?.summary.tổng_phải_trả ?? null;

  const ket = phaiThu !== null && tonKho !== null ? phaiThu + tonKho - (phaiTra ?? 0) : null;

  const ngay = (v: number | null) =>
    v !== null && giaVonNgay ? `${(v / giaVonNgay).toFixed(0)} ngày giá vốn` : undefined;

  const phatHien = [...(khach?.audit?.findings ?? []), ...(ncc?.audit?.findings ?? [])];
  const chuaCoGi = !khach && !ncc && !kho;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <KhungTaiFile
          nhan="Danh sách khách hàng / nhà cung cấp"
          goiY="Xuất từ MISA: Danh mục → Khách hàng (và Nhà cung cấp) → Xuất khẩu Excel. Tải lần lượt hai file — hệ thống tự nhận ra file nào là gì."
          file={fileDoiTac}
          onChon={setFileDoiTac}
          onChay={taiDoiTac}
          busy={busy === "doi_tac"}
        />
        <KhungTaiFile
          nhan="Bảng tổng hợp tồn kho (không bắt buộc)"
          goiY="Có bảng này thì quy được mọi con số ra SỐ NGÀY — cách duy nhất để biết 3,9 tỷ phải thu là nhiều hay ít. Không có thì vẫn xem được số tuyệt đối."
          file={fileKho}
          onChon={setFileKho}
          onChay={taiKho}
          busy={busy === "kho"}
          nhanNut="Nạp tồn kho"
        />
      </div>

      {loi ? (
        <p className="rounded-xl border border-red-500/25 bg-red-500/[0.07] p-4 text-sm text-red-300">{loi}</p>
      ) : null}

      {khach && !khach.import.ok && khach.audit_skipped_reason ? (
        <TuChoiKiem lyDo={khach.audit_skipped_reason} />
      ) : null}

      {chuaCoGi ? (
        <p className="rounded-2xl border border-dashed border-white/[0.10] p-8 text-center text-sm text-zinc-500">
          Chưa có dữ liệu. Tải danh sách khách hàng lên để bắt đầu.
        </p>
      ) : null}

      {phaiThu !== null || tonKho !== null ? (
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h2 className="text-sm font-semibold text-zinc-200">Tiền đang nằm ở đâu</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <O
              nhan="Khách đang nợ mình"
              gia_tri={phaiThu === null ? "—" : `${vnd(Math.round(phaiThu))}đ`}
              phu={ngay(phaiThu)}
              tone="text-amber-300"
            />
            <O
              nhan="Hàng nằm trong kho"
              gia_tri={tonKho === null ? "—" : `${vnd(Math.round(tonKho))}đ`}
              phu={ngay(tonKho)}
              tone="text-sky-300"
            />
            <O
              nhan="Mình đang nợ nhà cung cấp"
              gia_tri={phaiTra === null ? "—" : `${vnd(Math.round(phaiTra))}đ`}
              phu={ngay(phaiTra)}
              tone="text-emerald-300"
            />
            <O
              nhan="Vốn lưu động bị kẹt"
              gia_tri={ket === null ? "—" : `${vnd(Math.round(ket))}đ`}
              phu={ket !== null ? ngay(ket) : undefined}
              tone="text-red-300"
            />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-zinc-500">
            Vốn kẹt = khách nợ mình + hàng trong kho − mình nợ nhà cung cấp. Đây là phần tiền đã bỏ ra mà chưa quay về
            tài khoản.
            {giaVonNgay
              ? " Số ngày quy theo giá vốn bán ra mỗi ngày của chính kỳ trong bảng tồn kho."
              : " Nạp thêm bảng tồn kho để quy ra số ngày."}
          </p>
        </section>
      ) : null}

      {khach?.audit?.summary.không_phân_tích_được?.length ? (
        <section className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Những thứ dữ liệu này chưa cho biết
          </h2>
          <ul className="mt-2 space-y-1.5">
            {khach.audit.summary.không_phân_tích_được.map((t) => (
              <li key={t} className="text-xs leading-relaxed text-zinc-500">
                • {t}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {phatHien.length ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">{phatHien.length} điểm cần xem — nặng trước</h2>
          <FindingList findings={phatHien} />
        </section>
      ) : khach?.import.ok ? (
        <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 text-sm text-emerald-300">
          Không có điểm nào bất thường trong danh sách công nợ.
        </p>
      ) : null}
    </div>
  );
}
