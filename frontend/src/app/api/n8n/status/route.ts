import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/session";

// n8n mặc định có endpoint /healthz không cần xác thực — dùng để hiện pill trạng thái
// kết nối trên trang Tự động hoá, giống ANSER Flask.
export async function GET() {
  const { response } = await requireSessionUser();
  if (response) return response;

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const apiConfigured = Boolean(process.env.N8N_API_URL && process.env.N8N_API_KEY);
  if (!webhookUrl) {
    return NextResponse.json({ configured: false, connected: false, apiConfigured });
  }

  const base = webhookUrl.replace(/\/webhook\/?$/, "");

  try {
    const res = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2000) });
    return NextResponse.json({ configured: true, connected: res.ok, apiConfigured });
  } catch {
    return NextResponse.json({ configured: true, connected: false, apiConfigured });
  }
}
