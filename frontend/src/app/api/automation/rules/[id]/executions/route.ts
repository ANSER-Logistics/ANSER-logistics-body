import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/session";
import { getRule } from "@/server/store/automation";
import { isN8nApiConfigured, listN8nExecutions } from "@/server/n8nApi";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  const rule = await getRule(id);
  if (!rule) {
    return NextResponse.json({ message: "Không tìm thấy quy tắc." }, { status: 404 });
  }
  if (!rule.n8nWorkflowId) {
    return NextResponse.json({ message: "Quy tắc chưa liên kết với workflow n8n nào." }, { status: 400 });
  }
  if (!isN8nApiConfigured()) {
    return NextResponse.json(
      { message: "Chưa cấu hình N8N_API_URL/N8N_API_KEY trong frontend/.env.local." },
      { status: 400 },
    );
  }

  try {
    const executions = await listN8nExecutions(rule.n8nWorkflowId, 10);
    return NextResponse.json({ executions });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Lỗi không xác định." },
      { status: 502 },
    );
  }
}
