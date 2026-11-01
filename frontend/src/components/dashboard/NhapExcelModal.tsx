"use client";

// Nhập Excel HAI BƯỚC — chọn file, xem trước, rồi mới xác nhận.
//
// Bước xem trước không phải để cho đẹp. Bản xuất MISA thật (đo 23/08/2026) có:
// một dòng "Tổng cộng" không mã, một dòng có mã mà bỏ trống tên, và hai mặt
// hàng tồn kho ÂM. Nhập thẳng thì ba loại đó hoặc lặng lẽ trôi vào cơ sở dữ
// liệu, hoặc làm gãy giữa chừng. Ở đây chúng hiện thành ba nhóm rõ ràng và
// người quyết có ghi hay không.

import { useState } from "react";
import { XIcon } from "@/components/dashboard/icons";

type Dong = {
  dongExcel: number;
  code: string;
  name: string;
  stock?: number;
  cost?: number | null;
  unit?: string;
  taxCode?: string;
  loi: string[];
  canhBao: string[];
};
type ThayDoi = { truong: string; cu: unknown; moi: unknown };

type XemTruoc = {
  loai: "hang_hoa" | "khach_hang" | "nha_cung_cap";
  tenFile: string;
  tenSheet: string;
  dongTieuDe: number;
  canhBao: string[];
  tomTat: { themMoi: number; capNhat: number; khongDoi: number; loi: number; boQua: number };
  themMoi: Dong[];
  capNhat: Array<{ dong: Dong; thayDoi: ThayDoi[] }>;
  loi: Dong[];
  catBot: { themMoi: number; capNhat: number; loi: number };
};

const TEN_LOAI: Record<XemTruoc["loai"], string> = {
  hang_hoa: "Danh mục hàng hoá",
  khach_hang: "Danh sách khách hàng",
  nha_cung_cap: "Danh sách nhà cung cấp",
};

function hienGiaTri(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Có" : "Không";
  if (typeof v === "number") return v.toLocaleString("vi-VN");
  return String(v);
}

