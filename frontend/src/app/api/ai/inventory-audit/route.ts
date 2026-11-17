import { NextResponse } from "next/server";
import { jsonError, withErrorHandler } from "@/server/http";
import { importInventoryFile } from "@/server/brain";
import { brainErrorResponse } from "@/server/brainHttp";
import { requireSessionUser } from "@/server/session";

/**
 * Kiểm sổ kho từ file Excel khách xuất ra (MISA / Fast / Bravo).
 *
 * Vì sao đi đường FILE chứ không đọc từ DB: sổ kho thật của khách đang nằm ở
 * phần mềm kế toán họ dùng hằng ngày, không phải trong ANSER. Kiểm trên dữ liệu
 * ANSER lúc này chỉ soi được thứ ANSER tự sinh ra — vô nghĩa với người đang cần
 * biết sổ sách hiện tại của mình có gì sai.
 *
 * File KHÔNG được lưu lại ở đâu cả: nhận từ trình duyệt, chuyển thẳng sang
 * Brain, Brain đọc trong bộ nhớ rồi thả. Sổ kho là dữ liệu nhạy cảm nhất của
 * một nhà phân phối — nó lộ ra giá vốn từng mặt hàng.
 */

// Khớp MAX_UPLOAD_BYTES mặc định bên Brain (src/api/dependencies.py). Chặn sớm
// ở đây để khỏi đẩy file to qua mạng nội bộ rồi mới bị Brain từ chối bằng 413.
// Rộng rãi cho việc này: một bảng tổng hợp N-X-T vài trăm dòng chỉ cỡ 50KB.
const MAX_BYTES = 5 * 1024 * 1024;

export const POST = withErrorHandler(async (request: Request) => {
  const { response } = await requireSessionUser();
  if (response) return response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Cần gửi dạng multipart/form-data kèm trường 'file'", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("Chưa chọn file", 400);
  }
  if (file.size > MAX_BYTES) {
    return jsonError(`File quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB, tối đa 5MB)`, 413);
  }

  const sheet = form.get("sheet");

  try {
    const result = await importInventoryFile(file, {
      sheet: typeof sheet === "string" && sheet ? sheet : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return brainErrorResponse(error);
  }
});
