import { cookies } from "next/headers";
import { COOKIE_NAME, verifyToken } from "@/server/auth";
import { findUserById } from "@/server/store/users";

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return undefined;
  return findUserById(payload.sub);
}

// Chỉ trang Nhân sự dùng hàm này — các route khác trong app chưa kiểm tra quyền (xem mục 7
// docs/architecture/ARCHITECTURE.md, hạn chế đã biết).
export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return undefined;
  return user;
}
