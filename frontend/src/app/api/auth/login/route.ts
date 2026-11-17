import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authCookieOptions, COOKIE_NAME, signToken } from "@/server/auth";
import { jsonError, withErrorHandler } from "@/server/http";
import { checkLoginRateLimit } from "@/server/rateLimit";
import { findUserByEmail, toPublicUser } from "@/server/store/users";
import { parseJsonBody, requiredText } from "@/server/validation";

const MISSING = "Thiếu email hoặc mật khẩu.";

// Không kiểm định dạng email ở đây: sai định dạng thì cứ để rơi vào "Email hoặc mật khẩu
// không đúng." — không gợi ý cho người đoán mò biết email nào hợp lệ.
const loginSchema = z.object({
  email: requiredText(MISSING),
  // Mật khẩu KHÔNG trim — khoảng trắng là một phần của mật khẩu.
  password: z.string({ error: MISSING }).min(1, MISSING),
});

export const POST = withErrorHandler(async (request: Request) => {
  const { data, response } = await parseJsonBody(request, loginSchema);
  if (response) return response;
  const { email, password } = data;

  // Giới hạn theo IP + email (không chỉ IP) — tránh 1 IP chia sẻ (NAT văn phòng) bị khoá
  // chung vì 1 người gõ sai mật khẩu nhiều lần.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkLoginRateLimit(`${ip}:${email.toLowerCase()}`)) {
    return jsonError("Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.", 429);
  }

  const user = await findUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return jsonError("Email hoặc mật khẩu không đúng.", 401);
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, signToken(user.id), authCookieOptions);

  return NextResponse.json({ user: toPublicUser(user) });
});
