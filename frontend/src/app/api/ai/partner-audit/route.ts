import { NextResponse } from "next/server";
import { withErrorHandler } from "@/server/http";
import { importPartnerFile } from "@/server/brain";
import { brainErrorResponse } from "@/server/brainHttp";
import { requireSessionUser } from "@/server/session";
import { layFileTaiLen, truongText } from "@/server/uploadGuard";

/**
 * Soi công nợ từ Danh sách khách hàng / nhà cung cấp khách xuất từ MISA.
 *
 * Cùng lý do đi đường FILE như /api/ai/inventory-audit: công nợ thật của khách
 * nằm ở phần mềm kế toán họ dùng hằng ngày, không nằm trong ANSER. Soi trên dữ
 * liệu ANSER lúc này chỉ soi được thứ ANSER tự sinh ra.
 *
 * File KHÔNG lưu lại ở đâu — danh sách công nợ lộ ra toàn bộ khách hàng và số
 * tiền từng người đang nợ, đây là dữ liệu nhạy cảm ngang sổ kho.
 */
export const POST = withErrorHandler(async (request: Request) => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const kq = await layFileTaiLen(request);
  if (kq instanceof NextResponse) return kq;

  try {
    return NextResponse.json(
      await importPartnerFile(kq.file, {
        sheet: truongText(kq.form, "sheet"),
        role: truongText(kq.form, "role"),
      }),
    );
  } catch (error) {
    return brainErrorResponse(error);
  }
});
