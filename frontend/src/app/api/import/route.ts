import { NextResponse } from "next/server";

import { docExcel } from "@/server/import/doc-excel";
import { apDung, lapKeHoach } from "@/server/import/ap-dung";
import { getSessionUser } from "@/server/session";

// Trần kích thước. Bản xuất thật lớn nhất trong tay: 26KB. 5MB là dư xa, và nó
// tồn tại để một file 500MB không ăn hết bộ nhớ tiến trình — ExcelJS đọc cả
// workbook vào RAM.
const TRAN_BYTE = 5 * 1024 * 1024;

/**
 * POST /api/import — MỘT endpoint, HAI chế độ.
 *
 *   xacNhan != "1"  ->  chỉ ĐỌC và trả kế hoạch (xem trước). Không ghi gì.
 *   xacNhan == "1"  ->  đọc LẠI file rồi ghi.
 *
 * Vì sao bước xác nhận gửi lại FILE chứ không gửi lại các dòng đã đọc: dòng đã
 * đọc mà đi vòng qua trình duyệt thì trình duyệt sửa được. Một lượt xem trước
 * hiền lành rồi một lượt xác nhận mang dữ liệu khác hẳn sẽ ghi thẳng vào DB.
 * Đọc lại file ở máy chủ tốn thêm vài chục mili-giây trên file 25KB, đổi lấy
 * việc máy chủ không bao giờ ghi thứ nó chưa tự đọc.
 */
export async function POST(request: Request) {
  // Ba route AI chặn khách vãng lai, các route CRUD thì chưa (ARCHITECTURE.md
  // §7, hạn chế đã biết). Đường này GHI HÀNG TRĂM DÒNG một lượt nên không thể
  // để ngỏ theo tiền lệ đó.
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Chưa đăng nhập." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ message: "Body phải là multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Thiếu file." }, { status: 400 });
  }
  if (file.size > TRAN_BYTE) {
    return NextResponse.json(
      { message: `File ${(file.size / 1024 / 1024).toFixed(1)}MB, vượt trần 5MB.` },
      { status: 413 },
    );
  }
  if (!/\.xlsx$/i.test(file.name)) {
    return NextResponse.json(
      { message: "Chỉ nhận .xlsx. File .xls đời cũ phải mở bằng Excel rồi lưu lại dạng .xlsx." },
      { status: 400 },
    );
  }

  const xacNhan = String(form.get("xacNhan") ?? "") === "1";
  const warehouseId = String(form.get("warehouseId") ?? "") || undefined;

  let kq;
  try {
    kq = await docExcel(await file.arrayBuffer());
  } catch (e) {
    // Lỗi đọc file là lỗi NGƯỜI DÙNG SỬA ĐƯỢC (sai file, sai định dạng), nên
    // 400 kèm nguyên câu giải thích của bộ đọc chứ không phải 500 trống trơn.
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Không đọc được file." },
      { status: 400 },
    );
  }

  if (!xacNhan) {
    const kh = await lapKeHoach(kq);
    return NextResponse.json({
      loai: kh.loai,
      tenSheet: kq.tenSheet,
      tenFile: file.name,
      dongTieuDe: kq.dongTieuDe,
      canhBao: kh.canhBao,
      tomTat: {
        themMoi: kh.themMoi.length,
        capNhat: kh.capNhat.length,
        khongDoi: kh.khongDoi.length,
        loi: kh.loi.length,
        boQua: kh.boQua.length,
      },
      // Cắt danh sách cho nhẹ phản hồi, nhưng NÓI RA đã cắt bao nhiêu — một
      // bảng im lặng bỏ bớt dòng đọc y như bảng đầy đủ.
      themMoi: kh.themMoi.slice(0, 50).map((m) => m.dong),
      capNhat: kh.capNhat.slice(0, 50).map((m) => ({ dong: m.dong, thayDoi: m.thayDoi })),
      loi: kh.loi.slice(0, 50),
      catBot: {
        themMoi: Math.max(0, kh.themMoi.length - 50),
        capNhat: Math.max(0, kh.capNhat.length - 50),
        loi: Math.max(0, kh.loi.length - 50),
      },
    });
  }

  try {
    const ra = await apDung(kq, warehouseId, user.employeeId ?? undefined);
    return NextResponse.json({ ...ra, loai: kq.loai });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Ghi thất bại." },
      { status: 400 },
    );
  }
}
