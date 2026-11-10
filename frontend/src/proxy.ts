import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, verifyToken } from "@/server/auth";

// Chỉ kiểm tra token hợp lệ (không tra DB) để nhẹ — chặn khách chưa đăng nhập vào /dashboard.
// Kiểm tra quyền chi tiết (role, 401/403 theo route) vẫn nằm ở từng Route Handler, không chỉ
// dựa vào proxy này (xem src/server/session.ts: requireSessionUser/requireAdminUser).
export function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