export default function NhapExcelModal({
  dong,
  khoList,
  onXong,
}: {
  dong: () => void;
  khoList: Array<{ id: string; name: string }>;
  onXong: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [warehouseId, setWarehouseId] = useState(khoList[0]?.id ?? "");
  const [xem, setXem] = useState<XemTruoc | null>(null);
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [xong, setXong] = useState<{ them: number; sua: number; boQua: number } | null>(null);

  async function gui(xacNhan: boolean) {
    if (!file) return;
    setDangChay(true);
    setLoi(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (xacNhan) fd.append("xacNhan", "1");
      if (warehouseId) fd.append("warehouseId", warehouseId);
      const r = await fetch("/api/import", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) {
        setLoi(j.message ?? "Không xử lý được file.");
        return;
      }
      if (xacNhan) {
        setXong({ them: j.them, sua: j.sua, boQua: j.boQua });
        onXong();
      } else {
        setXem(j as XemTruoc);
      }
    } catch (e) {
      setLoi(e instanceof Error ? e.message : String(e));
    } finally {
      setDangChay(false);
    }
  }

  const canKho = xem?.loai === "hang_hoa";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-white/[0.08] bg-zinc-950 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Nhập từ Excel</h2>
          <button onClick={dong} className="rounded-lg p-1 text-zinc-400 hover:text-white">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {loi && (
            <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{loi}</p>
          )}

          {xong ? (
            <div className="rounded-xl bg-emerald-500/10 p-5 text-sm text-emerald-300">
              <p className="font-bold">Đã nhập xong.</p>
              <p className="mt-2">
                Thêm mới <b>{xong.them}</b> · cập nhật <b>{xong.sua}</b> · bỏ qua{" "}
                <b>{xong.boQua}</b>.
              </p>
            </div>
          ) : !xem ? (
            <>
              <p className="mb-4 text-sm leading-relaxed text-zinc-400">
                Nhận bản xuất <b>.xlsx</b> của MISA: <i>Danh sách hàng hoá, dịch vụ</i>,{" "}
                <i>Danh sách khách hàng</i>, <i>Danh sách nhà cung cấp</i>. Giữ nguyên các
                cột gốc, đừng xoá dòng tiêu đề.
              </p>
              <p className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-300">
                Bảng <i>Tổng hợp tồn kho</i> có tiêu đề hai tầng nên đi đường khác — dùng
                mục Kiểm kho, không phải nút này.
              </p>
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setLoi(null);
                }}
                className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white focus:border-sky-500"
              />
            </>
          ) : (
            <>
              <div className="mb-4 rounded-xl border border-white/[0.08] bg-black/20 p-4 text-sm">
                <p className="font-bold">{TEN_LOAI[xem.loai]}</p>
                <p className="mt-1 text-xs text-zinc-400">
                  {xem.tenFile} · sheet “{xem.tenSheet}” · tiêu đề ở dòng {xem.dongTieuDe}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-emerald-400">
                    Thêm mới {xem.tomTat.themMoi}
                  </span>
                  <span className="rounded-lg bg-sky-500/15 px-2.5 py-1 text-sky-400">
                    Cập nhật {xem.tomTat.capNhat}
                  </span>
                  <span className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-zinc-400">
                    Không đổi {xem.tomTat.khongDoi}
                  </span>
                  <span className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-zinc-400">
                    Bỏ qua {xem.tomTat.boQua}
                  </span>
                  {xem.tomTat.loi > 0 && (
                    <span className="rounded-lg bg-red-500/15 px-2.5 py-1 text-red-400">
                      Lỗi {xem.tomTat.loi}
                    </span>
                  )}
                </div>
              </div>

              {canKho && (
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
                    Nhập vào kho — bản xuất danh mục của MISA không có cột kho
                  </label>
                  <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                  >
                    {khoList.map((k) => (
                      <option key={k.id} value={k.id}>{k.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {xem.tomTat.loi > 0 && (
                <Bang
                  tieuDe={`${xem.tomTat.loi} dòng KHÔNG nhập được`}
                  mau="text-red-400"
                  catBot={xem.catBot.loi}
                >
                  {xem.loi.map((d) => (
                    <tr key={d.dongExcel} className="border-t border-white/[0.05]">
                      <td className="py-2 pr-3 text-zinc-500">dòng {d.dongExcel}</td>
                      <td className="py-2 pr-3">{d.code || "—"}</td>
                      <td className="py-2 pr-3">{d.name || "—"}</td>
                      <td className="py-2 text-red-400">{d.loi.join(", ")}</td>
                    </tr>
                  ))}
                </Bang>
              )}

              {xem.capNhat.length > 0 && (
                <Bang
                  tieuDe={`${xem.tomTat.capNhat} dòng sẽ được CẬP NHẬT`}
                  mau="text-sky-400"
                  catBot={xem.catBot.capNhat}
                >
                  {xem.capNhat.map((m) => (
                    <tr key={m.dong.dongExcel} className="border-t border-white/[0.05] align-top">
                      <td className="py-2 pr-3 text-zinc-500">dòng {m.dong.dongExcel}</td>
                      <td className="py-2 pr-3">{m.dong.code}</td>
                      <td className="py-2 pr-3">{m.dong.name}</td>
                      <td className="py-2">
                        {m.thayDoi.map((t) => (
                          <div key={t.truong} className="text-xs">
                            <span className="text-zinc-400">{t.truong}: </span>
                            <span className="text-zinc-500 line-through">{hienGiaTri(t.cu)}</span>
                            <span className="text-zinc-500"> → </span>
                            <span className="text-sky-300">{hienGiaTri(t.moi)}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </Bang>
              )}

              {xem.themMoi.length > 0 && (
                <Bang
                  tieuDe={`${xem.tomTat.themMoi} dòng sẽ được THÊM MỚI`}
                  mau="text-emerald-400"
                  catBot={xem.catBot.themMoi}
                >
                  {xem.themMoi.map((d) => (
                    <tr key={d.dongExcel} className="border-t border-white/[0.05]">
                      <td className="py-2 pr-3 text-zinc-500">dòng {d.dongExcel}</td>
                      <td className="py-2 pr-3">{d.code}</td>
                      <td className="py-2 pr-3">{d.name}</td>
                      <td className="py-2 text-xs text-amber-400">
                        {d.canhBao.length ? d.canhBao.join(", ") : ""}
                      </td>
                    </tr>
                  ))}
                </Bang>
              )}
            </>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-3 border-t border-white/[0.06] pt-4">
          <button
            onClick={dong}
            className="rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-white/[0.04]"
          >
            {xong ? "Đóng" : "Huỷ"}
          </button>
          {!xong && !xem && (
            <button
              disabled={!file || dangChay}
              onClick={() => gui(false)}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black disabled:opacity-40"
            >
              {dangChay ? "Đang đọc…" : "Xem trước"}
            </button>
          )}
          {!xong && xem && (
            <button
              disabled={dangChay || (xem.tomTat.themMoi + xem.tomTat.capNhat === 0)}
              onClick={() => gui(true)}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black disabled:opacity-40"
            >
              {dangChay
                ? "Đang ghi…"
                : `Xác nhận ghi ${xem.tomTat.themMoi + xem.tomTat.capNhat} dòng`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Bang({
  tieuDe, mau, catBot, children,
}: {
  tieuDe: string; mau: string; catBot: number; children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <p className={`mb-2 text-sm font-bold ${mau}`}>{tieuDe}</p>
      <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-left text-sm">
          <tbody>{children}</tbody>
        </table>
      </div>
      {catBot > 0 && (
        // Nói ra phần bị cắt. Một bảng lặng lẽ hiển thị 50 dòng đầu trông y hệt
        // một bảng đầy đủ, và người đọc sẽ tin là đã xem hết.
        <p className="mt-1.5 text-xs text-zinc-500">…và {catBot} dòng nữa không hiện ở đây.</p>
      )}
    </div>
  );
}
