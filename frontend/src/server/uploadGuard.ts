import { NextResponse } from "next/server";

/**
 * Lấy file từ multipart request và chặn sớm theo kích thước.
 *
 * Bốn route /api/ai/* đều nhận .xlsx của khách theo cùng một cách. Viết lại
 * bốn lần thì đến lần thứ ba sẽ có một chỗ quên kiểm kích thước — và chỗ quên
 * đó không bao giờ lộ ra trong lúc dùng bình thường.
 *
 * Trả về `File` khi hợp lệ, hoặc `NextResponse` đã sẵn sàng trả cho client.
 */

// Khớp MAX_UPLOAD_BYTES mặc định bên Brain (src/api/dependencies.py). Chặn ở
// đây để khỏi đẩy file to qua mạng nội bộ rồi mới nhận 413 từ Brain.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function layFileTaiLen(
  request: Request,
  { truong = "file" }: { truong?: string } = {},
): Promise<{ file: File; form: FormData } | NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: `Cần gửi dạng multipart/form-data kèm trường '${truong}'` }, { status: 400 });
  }

  const file = form.get(truong);
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Chưa chọn file" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return NextResponse.json({ error: `File quá lớn (${mb}MB, tối đa 5MB)` }, { status: 413 });
  }
  return { file, form };
}

/** Đọc một trường text tuỳ chọn của form; rỗng thì trả `undefined`. */
export function truongText(form: FormData, ten: string): string | undefined {
  const v = form.get(ten);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
