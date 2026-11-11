"use client";

import { useEffect, useState } from "react";
import { AlertTriangleIcon } from "@/components/dashboard/icons";

/**
 * Chỉ báo "AI đang bật hay tắt" ở chân sidebar.
 *
 * VÌ SAO CÓ (15/08/2026). `/api/ai/health` đã tồn tại, có chặn đăng nhập, gọi
 * Brain đúng — và KHÔNG MỘT THÀNH PHẦN NÀO gọi nó. Người dùng không có cách nào
 * biết AI đang chạy hay đã chết; triệu chứng duy nhất là bấm nút rồi chờ mãi.
 *
 * Quan trọng hơn: Brain báo `auth_enabled` để nói nó CÓ đang kiểm token không.
 * Tín hiệu đó dựng ra sau khi phát hiện `docker-compose.yml` đặt sai tên biến
 * và Brain triển khai theo README sẽ không kiểm token nào trong khi vẫn mở ra
 * Internet. Nhưng tín hiệu phát mà không ai nghe thì bằng không — nên nó hiện
 * ở đây, và hiện ĐỎ, vì đó là thứ phải sửa trước khi mở cho người ngoài.
 */

type TrangThai = {
  configured: boolean;
  ok: boolean;
  degraded?: boolean;
  engine_ready?: boolean;
  auth_enabled?: boolean;
  canh_bao?: string | null;
  detail?: string;
};

const CHAM = "inline-block h-2 w-2 shrink-0 rounded-full";

export default function TrangThaiAI() {
  const [tt, setTt] = useState<TrangThai | null>(null);
  const [dangTai, setDangTai] = useState(true);

  useEffect(() => {
    let con_song = true;
    const doc = async () => {
      try {
        const r = await fetch("/api/ai/health", { cache: "no-store" });
        // 401 = chưa đăng nhập; đây là widget phụ, không phải chỗ xử lý phiên.
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as TrangThai;
        if (con_song) setTt(d);
      } catch {
        if (con_song) setTt({ configured: true, ok: false, detail: "Không hỏi được Brain." });
      } finally {
        if (con_song) setDangTai(false);
      }
    };
    doc();
    // Hỏi lại mỗi 60 giây. Brain chết giữa buổi là chuyện có thật, mà người
    // dùng thì không tải lại trang chỉ để kiểm tra.
    const h = setInterval(doc, 60_000);
    return () => {
      con_song = false;
      clearInterval(h);
    };
  }, []);

  if (dangTai) {
    return <p className="text-[11px] text-zinc-500">Đang hỏi trạng thái AI…</p>;
  }
  if (!tt) return null;

  const { mau, chu } = !tt.configured
    ? { mau: "bg-zinc-500", chu: "AI chưa bật" }
    : !tt.ok
      ? { mau: "bg-rose-500", chu: "AI không kết nối được" }
      : tt.degraded
        ? { mau: "bg-amber-400", chu: "AI chạy hạn chế" }
        : { mau: "bg-emerald-400", chu: "AI đang chạy" };

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-[11px] font-semibold text-zinc-300">
        <span className={`${CHAM} ${mau}`} aria-hidden />
        {chu}
      </p>

      {tt.detail && !tt.ok ? (
        <p className="text-[11px] leading-snug text-zinc-500">{tt.detail}</p>
      ) : null}

      {/* Không kiểm token là chuyện BẢO MẬT, nên nó không nằm chung với dòng
          trạng thái ở trên — nó phải cắt ngang tầm mắt. */}
      {tt.ok && tt.auth_enabled === false ? (
        <p className="flex gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] leading-snug text-rose-200">
          <AlertTriangleIcon className="mt-[1px] h-3.5 w-3.5 shrink-0" />
          <span>{tt.canh_bao ?? "Brain đang KHÔNG kiểm token."}</span>
        </p>
      ) : null}

      {/* `undefined` = Brain cũ chưa trả trường này. Nói thẳng là không biết,
          vì im lặng ở đây trông y hệt "đã kiểm rồi". */}
      {tt.ok && tt.auth_enabled === undefined ? (
        <p className="text-[11px] leading-snug text-zinc-500">
          Chưa rõ Brain có kiểm token không (bản Brain cũ).
        </p>
      ) : null}
    </div>
  );
}
