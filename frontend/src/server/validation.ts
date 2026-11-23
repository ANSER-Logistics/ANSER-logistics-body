import type { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/server/http";

type ParseResult<T> = { data: T; response?: undefined } | { data?: undefined; response: NextResponse };

/**
 * Câu báo lỗi mặc định khi schema KHÔNG tự đặt câu riêng cho trường đó. Schema nên đặt câu
 * riêng cho mọi trường người dùng nhập (`z.string({ error: "Thiếu tên kho." })`) — đây chỉ là
 * lưới an toàn để không bao giờ lọt câu tiếng Anh mặc định của zod ra giao diện.
 */
function fallbackMessage(issue: z.core.$ZodRawIssue): string {
  const field = issue.path?.length ? issue.path.join(".") : "";
  if (!field) return "Dữ liệu gửi lên không hợp lệ.";
  if (issue.code === "invalid_type" && issue.input === undefined) return `Thiếu trường "${field}".`;
  return `Trường "${field}" không hợp lệ.`;
}

/** Kiểm tra một giá trị bất kỳ theo schema; lỗi → `400 { message }` với câu của lỗi đầu tiên. */
export function validate<S extends z.ZodType>(schema: S, input: unknown): ParseResult<z.output<S>> {
  const result = schema.safeParse(input, { error: fallbackMessage });
  if (!result.success) {
    return { response: jsonError(result.error.issues[0]?.message ?? "Dữ liệu gửi lên không hợp lệ.", 400) };
  }
  return { data: result.data };
}

/**
 * Đọc body JSON của request rồi kiểm tra theo schema zod. Dùng giống `requireSessionUser()`:
 *
 *   const { data, response } = await parseJsonBody(request, schema);
 *   if (response) return response;
 *
 * Body không phải JSON hợp lệ hoặc sai schema → `400 { message }` tiếng Việt.
 */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<ParseResult<z.output<S>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: jsonError("Dữ liệu gửi lên phải là JSON hợp lệ.", 400) };
  }
  return validate(schema, raw);
}

// ---------------------------------------------------------------------------
// Các kiểu trường dùng chung. Giữ đúng quy ước sẵn có của app:
//   - Tạo mới: chuỗi rỗng ""  = "không nhập" → `undefined`.
//   - PATCH:   không gửi      = "không đổi"  → `undefined`;
//              gửi "" / null  = "xoá giá trị" → `null`.
// ---------------------------------------------------------------------------

/** Chuỗi bắt buộc, đã trim, không được rỗng. */
export function requiredText(message: string) {
  return z.string({ error: message }).trim().min(1, message);
}

/** Chuỗi tuỳ chọn khi TẠO MỚI: rỗng/null → `undefined`. */
export function optionalText(label: string) {
  return z
    .string({ error: `${label} phải là chuỗi ký tự.` })
    .trim()
    .nullish()
    .transform((v) => v || undefined);
}

/** Chuỗi tuỳ chọn khi PATCH: không gửi → `undefined`, rỗng/null → `null`. */
export function nullableText(label: string) {
  return z
    .string({ error: `${label} phải là chuỗi ký tự.` })
    .trim()
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null));
}

const EMAIL_MESSAGE = "Email không hợp lệ.";
const PHONE_MESSAGE = "Số điện thoại không hợp lệ.";
// Chấp nhận cách viết thường gặp ở VN: "0912 345 678", "+84-912.345.678", "(028) 3812 3456".
const PHONE_PATTERN = /^\+?[0-9\s().-]{8,20}$/;

/** Email bắt buộc. */
export function requiredEmail(missingMessage: string) {
  return requiredText(missingMessage).pipe(z.email(EMAIL_MESSAGE));
}

/** Email tuỳ chọn (tạo mới). */
export function optionalEmail(message = EMAIL_MESSAGE) {
  return optionalText("Email").pipe(z.email(message).optional());
}

/** Email tuỳ chọn (PATCH, "" → null). */
export function nullableEmail(message = EMAIL_MESSAGE) {
  return nullableText("Email").pipe(z.email(message).nullish());
}

/** Số điện thoại tuỳ chọn (tạo mới). */
export function optionalPhone() {
  return optionalText("Số điện thoại").pipe(z.string().regex(PHONE_PATTERN, PHONE_MESSAGE).optional());
}

/** Số điện thoại tuỳ chọn (PATCH, "" → null). */
export function nullablePhone() {
  return nullableText("Số điện thoại").pipe(z.string().regex(PHONE_PATTERN, PHONE_MESSAGE).nullish());
}

/**
 * Số nhận cả dạng `5` lẫn `"5"` (form HTML luôn gửi chuỗi). Chuỗi rỗng KHÔNG thành 0 —
 * `Number("") === 0` là cái bẫy từng làm giá vốn bị ghi thành 0 (xem inventory/transactions).
 */
export function numberLike(message: string) {
  return z
    .union([
      z.number({ error: message }),
      z.string({ error: message }).trim().min(1, message).transform(Number),
    ], { error: message }) // câu riêng phải đặt ở cấp union, không thì zod trả lỗi `invalid_union` chung
    .pipe(z.number({ error: message }));
}

/** Ngày dạng chuỗi (ISO / "YYYY-MM-DD") cho PATCH: không gửi → `undefined`, rỗng/null → `null`. */
export function nullableDate(message: string) {
  return nullableText("Ngày").pipe(
    z
      .string()
      .nullish()
      .transform((v, ctx) => {
        if (v === undefined || v === null) return v;
        const date = new Date(v);
        if (Number.isNaN(date.getTime())) {
          ctx.addIssue({ code: "custom", message });
          return z.NEVER;
        }
        return date;
      }),
  );
}
