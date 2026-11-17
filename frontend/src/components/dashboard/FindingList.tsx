"use client";

import { useState } from "react";
import type { BrainFinding } from "@/server/brain";

/**
 * Hiển thị danh sách phát hiện của Brain.
 *
 * MỘT component cho mọi lớp kiểm — tồn kho, công nợ, thuế suất, đối chiếu hai
 * kỳ — vì Brain trả về cùng một hình dạng (`src/core/findings.py`). Brain thêm
 * phép kiểm mới thì màn hình hiện được ngay, không phải sửa gì ở đây.
 *
 * Hai quy tắc không được vi phạm:
 *
 *  1. `money_impact === null` là "chưa quy ra tiền được", KHÁC hẳn `=== 0`.
 *     Hiện null thành "0đ" là bịa ra một kết luận rằng chuyện này không tốn tiền.
 *  2. "Không có phát hiện" và "chưa kiểm" phải trông khác nhau — nên component
 *     này không tự vẽ trạng thái rỗng, để chỗ gọi quyết định.
 */

const MUC_DO: Record<string, string> = {
  cao: "bg-red-500/15 text-red-400 border-red-500/20",
  "trung bình": "bg-amber-500/15 text-amber-400 border-amber-500/20",
  thấp: "bg-sky-500/15 text-sky-400 border-sky-500/20",
};

export const vnd = (n: number) => n.toLocaleString("vi-VN");

function giaTri(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return vnd(v);
  if (Array.isArray(v)) return v.map(giaTri).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function MotPhatHien({ f }: { f: BrainFinding }) {
  const [mo, setMo] = useState(false);
  const bangChung = Object.entries(f.evidence ?? {});

  return (
    <li className="rounded-xl border border-white/[0.08] bg-black/20">
      <button type="button" onClick={() => setMo((v) => !v)} className="flex w-full items-start gap-3 p-4 text-left">
        <span
          className={`mt-0.5 shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
            MUC_DO[f.severity] ?? MUC_DO["thấp"]
          }`}
        >
          {f.severity}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-zinc-100">{f.title}</span>
          {f.product ? <span className="mt-0.5 block truncate text-xs text-zinc-500">{f.product}</span> : null}
        </span>

        <span className="shrink-0 text-right">
          {f.money_impact === null ? (
            // Nói thẳng là chưa quy ra tiền được, thay vì để trống cho người
            // đọc tự hiểu là không đáng kể.
            <span className="text-xs text-zinc-600" title="Không quy ra tiền được từ dữ liệu hiện có">
              chưa quy ra tiền
            </span>
          ) : (
            <span className="text-sm font-bold text-zinc-200">{vnd(f.money_impact)}đ</span>
          )}
        </span>
      </button>

      {mo ? (
        <div className="space-y-3 border-t border-white/[0.06] px-4 pb-4 pt-3">
          {bangChung.length ? (
            <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {bangChung.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 text-xs">
                  <dt className="text-zinc-500">{k.replace(/_/g, " ")}</dt>
                  <dd className="text-right font-medium text-zinc-300">{giaTri(v)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <p className="rounded-lg bg-white/[0.03] p-3 text-xs leading-relaxed text-zinc-400">{f.suggestion}</p>
        </div>
      ) : null}
    </li>
  );
}

export default function FindingList({ findings }: { findings: BrainFinding[] }) {
  if (!findings.length) return null;
  return (
    <ul className="space-y-2">
      {findings.map((f, i) => (
        <MotPhatHien key={`${f.kind}-${f.code ?? i}-${i}`} f={f} />
      ))}
    </ul>
  );
}

/** Ô số liệu tóm tắt. Dùng chung cho cả hai màn hình mới. */
export function O({
  nhan,
  gia_tri,
  phu,
  tone = "text-zinc-100",
}: {
  nhan: string;
  gia_tri: string;
  phu?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
      <p className={`text-lg font-bold ${tone}`}>{gia_tri}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{nhan}</p>
      {phu ? <p className="mt-1 text-[11px] text-zinc-600">{phu}</p> : null}
    </div>
  );
}

/**
 * Khung chọn file + nút chạy. Ba màn hình dùng chung một kiểu thao tác.
 */
export function KhungTaiFile({
  nhan,
  goiY,
  file,
  onChon,
  onChay,
  busy,
  nhanNut = "Soi ngay",
}: {
  nhan: string;
  goiY: string;
  file: File | null;
  onChon: (f: File | null) => void;
  onChay: () => void;
  busy: boolean;
  nhanNut?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <p className="text-sm font-semibold text-zinc-200">{nhan}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{goiY}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => onChon(e.target.files?.[0] ?? null)}
          className="block w-full max-w-sm text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-zinc-200 hover:file:bg-white/[0.12]"
        />
        <button
          type="button"
          onClick={onChay}
          disabled={!file || busy}
          className="rounded-lg bg-gradient-to-r from-violet-600 to-sky-500 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Đang xử lý…" : nhanNut}
        </button>
      </div>
    </div>
  );
}

/**
 * Trạng thái "Brain TỪ CHỐI kiểm". Phải trông khác hẳn "không có lỗi nào" —
 * đây là chỗ dễ hiểu nhầm nhất và hiểu nhầm thì tin vào một kết luận không có.
 */
export function TuChoiKiem({ lyDo }: { lyDo: string }) {
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
      <p className="text-sm font-semibold text-amber-300">Chưa kiểm được — khác với &ldquo;không có lỗi&rdquo;</p>
      <p className="mt-1.5 text-xs leading-relaxed text-amber-200/70">{lyDo}</p>
    </div>
  );
}
