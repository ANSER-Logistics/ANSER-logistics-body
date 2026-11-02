import { NextResponse } from "next/server";

// Dùng cho /api/n8n/internal/* — n8n gọi server-to-server, không có cookie đăng nhập của
// người dùng nào cả, nên xác thực bằng token riêng trong header thay vì session.
export function requireInternalToken(request: Request): NextResponse | undefined {
  const expected = process.env.N8N_INTERNAL_TOKEN;
  const actual = request.headers.get("x-internal-token");
  if (!expected || actual !== expected) {
    return NextResponse.json({ message: "Không có quyền truy cập." }, { status: 401 });
  }
  return undefined;
}
