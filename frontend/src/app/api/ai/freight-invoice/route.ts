import { NextResponse } from "next/server";
import { brainErrorToHttp, readFreightInvoice } from "@/server/brain";
import { getSessionUser } from "@/server/session";

/**
 * Đọc ảnh hoá đơn cước của nhà xe.
 *
 * Con số VLM đọc ra CHƯA đáng tin. Brain tính lại toàn bộ bằng code thuần rồi
 * đối chiếu với số in trên tờ giấy, và trả `needs_manual_review` khi không xác
 * nhận được — bao gồm cả trường hợp ảnh mờ đọc ra rỗng. Giao diện phải hiện cờ
 * đó chứ không được lặng lẽ dùng số.
 *
 * Ảnh KHÔNG lưu lại: đi qua để đọc rồi thả.
 */

// Ảnh chụp điện thoại thường 3–8MB, nặng hơn tài liệu. Khớp MAX_UPLOAD_BYTES
// mặc định bên Brain; ảnh to hơn thì người dùng cần giảm chất lượng trước.
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Cần gửi dạng multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Chưa chọn ảnh" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error:
          `Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB, tối đa 5MB). ` +
          "Chụp lại ở chế độ chất lượng thấp hơn, hoặc gửi ảnh đã nén.",
      },
      { status: 413 },
    );
  }
  // Kiểm nhẹ tay: điện thoại đôi khi không gắn MIME. Có gắn mà sai loại thì chặn.
  if (file.type && !ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: `Chưa đọc được định dạng ${file.type}. Gửi ảnh JPG hoặc PNG.` }, { status: 400 });
  }

  try {
    return NextResponse.json(await readFreightInvoice(file));
  } catch (error) {
    const { status, body, headers } = brainErrorToHttp(error);
    return NextResponse.json(body, { status, headers });
  }
}
