import { NextResponse } from "next/server";
import { withErrorHandler } from "@/server/http";
import { importProductFile } from "@/server/brain";
import { brainErrorResponse } from "@/server/brainHttp";
import { requireSessionUser } from "@/server/session";
import { layFileTaiLen, truongText } from "@/server/uploadGuard";

/**
 * Đối chiếu thuế suất GTGT của từng mã hàng với quy định hiện hành.
 *
 * Nghị định 174/2025/NĐ-CP bỏ "sản phẩm dầu mỏ tinh chế" — trong đó có dầu mỡ
 * bôi trơn — khỏi danh mục KHÔNG được giảm, hiệu lực 01/7/2025 đến 31/12/2026.
 * Nhiều năm trước nhóm này chịu 10%, nên thói quen cũ đang dẫn tới thuế suất
 * sai trên hoá đơn.
 *
 * Kết quả là ĐỀ XUẤT kèm căn cứ, không phải quyết định thay kế toán — giao diện
 * phải giữ nguyên câu lưu ý đó.
 */
export const POST = withErrorHandler(async (request: Request) => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const kq = await layFileTaiLen(request);
  if (kq instanceof NextResponse) return kq;

  try {
    return NextResponse.json(
      await importProductFile(kq.file, { sheet: truongText(kq.form, "sheet") }),
    );
  } catch (error) {
    return brainErrorResponse(error);
  }
});
