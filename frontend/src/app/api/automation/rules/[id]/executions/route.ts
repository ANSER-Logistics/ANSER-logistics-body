import { NextResponse } from "next/server";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireAdminUser } from "@/server/session";
import { getRule } from "@/server/store/automation";
import { isN8nApiConfigured, listN8nExecutions } from "@/server/n8nApi";

export const GET = withErrorHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  const rule = await getRule(id);
  if (!rule) {
    return jsonError("Không tìm thấy quy tắc.", 404);
  }
  if (!rule.n8nWorkflowId) {
    return jsonError("Quy tắc chưa liên kết với workflow n8n nào.", 400);
  }
  if (!isN8nApiConfigured()) {
    return jsonError("Chưa cấu hình N8N_API_URL/N8N_API_KEY trong frontend/.env.local.", 400);
  }

  try {
    const executions = await listN8nExecutions(rule.n8nWorkflowId, 10);
    return NextResponse.json({ executions });
  } catch (error) {
    console.error("[api] Không thể tải lịch sử chạy workflow n8n:", error);
    return jsonError("Không thể tải lịch sử chạy workflow n8n. Vui lòng kiểm tra cấu hình.", 502);
  }
});
