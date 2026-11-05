import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyToken } from "@/server/auth";
import { findUserById, type User } from "@/server/store/users";

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return undefined;
  return findUserById(payload.sub);
}

export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return undefined;
  return user;
}

type AuthResult = { user: User; response?: undefined } | { user?: undefined; response: NextResponse };

// Dùng ở đầu mọi route cần "đã đăng nhập" — `if (result.response) return result.response;`
// tránh lặp lại cùng khối kiểm tra 401 ở từng route (xem Việc 2 — Siết xác thực & phân quyền).
export async function requireSessionUser(): Promise<AuthResult> {
  const user = await getSessionUser();
  if (!user) {
    return { response: NextResponse.json({ message: "Chưa đăng nhập." }, { status: 401 }) };
  }
  return { user };
}

// Như trên nhưng còn bắt buộc role "admin" — trả 403 nếu đã đăng nhập mà không đủ quyền.
export async function requireAdminUser(): Promise<AuthResult> {
  const result = await requireSessionUser();
  if (result.response) return result;
  if (result.user.role !== "admin") {
    return { response: NextResponse.json({ message: "Không có quyền truy cập." }, { status: 403 }) };
  }
  return result;
}
