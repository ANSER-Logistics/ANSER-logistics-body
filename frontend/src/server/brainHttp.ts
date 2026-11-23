import { BrainError, brainErrorToHttp } from "@/server/brain";
import { jsonError } from "@/server/http";

/**
 * Đổi lỗi gọi Brain thành phản hồi HTTP theo định dạng chung `{ message }` (kèm `kind`,
 * `detail`, `retry_after_s` như trước để giao diện cũ vẫn đọc được).
 *
 * Chỉ xử lý `BrainError` — lỗi đã được phân loại, câu chữ an toàn để hiển thị. Lỗi khác
 * (bug trong code của mình) được ném lại cho `withErrorHandler` → 500 + ghi log, thay vì
 * bị gói thành 502 kèm nguyên câu lỗi nội bộ như trước.
 */
export function brainErrorResponse(error: unknown) {
  if (!(error instanceof BrainError)) throw error;
  const { status, body, headers } = brainErrorToHttp(error);
  return jsonError(body.detail, status, { headers, extra: body });
}
