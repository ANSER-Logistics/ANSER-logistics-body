import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";

/**
 * Định dạng lỗi DUY NHẤT của mọi route `/api/**`: `{ message: string }` — giao diện đọc
 * `data.message` để hiện cho người dùng, nên `message` luôn là câu tiếng Việt đọc được.
 * Được phép kèm thêm trường phụ (vd. `kind` của lỗi Brain) nhưng không bao giờ thiếu `message`.
 */
export type ApiErrorBody = { message: string };

export function jsonError(
  message: string,
  status: number,
  options: { headers?: HeadersInit; extra?: Record<string, unknown> } = {},
) {
  return NextResponse.json({ ...options.extra, message }, { status, headers: options.headers });
}

/**
 * Ném ra từ bất kỳ đâu bên trong handler đã bọc `withErrorHandler` để trả ngay một lỗi
 * "biết trước" (4xx/5xx có chủ đích) mà không phải truyền `NextResponse` ngược lên từng tầng.
 * `message` sẽ đi thẳng tới người dùng — chỉ viết câu tiếng Việt an toàn để hiển thị.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const INTERNAL_ERROR_MESSAGE = "Lỗi hệ thống, vui lòng thử lại sau.";

/**
 * Bọc một Route Handler: lỗi không lường trước → `500 { message }` chung chung + ghi log
 * đầy đủ ở server. Chi tiết lỗi (stack, câu lỗi SQL, địa chỉ nội bộ…) KHÔNG bao giờ ra ngoài.
 *
 *   export const GET = withErrorHandler(async (request: Request) => { ... });
 *
 * Lỗi nội bộ của Next (redirect, notFound, dynamic rendering bail-out) được ném lại nguyên
 * vẹn — nuốt chúng sẽ làm hỏng cơ chế render của Next.
 */
export function withErrorHandler<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      unstable_rethrow(error);
      if (error instanceof ApiError) {
        return jsonError(error.message, error.status);
      }
      const request = args[0] instanceof Request ? args[0] : undefined;
      const where = request ? `${request.method} ${new URL(request.url).pathname}` : "unknown route";
      console.error(`[api] Lỗi không lường trước ở ${where}:`, error);
      return jsonError(INTERNAL_ERROR_MESSAGE, 500);
    }
  };
}
